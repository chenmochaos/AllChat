import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import patch

from coordinator import Coordinator, Store, parse_answer
from server import Application, merged_preferences, preferences
import connections


class WorkflowTest(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path=Path(tmp.name)
        self.store=Store(self.path/"data")
        self.project={"path":tmp.name,"id":"one","name":"one"}
        self.inject_failure=False
        self.choice=False
        self.object=False
        self.prompts=[]
        self.lock=threading.Lock()
        self.engine=Coordinator(self.store,{},self.call)

    def call(self,agent,prompt,project,session,history,config,execute):
        body=json.loads(prompt.split("以下是本轮任务材料：\n")[1])
        with self.lock:self.prompts.append((agent,prompt))
        if "独立提出" in prompt and self.inject_failure and agent=="DeepSeek API":
            raise ValueError("testing failure")
        if "担任 BOSS。用简洁" in prompt:
            text=json.dumps({"plan":"ready","question":"请选" if self.choice and not body["用户决定"] else ""})
        elif "核对共同稿" in prompt:
            approve=not (self.object and agent=="DeepSeek API" and not body["用户决定"])
            text=json.dumps(dict(approve=approve,objection="" if approve else "missing",revision=body["当前共同稿"]["digest"]))
        else:text="content of "+agent
        return text,session or str(uuid.uuid4())

    def start(self):
        self.key=uuid.uuid4().hex
        self.engine.create(self.project,"task",{"agents":["Claude Code","DeepSeek API"],"boss":"Claude Code","limit":1},"",self.key)

    def idle(self):
        for _ in range(400):
            with self.engine.lock:
                if self.key not in self.engine.active:return self.store.read("run",self.key)
            time.sleep(.01)
        self.fail("worker did not finish")

    def test_consensus_after_objection(self):
        self.object=True
        self.start()
        r=self.idle()
        self.assertEqual(r["stage"],"limit")
        self.assertTrue(all("其他参与者提案" not in p for _,p in self.prompts if "独立提出" in p))
        self.engine.action(self.key,"decide",{"text":"change","revision":r["plans"][-1]["digest"]})
        r=self.idle()
        self.assertEqual(r["stage"],"approved")
        self.assertNotEqual(r["plans"][0]["digest"],r["plans"][1]["digest"])
        self.assertEqual(len([j for j in r["jobs"] if j["stage"]=="vote"]),4)
        self.assertTrue((self.path/"parley-deck"/"ideas"/("allchat-"+self.key)/"FINAL.md").exists())

    def test_user_choice_explanation_and_end(self):
        self.choice=True;self.start()
        r=self.idle()
        self.assertEqual(r["stage"],"choice")
        self.engine.action(self.key,"ask",{"text":"why"})
        r=self.idle()
        self.assertTrue(r["questions"][0]["answer"])
        self.assertEqual(len(r["plans"]),1)
        with self.assertRaises(ValueError):self.engine.action(self.key,"end",{"revision":"stale"})
        self.engine.action(self.key,"end",{"revision":r["plans"][0]["digest"]})
        self.assertEqual(self.idle()["stage"],"ended")

    def test_retry_only_failed_and_restart(self):
        self.inject_failure=True;self.start()
        r=self.idle()
        first=next(j for j in r["jobs"] if j["status"]=="done")
        broken=next(j for j in r["jobs"] if j["status"]=="failed")
        broken["status"]="working"
        self.store.put("run",self.key,r)
        self.engine=Coordinator(self.store,{},self.call)
        self.assertEqual(next(j for j in self.store.read("run",self.key)["jobs"] if j["id"]==broken["id"])["status"],"failed")
        self.inject_failure=False
        self.engine.action(self.key,"retry",{"job":broken["id"]})
        self.assertEqual(self.idle()["stage"],"approved")
        self.assertEqual(sum(p==first["prompt"] and n==first["agent"] for n,p in self.prompts),1)

    def test_strict_ballots(self):
        for bad in ({"approve":True,"objection":"","revision":"old"},{"approve":True,"objection":"blocked","revision":"new"},
                    {"approve":"true","objection":"","revision":"new"}):
            with self.assertRaises(ValueError):parse_answer("vote",json.dumps(bad),"new")

    def test_new_roster_and_duplicate_handoff(self):
        self.start()
        r=self.idle()
        capabilities={agent:{"ready":True} for agent in ["Gemini","Claude Code"]}
        with patch("connections.scan",return_value=capabilities):
            self.engine.action(self.key,"members",{"agents":list(capabilities),"revision":r["plans"][-1]["digest"]})
            r=self.idle()
            self.assertEqual(r["stage"],"approved")
            self.assertTrue(any(j["stage"]=="join" and j["agent"]=="Gemini" for j in r["jobs"]))
            data={"revision":r["plans"][-1]["digest"],"agent":"Gemini"}
            self.engine.action(self.key,"handoff",data)
            self.engine.action(self.key,"handoff",data)
            r=self.idle()
            self.assertEqual(r["stage"],"delivered")
            self.assertEqual(sum(j["stage"]=="execute" for j in r["jobs"]),1)

    def test_project_identity(self):
        app=Application(self.path/"service",{})
        self.addCleanup(app.guard.close)
        a=self.path/"a"/"same"; b=self.path/"b"/"same"
        for path in [a,b]:path.mkdir(parents=True)
        one=app.project(a,"a");two=app.project(b,"b")
        self.assertNotEqual(one["id"],two["id"])
        self.assertEqual(one,app.project(a,"again"))

    def test_desktop_alias_and_saved_roster(self):
        prefs = dict(agents=["Codex 桌面端","ChatGPT","Claude Code"], boss="Codex 桌面端", limit=8)
        self.assertEqual(preferences(prefs), dict(agents=["ChatGPT","Claude Code"],boss="ChatGPT",limit=8))
        prefs["agents"].pop()
        self.assertEqual(merged_preferences(prefs)["agents"], ["ChatGPT"])
        with self.assertRaises(ValueError):
            preferences(prefs)
        config = {"bridges":{"Codex 桌面端":["/bin/true"]}}
        result = connections.scan(config)
        self.assertNotIn("Codex 桌面端",result)
        self.assertTrue(result["ChatGPT"]["ready"])
        with patch("connections.command", return_value='{"text":"reply"}') as call:
            connections.invoke("ChatGPT","task",str(self.path),None,[],config)
            self.assertEqual(call.call_args.args[0], ["/bin/true"])

    def test_unrelated_dsh_and_native_resume(self):
        with patch("connections.shutil.which",return_value="/test/dsh"), patch("connections.subprocess.run") as probe:
            probe.return_value.returncode = 0
            probe.return_value.stdout = "Distributed shell"
            self.assertIsNone(connections.harness_command())
            probe.return_value.stdout = "DeepSeek Harness with headless"
            self.assertEqual(connections.harness_command(),"/test/dsh")
        with patch("connections.harness_command",return_value="/test/dsh"), patch("connections.command") as call:
            call.return_value = '{"type":"session","sessionId":"s"}\n{"type":"final","sessionId":"s","text":"done"}'
            self.assertEqual(connections.invoke("DeepSeek Harness","task",str(self.path),"s",[],{}),("done","s"))
            self.assertEqual(call.call_args.args[0],["/test/dsh","headless","--json","--permission-mode","read-only",
                                                      "--approval-policy","never","--session-id","s","-"])

    def test_catalog_and_retired_api(self):
        caps = connections.scan({})
        self.assertEqual([name for name in caps if name.endswith("API")], ["自定义 API"])
        self.assertEqual(len(caps), 19)
        self.assertIn("ZCode", caps)
        merged = merged_preferences(dict(agents=["Gemini","DeepSeek API"], boss="DeepSeek API", limit=8))
        self.assertEqual(merged, dict(agents=["Gemini CLI"], boss="", limit=8))

    def test_scan_external_agent_and_ignore_inactive_shim(self):
        binary=self.path/"zcode"
        binary.write_text("#!/bin/sh\n")
        binary.chmod(0o700)
        mise=self.path/"mise"
        mise.write_text("#!/bin/sh\nexit 1\n")
        mise.chmod(0o700)
        (self.path/"omp").symlink_to(mise)
        with patch.dict("os.environ",PATH=str(self.path)), patch("connections.harness_command",return_value=None):
            caps=connections.scan({})
            self.assertTrue(caps["ZCode"]["installed"])
            self.assertFalse(caps["ZCode"]["ready"])
            self.assertFalse(caps["Oh My Pi"]["installed"])
            self.assertTrue(connections.scan({"bridges":{"ZCode":[str(binary)]}})["ZCode"]["ready"])


if __name__=="__main__":unittest.main()
