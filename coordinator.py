"""Durable, revision-bound planning workflow. One coordinator owns each run."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from copy import deepcopy
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import threading
import uuid

import connections


def encode(value):
    return json.dumps(value, ensure_ascii=False)


class Store:
    def __init__(self, directory):
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.path = directory/"workspace.sqlite"
        self.lock = threading.RLock()
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("CREATE TABLE IF NOT EXISTS records(kind TEXT,id TEXT,data TEXT,PRIMARY KEY(kind,id))")
            db.commit()

    def read(self, kind, key):
        with closing(sqlite3.connect(self.path)) as db:
            row = db.execute("SELECT data FROM records WHERE kind=? AND id=?", (kind,key)).fetchone()
        if not row:
            raise ValueError("记录不存在。")
        return json.loads(row[0])

    def all(self, kind):
        with closing(sqlite3.connect(self.path)) as db:
            return [json.loads(row[0]) for row in db.execute(
                "SELECT data FROM records WHERE kind=? ORDER BY rowid DESC", (kind,))]

    def put(self, kind, key, data):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("INSERT OR REPLACE INTO records VALUES(?,?,?)", (kind,key,encode(data)))
            db.commit()


def parse_answer(stage, text, digest):
    if not isinstance(text,str) or not text.strip():
        raise ValueError("Agent 返回了空内容。")
    if stage not in ("merge","vote"):
        return {}
    source=text.strip()
    if source.startswith("```") and source.endswith("```"):
        source=source.split("\n",1)[-1][:-3]
    try:
        value=json.loads(source)
    except ValueError:
        raise ValueError("回复缺少有效的 JSON，请重试该参与者。") from None
    if not isinstance(value,dict):
        raise ValueError("回复格式不正确。")
    if stage=="merge":
        if not isinstance(value.get("plan"),str) or not value["plan"].strip() or not isinstance(value.get("question"),str):
            raise ValueError("共同稿缺少正文或取舍字段。")
    elif (value.get("revision") != digest or type(value.get("approve")) is not bool or
          not isinstance(value.get("objection"),str) or value["approve"] == bool(value["objection"].strip())):
        raise ValueError("签认版本或异议字段无效，需要重新确认。")
    return value


class Coordinator:
    def __init__(self, store, config, invoke=connections.invoke):
        self.store,self.config,self.invoke=store,config,invoke
        self.lock=store.lock
        self.active=set()
        for run in store.all("run"):
            for job in run["jobs"]:
                if job["status"]=="working":
                    job.update(status="failed",error="服务中断。请检查原会话，确认后可重试。")
            store.put("run",run["id"],run)

    def create(self, project, title, prefs, materials, key):
        with self.lock:
            try:
                previous=self.store.read("run",key)
            except ValueError:
                previous=None
            if previous:
                if previous["project"]!=project["id"] or previous["title"]!=title:
                    raise ValueError("请求编号冲突。")
                return previous
            run=dict(id=key,project=project["id"],path=project["path"],title=title,materials=materials,
                     agents=prefs["agents"],boss=prefs["boss"],limit=prefs["limit"],round=1,
                     stage="draft",jobs=[],decisions=[],plans=[],questions=[],sessions={},executor=None)
            self.store.put("run",key,run)
            self.wake(key)
            return run

    def wake(self,key):
        with self.lock:
            if key not in self.active:
                self.active.add(key)
                threading.Thread(target=self._work,args=(key,),daemon=True).start()

    def action(self,key,action,data):
        with self.lock:
            r=self.store.read("run",key)
            if action in ("decide","end","handoff","members") and r["plans"] and data.get("revision")!=r["plans"][-1]["digest"]:
                raise ValueError("共同稿已更新，请查看当前版本。")
            if action=="recover" and r.get("error"):
                r.pop("error")
            elif action=="retry":
                failed=[j for j in r["jobs"] if j["status"]=="failed" and j["id"]==data.get("job")]
                if not failed: raise ValueError("任务状态已变化。")
                failed[0].update(status="queued",error="")
            elif action=="ask":
                question=data.get("text","").strip()
                if not question or len(question)>8000:raise ValueError("请输入简短的问题。")
                r["questions"].append({"id":uuid.uuid4().hex,"text":question})
            elif action=="members" and (r["stage"] in ("choice","limit","approved") or any(j["status"]=="failed" for j in r["jobs"])):
                names=data.get("agents",[])
                if (not isinstance(names,list) or len(names)<2 or len(set(names))!=len(names) or
                    any(not connections.scan(self.config).get(n,{}).get("ready") for n in names)):
                    raise ValueError("至少选择两位可用的参与者。")
                if any(j["status"]=="working" for j in r["jobs"]):raise ValueError("请等待当前调用结束。")
                if r["stage"] in ("execute","delivered","ended"):raise ValueError("本次讨论已关闭。")
                for j in r["jobs"]:
                    if j["status"] in ("queued","failed"):j["status"]="superseded"
                old=r["agents"]
                r["decisions"].append("参会名单由 "+", ".join(old)+" 改为 "+", ".join(names))
                r["agents"]=names
                r.update(stage="join",round=r["round"]+1)
                self.archive(r)
            elif action=="decide" and r["stage"] in ("choice","limit","approved"):
                decision=data.get("text","").strip()
                if not decision or len(decision)>8000:raise ValueError("请输入你的决定。")
                r["decisions"].append(decision)
                if r["stage"]=="limit" and r["limit"]: r["limit"]+=1
                r.update(stage="review",round=r["round"]+1)
                self.archive(r)
            elif action=="end" and r["stage"] in ("choice","limit"):
                r["stage"]="ended"
                self.archive(r)
            elif action=="handoff":
                if r["stage"] in ("execute","delivered"):return r
                if r["stage"]!="approved" or not connections.scan(self.config).get(data.get("agent"),{}).get("ready"):
                    raise ValueError("请选择可用的执行 Agent，并先取得全员确认。")
                r.update(stage="execute",executor=data["agent"])
            else:
                raise ValueError("讨论状态已变化，请刷新。")
            self.store.put("run",key,r)
            self.wake(key)
            return r

    def _tasks(self,r):
        for q in r["questions"]:
            if "answer" not in q:
                return "ask",q["id"],[r["boss"]]
        stage=r["stage"]
        if stage=="join":
            written={j["agent"] for j in r["jobs"] if j["stage"] in ("draft","revise","join") and j["status"]=="done" and j["round"]<r["round"]}
            return stage,str(r["round"]),[n for n in r["agents"] if n not in written]
        if stage in ("draft","review","revise","vote"): return stage,str(r["round"]),r["agents"]
        if stage=="merge":return stage,str(r["round"]),[r["boss"]]
        if stage=="execute":return stage,str(r["round"]),[r["executor"]]
        return stage,"",[]

    def _prompt(self,r,stage,agent,reference):
        brief={"目标":r["title"],"用户材料":r["materials"],"用户决定":r["decisions"]}
        draft=[j for j in r["jobs"] if j["stage"] in ("draft","revise","join") and j["status"]=="done" and j["agent"] in r["agents"]]
        latest={j["agent"]:j["text"] for j in draft}
        reviews={j["agent"]:j["text"] for j in r["jobs"] if j["stage"]=="review" and j["round"]==r["round"] and j["status"]=="done"}
        plan=r["plans"][-1] if r["plans"] else {}
        if stage in ("draft","join"):
            instruction="请独立提出完整方案 v1，写出假设、步骤、风险和验收条件。"
        elif stage=="review":
            brief.update(其他参与者提案={n:t for n,t in latest.items() if n!=agent},前版共同稿=plan)
            brief["上轮异议"]=[j["parsed"]["objection"] for j in r["jobs"] if j["stage"]=="vote" and j["status"]=="done" and j["round"]==r["round"]-1 and not j["parsed"]["approve"]]
            instruction="逐份审查每位其他参与者的提案。逐条引用作者、原句，写明异议或明确无异议。"
        elif stage=="revise":
            brief.update(自己的上一版=latest[agent],本轮评审=reviews)
            instruction=f"请提交你个人的完整 v{r['round']+1}，逐项说明采纳和保留哪些反馈。"
        elif stage=="merge":
            brief.update(各家修订稿=latest,互评=reviews,上一版共同稿=plan)
            instruction='担任 BOSS。用简洁中文整合为可执行共同稿，涵盖目标、步骤、验收条件、剩余异议。给用户的摘要只说这轮定了什么、会得到什么、怎么验收；用两到四句日常用语。涉及用户取舍时写清选项与后果。仅返回 JSON {"summary":"给用户的白话摘要","plan":"完整正文","question":"需要用户裁决的问题，没有则为空字符串"}。'
        elif stage=="vote":
            brief.update(当前共同稿=plan)
            instruction='核对共同稿是否解决你的异议、有可执行步骤和可检查的验收条件。仅返回 JSON {"revision":"原样复制 digest","approve":true或false,"objection":"通过时为空字符串，否则写具体异议"}。'
        elif stage=="ask":
            brief.update(当前共同稿=plan,各家已发布提案=latest if r["stage"]!="draft" else {},
                         用户问题=next(q["text"] for q in r["questions"] if q["id"]==reference))
            instruction="担任 BOSS，只解释这次提问。用日常中文回答，不更改方案或代用户作决定。"
        else:
            brief.update(已确认共同稿=plan,项目目录=r["path"])
            instruction="用户已经选择你接手执行。按这份已确认方案在当前项目执行，报告实际交付、检查结果和阻碍。需要改变方案时暂停并说明。"
        boundary="" if stage=="execute" else "目前处于方案讨论阶段。仅作分析，不修改项目文件。"
        return boundary+instruction+"\n以下是本轮任务材料：\n"+encode(brief)

    def _work(self,key):
        try:
            while True:
                with self.lock:
                    r=self.store.read("run",key)
                    if r.get("error"):
                        self.active.remove(key)
                        return
                    stage,ref,agents=self._tasks(r)
                    if stage=="join" and not agents:
                        r["stage"]="review"
                        self.store.put("run",key,r)
                        continue
                    group=[]
                    for agent in agents:
                        tag=f"{stage}/{ref}/{agent}"
                        job=next((j for j in r["jobs"] if j["id"]==tag),None)
                        if not job:
                            job=dict(id=tag,agent=agent,stage=stage,round=r["round"],status="queued",
                                     prompt=self._prompt(r,stage,agent,ref))
                            r["jobs"].append(job)
                        group.append(job)
                    if not group or any(j["status"]=="failed" for j in group):
                        self.active.remove(key)
                        return
                    pending=[j for j in group if j["status"]=="queued"]
                    if not pending:
                        self._advance(r,stage,ref,group)
                    else:
                        for j in pending:j["status"]="working"
                    self.store.put("run",key,r)
                if pending:
                    with ThreadPoolExecutor(max_workers=len(pending)) as pool:
                        list(pool.map(lambda j:self._call(key,j),pending))
        except Exception as exc:
            with self.lock:
                r=self.store.read("run",key)
                r["error"]=str(exc)
                self.store.put("run",key,r)
                self.active.discard(key)

    def _call(self,key,job):
        with self.lock:r=self.store.read("run",key)
        stage=job["stage"]
        role=("boss" if stage in ("ask","merge") else "execute" if stage=="execute" else "participant")+"/"+job["agent"]
        history=[]
        for old in r["jobs"]:
            if old.get("role")==role and old["status"]=="done":
                history.extend([{"role":"user","content":old["prompt"]},{"role":"assistant","content":old["text"]}])
        session=r["sessions"].get(role)
        update={}
        try:
            text,session=self.invoke(job["agent"],job["prompt"],r["path"],session,history,self.config,stage=="execute")
            update["text"]=text
            parsed=parse_answer(stage,text,r["plans"][-1]["digest"] if r["plans"] else "")
            update.update(status="done",parsed=parsed)
        except Exception as exc:
            update.update(status="failed",error=str(exc)[:500])
        with self.lock:
            current=self.store.read("run",key)
            next(j for j in current["jobs"] if j["id"]==job["id"]).update(update,role=role)
            if session:current["sessions"][role]=session
            self.store.put("run",key,current)

    def _advance(self,r,stage,ref,group):
        if stage=="ask":
            next(q for q in r["questions"] if q["id"]==ref)["answer"]=group[0]["text"]
        elif stage in ("draft","join","review","revise"):
            r["stage"]={"draft":"review","join":"review","review":"revise","revise":"merge"}[stage]
        elif stage=="merge":
            plan=dict(group[0]["parsed"],version=len(r["plans"])+1)
            plan["digest"]=hashlib.sha256(encode([r["id"],plan["version"],plan["plan"]]).encode()).hexdigest()
            r["plans"].append(plan)
            r["stage"]="choice" if plan["question"].strip() else "vote"
        elif stage=="vote":
            if all(j["parsed"]["approve"] for j in group):r["stage"]="approved"
            elif r["limit"] and r["round"]>=r["limit"]:r["stage"]="limit"
            else:r.update(round=r["round"]+1,stage="review")
        elif stage=="execute":r["stage"]="delivered"
        self.archive(r)

    def archive(self,r):
        root=Path(r["path"])
        if not root.is_dir():raise ValueError("项目目录无法访问。")
        folder=root
        for component in ("parley-deck","ideas","allchat-"+r["id"]):
            folder=folder/component
            if folder.is_symlink():raise ValueError("讨论记录目录含符号链接。")
            folder.mkdir(exist_ok=True)
        records=[("00-prompt.md",r["title"])]
        for job in r["jobs"]:
            if job["status"]!="done" or job["stage"] not in ("draft","join","review","revise","vote"):
                continue
            section=folder/f"round-{job['round']:02d}"
            if section.is_symlink():raise ValueError("轮次记录目录含符号链接。")
            section.mkdir(exist_ok=True)
            file=section/(job["stage"]+"-"+job["agent"]+".md")
            if not file.exists():records.append((file.relative_to(folder),job["text"]))
        records.extend((f"common-v{p['version']}.md",p["plan"]) for p in r["plans"])
        if r["stage"] in ("approved","execute","delivered"):
            records.append(("FINAL.md",r["plans"][-1]["plan"]))
        elif (folder/"FINAL.md").exists():
            os.replace(folder/"FINAL.md",folder/f"previously-approved-v{len(r['plans'])}.md")
        records.append(("discussion.json",encode(self.public(r))))
        for filename,content in records:
            tmp=folder/("."+uuid.uuid4().hex)
            with tmp.open("x",encoding="utf-8") as out:out.write(content)
            os.replace(tmp,folder/filename)

    @staticmethod
    def public(r):
        data=deepcopy(r)
        for j in data["jobs"]:j.pop("prompt",None)
        return data
