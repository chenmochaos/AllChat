"""Run AllChat locally with: python3 server.py"""
import argparse
import fcntl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import secrets
import subprocess
import sys
from urllib.parse import urlsplit
import uuid

from connections import scan, CATALOG, canonical_name
from coordinator import Coordinator, Store, encode

ROOT=Path(__file__).resolve().parent
PICKER="""import tkinter as tk
from tkinter import filedialog
root=tk.Tk()
root.withdraw()
print(filedialog.askdirectory(title="选择 AllChat 项目文件夹",mustexist=True) or "")
root.destroy()
"""


def merged_preferences(data):
    agents = list(dict.fromkeys(canonical_name(a) for a in data["agents"] if a != "DeepSeek API"))
    boss = canonical_name(data["boss"])
    return {**data, "agents": agents, "boss": boss if boss != "DeepSeek API" else ""}


def preferences(data):
    if isinstance(data["agents"], list):
        data = merged_preferences(data)
    agents,boss,limit=data["agents"],data["boss"],data["limit"]
    if (not isinstance(agents,list) or len(set(agents))!=len(agents) or len(agents)<2 or
        any(a not in CATALOG for a in agents) or boss not in CATALOG or
        type(limit) is not int or limit<0 or limit>1000):
        raise ValueError("请选择至少两位不同的参与者、BOSS 和有效轮数。")
    return dict(agents=agents,boss=boss,limit=limit)


class Application:
    def __init__(self,directory,config):
        self.config=config
        self.store=Store(directory)
        self.guard=(directory/"server.lock").open("a")
        fcntl.flock(self.guard,fcntl.LOCK_EX|fcntl.LOCK_NB)
        self.engine=Coordinator(self.store,config)
        self.token=secrets.token_urlsafe(32)
        self.folders={}
        if not self.store.all("defaults"):
            available=scan(config)
            ready=[n for n in dict.fromkeys(("Claude Code","DeepSeek Harness","Codex CLI",*CATALOG))
                   if available[n]["ready"]]
            initial=ready[:2] if len(ready)>=2 else ["Codex CLI","Claude Code"]
            self.store.put("defaults","user",dict(agents=initial,boss=initial[0],limit=8))
        for r in self.store.all("run"):
            self.engine.wake(r["id"])

    def project(self,path,name):
        path=Path(path).resolve(strict=True)
        if not path.is_dir():raise ValueError("请选择项目文件夹。")
        existing=next((p for p in self.store.all("project") if p["path"]==str(path)),None)
        if existing:return existing
        p=dict(id=uuid.uuid4().hex,name=name or path.name,path=str(path),prefs=None)
        self.store.put("project",p["id"],p)
        return p

    def state(self):
        projects = self.store.all("project")
        for project in projects:
            if project["prefs"]:
                project["prefs"] = merged_preferences(project["prefs"])
        return dict(projects=projects,defaults=merged_preferences(self.store.read("defaults","user")),
                    agents=scan(self.config),runs=[{k:r[k] for k in ("id","project","title","stage")}
                                                  for r in self.store.all("run")])

    def post(self,path,d):
        if path=="/api/folder":
            picker=ROOT/"pick_folder.py"
            args=[str(picker)] if picker.is_file() else ["-c",PICKER]
            proc=subprocess.run([sys.executable,*args],capture_output=True,text=True,timeout=300)
            if proc.returncode:raise ValueError("无法显示系统文件夹选择器。请在桌面终端启动服务，或使用 --project 选择目录。")
            value=proc.stdout.strip()
            if not value:return {}
            token=uuid.uuid4().hex
            with self.store.lock:self.folders[token]=value
            return dict(token=token,name=Path(value).name)
        with self.store.lock:
            if path=="/api/projects":
                return self.project(self.folders.pop(d["folder"]),str(d["name"]).strip()[:120])
            if path=="/api/prefs":
                prefs=preferences(d["prefs"])
                if d.get("project"):
                    p=self.store.read("project",d["project"])
                    p["prefs"]=None if d.get("inherit") else prefs
                    self.store.put("project",p["id"],p)
                if not d.get("project") or d.get("asDefault"):
                    self.store.put("defaults","user",prefs)
                return {}
            if path=="/api/runs":
                p=self.store.read("project",d["project"])
                prefs=merged_preferences(p["prefs"] or self.store.read("defaults","user"))
                if len(prefs["agents"]) < 2 or not prefs["boss"]:
                    raise ValueError("请打开 Agent 配置，选择至少两位参与者和一位 BOSS。")
                prefs=preferences(prefs)
                ready=scan(self.config)
                if any(not ready[name]["ready"] for name in prefs["agents"]+[prefs["boss"]]):
                    raise ValueError("项目阵容含未连接的 Agent，请先调整配置。")
                title=d["title"].strip()
                if not title or len(title)>8000:raise ValueError("需求须为 1 至 8000 个字符。")
                materials=d.get("materials","")
                if not isinstance(materials,str) or len(materials)>100000:raise ValueError("材料请控制在十万字符以内。")
                return self.engine.public(self.engine.create(p,title,prefs,materials,uuid.UUID(d["id"]).hex))
            if path=="/api/action":
                return self.engine.public(self.engine.action(d["id"],d["action"],d))
        raise ValueError("未知操作。")


class Handler(BaseHTTPRequestHandler):
    def send(self,status,body,ctype="application/json; charset=utf-8"):
        data=body if isinstance(body,bytes) else encode(body).encode()
        self.send_response(status)
        self.send_header("Content-Type",ctype)
        self.send_header("Content-Length",str(len(data)))
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("X-Frame-Options","DENY")
        self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):pass

    def allowed(self):
        hosts={f"{host}:{self.server.server_port}" for host in ("127.0.0.1","localhost")}
        return self.headers.get("Host") in hosts

    def do_GET(self):
        if not self.allowed():return self.send(403,{})
        path=urlsplit(self.path).path
        if path.startswith("/api/"):
            if self.headers.get("X-AllChat")!=self.server.app.token:return self.send(403,{})
            try:
                if path=="/api/state":return self.send(200,self.server.app.state())
                if path.startswith("/api/run/"):
                    r=self.server.app.store.read("run",path.split("/")[-1])
                    return self.send(200,Coordinator.public(r))
            except ValueError:return self.send(404,{"error":"记录不存在"})
            return self.send(404,{})
        if path in ("/","/index.html"):
            page=(ROOT/"index.html").read_text().replace('src="workspace.js"','src="live.js"')
            page=page.replace("<head>",f'<head><meta name="allchat-token" content="{self.server.app.token}">')
            return self.send(200,page.encode(),"text/html; charset=utf-8")
        file=(ROOT/path.lstrip("/")).resolve()
        if (path not in ("/app.js","/ui.js","/live.js","/styles.css") and
                not file.is_relative_to(ROOT/"assets")) or not file.is_file():
            return self.send(404,{})
        self.send(200,file.read_bytes(),mimetypes.guess_type(file)[0] or "application/octet-stream")

    def do_POST(self):
        if (not self.allowed() or self.headers.get("X-AllChat")!=self.server.app.token or
            self.headers.get("Origin") not in (None,"http://"+self.headers["Host"])):
            return self.send(403,{})
        try:
            length=int(self.headers.get("Content-Length",0))
            if not 0<length<=600000:return self.send(413,{"error":"请求过大"})
            value=self.server.app.post(self.path,json.loads(self.rfile.read(length)))
            self.send(200,value)
        except (ValueError,KeyError,TypeError,OSError,subprocess.TimeoutExpired) as exc:
            self.send(400,{"error":str(exc)})

    def log_message(self,fmt,*args):
        if args and str(args[1] if len(args)>1 else "") not in ("200","304"):
            super().log_message(fmt,*args)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--port",type=int,default=8787)
    parser.add_argument("--data-dir",type=Path,default=Path(os.environ.get("XDG_STATE_HOME",Path.home()/".local/state"))/"allchat")
    parser.add_argument("--project",type=Path)
    parser.add_argument("--endpoint-file",type=Path,help=argparse.SUPPRESS)
    parser.add_argument("--config",type=Path,default=Path.home()/".config/allchat/connections.json")
    args=parser.parse_args()
    os.umask(0o077)
    server=ThreadingHTTPServer(("127.0.0.1",args.port),Handler)
    config=json.loads(args.config.read_text()) if args.config.exists() else {}
    server.app=Application(args.data_dir,config)
    if args.project:server.app.project(args.project,args.project.resolve().name)
    if args.endpoint_file:
        temporary=args.endpoint_file.with_suffix(".tmp")
        temporary.write_text(json.dumps({"pid":os.getpid(),"port":server.server_port}))
        temporary.replace(args.endpoint_file)
    print(f"http://127.0.0.1:{server.server_port}/#workspace",flush=True)
    server.serve_forever()


if __name__=="__main__":main()
