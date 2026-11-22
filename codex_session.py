"""A single turn through the user's shared Codex App Server control socket."""
import json
from pathlib import Path
import os
import shutil
from queue import Queue, Empty
import subprocess
import threading
import time


def control_socket(config):
    return Path(config.get("codex_socket",Path(os.environ.get("CODEX_HOME",Path.home()/".codex"))/
                           "app-server-control"/"app-server-control.sock")).expanduser()


def launch_command(config):
    bundled = shutil.which("/usr/lib/chatgpt/resources/codex")
    cli = shutil.which("codex") or bundled
    socket = control_socket(config)
    if cli and socket.is_socket():
        return [cli, "app-server", "proxy", "--sock", str(socket)]
    if bundled and not config.get("codex_socket"):
        return [bundled, "app-server", "--stdio"]
    return None


def turn(config,project,session,prompt,execute):
    argv = launch_command(config)
    if not argv:
        raise ValueError("已安装桌面端，尚未找到 Codex 会话服务。")
    process=subprocess.Popen(argv,
                             stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
    inbox=Queue()
    deadline=time.monotonic()+600

    def read():
        try:
            for line in process.stdout:inbox.put(json.loads(line))
        finally:inbox.put(None)

    def send(message):
        process.stdin.write(json.dumps(message)+"\n")
        process.stdin.flush()

    def receive():
        try:message=inbox.get(timeout=max(.1,deadline-time.monotonic()))
        except Empty:raise ValueError("Codex 桌面会话超时，请核对原会话。") from None
        if message is None:raise ValueError("Codex 会话服务断开。")
        if "method" in message and "id" in message:
            send({"id":message["id"],"error":{"code":-32601,"message":"Interactive approval unavailable in AllChat"}})
        return message

    def request(number,method,params):
        send({"id":number,"method":method,"params":params})
        while True:
            message=receive()
            if message.get("id")==number and "method" not in message:
                if "error" in message:raise ValueError("Codex 会话服务拒绝 "+method+"，请核对登录和服务版本。")
                return message["result"]

    threading.Thread(target=read,daemon=True).start()
    try:
        request(1,"initialize",{"clientInfo":{"name":"allchat","title":"AllChat","version":"1"},"capabilities":{}})
        send({"method":"initialized","params":{}})
        settings={"cwd":project,"sandbox":"workspace-write" if execute else "read-only","approvalPolicy":"never"}
        if session:settings["threadId"]=session
        thread=request(2,"thread/resume" if session else "thread/start",settings)["thread"]["id"]
        send({"id":3,"method":"turn/start","params":{"threadId":thread,"input":[{"type":"text","text":prompt}]}})
        texts=[]
        while True:
            event=receive()
            if event.get("id")==3 and "error" in event:raise ValueError("Codex 无法开始这一轮。")
            p=event.get("params",{})
            if p.get("threadId")!=thread:continue
            if event.get("method")=="item/completed" and p["item"]["type"]=="agentMessage":
                texts.append(p["item"]["text"])
            if event.get("method")=="turn/completed":
                if p["turn"]["status"]!="completed":raise ValueError("Codex 会话未完成。")
                return "\n".join(texts),thread
    finally:
        process.terminate()
        try:process.wait(timeout=3)
        except subprocess.TimeoutExpired:process.kill();process.wait()
        process.stdin.close()
        process.stdout.close()
