"""Start or reuse the desktop session's local AllChat service."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def main():
    root = Path(__file__).resolve().parent
    runtime = Path(os.environ["XDG_RUNTIME_DIR"]) / "allchat-desktop"
    runtime.mkdir(mode=0o700, exist_ok=True)
    endpoint = runtime / "endpoint.json"
    state = Path(os.environ.get("XDG_STATE_HOME", Path.home()/".local/state")) / "allchat-desktop"
    unit = "allchat-desktop.service"

    def active_pid():
        result = subprocess.run(["systemctl", "--user", "show", unit, "-p", "MainPID", "--value"],
                                capture_output=True, text=True, timeout=5)
        return int(result.stdout.strip() or 0)

    if not active_pid():
        # Keep graphical session and agent paths when launched from a desktop menu.
        env_keys = ["PATH", "DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_STATE_HOME",
                    "CODEX_HOME", "MISE_DATA_DIR", "DSH_HOME"]
        flags = ["--setenv="+key for key in env_keys if key in os.environ]
        launch = subprocess.run(["systemd-run", "--user", "--quiet", "--collect", "--unit="+unit,
                                 *flags, sys.executable, str(root/"server.py"), "--port", "0",
                                 "--data-dir", str(state), "--endpoint-file", str(endpoint)],
                                capture_output=True, text=True, timeout=10)
        if launch.returncode and not active_pid():
            raise RuntimeError("本地工作区启动失败。"+launch.stderr.strip())
    for _ in range(70):
        if endpoint.exists():
            record = json.loads(endpoint.read_text())
            if active_pid() == record["pid"]:
                print(f"http://127.0.0.1:{record['port']}/")
                return
        time.sleep(0.1)
    raise RuntimeError("本地工作区没有响应。可在用户日志中查看 allchat-desktop.service。")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
