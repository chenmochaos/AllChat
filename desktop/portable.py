"""Native Windows and macOS window, folder picker and background service."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

from server import Application, Handler, ThreadingHTTPServer


def state_dir():
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/AllChat"
    return Path(os.environ["LOCALAPPDATA"]) / "AllChat"


def self_command(*args):
    entry = [] if getattr(sys, "frozen", False) else [__file__]
    return [sys.executable, *entry, *args]


def pick_folder():
    with tempfile.TemporaryDirectory() as directory:
        result = Path(directory) / "choice"
        subprocess.run(self_command("--pick-folder", str(result)), check=True, timeout=300)
        return result.read_text(encoding="utf-8")


def serve(state):
    config = state / "connections.json"
    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        server.app = Application(state, json.loads(config.read_text(encoding="utf-8")) if config.exists() else {},
                                 folder_picker=pick_folder)
        endpoint = state / "endpoint.json"
        temporary = endpoint.with_suffix(".tmp")
        temporary.write_text(json.dumps(dict(port=server.server_port, token=server.app.token)),encoding="utf-8")
        temporary.replace(endpoint)
        server.serve_forever()


def running_url(state):
    try:
        record = json.loads((state / "endpoint.json").read_text(encoding="utf-8"))
        url = f"http://127.0.0.1:{int(record['port'])}/"
        with urlopen(url, timeout=1) as response:
            if f'name="allchat-token" content="{record["token"]}"'.encode() in response.read(65536):
                return url
    except (OSError, ValueError, KeyError):
        pass


def start_service(state):
    url = running_url(state)
    if url:
        return url
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    with (state/"service.log").open("ab") as log:
        subprocess.Popen(self_command("--serve",str(state)), stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                         creationflags=flags, start_new_session=os.name!="nt")
    for _ in range(100):
        url = running_url(state)
        if url:
            return url
        time.sleep(.15)
    raise RuntimeError(f"无法启动本地工作区。请查看 {state/'service.log'}")


def main():
    os.umask(0o077)
    if sys.platform == "darwin":
        extras = ["/opt/homebrew/bin","/usr/local/bin",str(Path.home()/".local/bin")]
        os.environ["PATH"] = os.pathsep.join([os.environ.get("PATH",""),*extras])
    if sys.argv[1:2] == ["--pick-folder"]:
        from tkinter import Tk, filedialog
        root = Tk()
        root.withdraw()
        choice = filedialog.askdirectory(title="选择 AllChat 项目文件夹",mustexist=True)
        Path(sys.argv[2]).write_text(choice or "",encoding="utf-8")
        root.destroy()
        return
    if sys.argv[1:2] == ["--serve"]:
        serve(Path(sys.argv[2]))
        return
    import webview
    state = state_dir()
    state.mkdir(parents=True,exist_ok=True)
    webview.create_window("AllChat",start_service(state),width=1180,height=850,min_size=(360,380),
                                   background_color="#050505")
    webview.start(gui="edgechromium" if os.name=="nt" else "cocoa",private_mode=False,
                  storage_path=str(state/"WebView"))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if sys.argv[1:2] == ["--serve"]:
            raise
        from tkinter import messagebox
        messagebox.showerror("AllChat",str(exc))
        raise
