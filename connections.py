"""Local Agent entry points. User-supplied bridge programs are configured on disk."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import urllib.request
import codex_session


CATALOG = {
    "Claude Code": (("claude",), ()),
    "Claude Desktop": ((), ("com.anthropic.claude", "claude-desktop")),
    "ChatGPT": ((), ("chatgpt", "codex")),
    "Codex CLI": (("codex",), ()),
    "Gemini CLI": (("gemini",), ()),
    "Grok Build": (("grok",), ()),
    "OpenCode": (("opencode", "~/.opencode/bin/opencode"), ("opencode", "ai.opencode.desktop")),
    "OpenClaw": (("openclaw",), ("openclaw",)),
    "Hermes": (("hermes", "~/.hermes/hermes-agent/venv/bin/hermes"), ()),
    "Pi": (("pi",), ()),
    "MiniMax Code": (("mcode",), ()),
    "Kimi Code": (("kimi",), ()),
    "DeepSeek Harness": (("deepseek-harness",), ()),
    "Antigravity": (("agy", "antigravity"), ("antigravity",)),
    "Oh My Pi": (("omp",), ()),
    "Copilot CLI": (("copilot",), ()),
    "WorkBuddy": (("workbuddy",), ("workbuddy",)),
    "ZCode": (("zcode",), ("zcode",)),
    "自定义 API": ((), ()),
}


def canonical_name(name):
    return {"Codex 桌面端": "ChatGPT", "Gemini": "Gemini CLI"}.get(name, name)


def configured(config, section, name):
    entries = config.get(section, {})
    if canonical_name(name) == "ChatGPT":
        other = "Codex 桌面端" if name == "ChatGPT" else "ChatGPT"
        return entries.get(name) or entries.get(other)
    if canonical_name(name) == "Gemini CLI":
        return entries.get(name) or entries.get("Gemini CLI") or entries.get("Gemini")
    return entries.get(name)


def harness_command():
    # dsh is also the name of an unrelated distributed shell.
    mise = Path(os.environ.get("MISE_DATA_DIR", Path.home()/".local/share/mise"))
    bundled = mise/"installs/npm-deepseek-ai-dsh/global/node_modules/.bin/dsh"
    for path in dict.fromkeys((shutil.which("dsh"), shutil.which(str(bundled)))):
        if not path:
            continue
        try:
            help_text = subprocess.run([path, "--help"], cwd=Path.home(),
                                       capture_output=True, text=True, timeout=3)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if help_text.returncode == 0 and "DeepSeek Harness" in help_text.stdout and "headless" in help_text.stdout:
            return path


def deepseek_key():
    if os.environ.get("DEEPSEEK_API_KEY"):
        return os.environ["DEEPSEEK_API_KEY"]
    if os.environ.get("ANTHROPIC_BASE_URL","").rstrip("/") == "https://api.deepseek.com/anthropic":
        return os.environ.get("ANTHROPIC_AUTH_TOKEN")


def local_command(exes):
    for exe in exes:
        path = shutil.which(os.path.expanduser(exe))
        if not path:
            continue
        if Path(path).resolve().name == "mise":
            try:
                resolved = subprocess.run(["mise", "which", exe], capture_output=True, text=True, timeout=2)
            except (OSError, subprocess.TimeoutExpired):
                continue
            if resolved.returncode or not shutil.which(resolved.stdout.strip()):
                continue
        return path


def scan(config):
    data_dirs = [os.environ.get("XDG_DATA_HOME") or Path.home()/".local/share",
                 *(os.environ.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share").split(":")]
    launchers = {entry.stem.casefold(): entry.name for directory in data_dirs if directory
                 for entry in (Path(directory)/"applications").glob("*.desktop") if entry.is_file()}
    result = {}
    for name, (exes, desktops) in CATALOG.items():
        bridge = configured(config, "bridges", name)
        launcher = next((launchers[entry] for entry in desktops if entry in launchers), None)
        detected = launcher or local_command(exes)
        harness = harness_command() if name == "DeepSeek Harness" else None
        detected = harness or detected
        detail = f"检测到 {detected}" if detected else "未发现本地入口"
        parley = configured(config, "parley_agents", name)
        if parley:
            ready = bool(shutil.which("parley"))
            detail = "通过已配置的 Parley 参与者收发" if ready else "已配置 Parley，但找不到 parley 命令"
        elif bridge:
            ready = isinstance(bridge, list) and all(isinstance(x, str) for x in bridge) and bool(shutil.which(bridge[0]))
            detail = "通过已配置的桥接程序收发" if ready else "找不到配置的桥接程序"
        elif name == "ChatGPT":
            argv = codex_session.launch_command(config)
            ready = bool(argv)
            if ready:
                detail = "通过桌面端的 Codex 会话服务收发"
            elif detected:
                detail += "；手动可用，尚未找到自动收发入口"
        elif name == "DeepSeek Harness":
            ready = bool(harness)
            if ready:
                detail = "已识别 DeepSeek Harness，可通过 dsh headless 收发"
        elif name == "自定义 API":
            ready = bool(config.get("api_url") and config.get("api_model"))
        else:
            ready = detected and name in ("Codex CLI", "Claude Code", "Gemini CLI")
        if name.endswith("API") and not (bridge or parley):
            detail = "已找到 API 配置" if ready else "缺少 API 配置"
        result[name] = {"installed": bool(detected or ready), "ready": bool(ready), "detail": detail}
    return result


def command(argv, prompt, cwd):
    proc = subprocess.Popen(argv, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        out, err = proc.communicate(prompt, timeout=600)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise ValueError("调用超时，请先核对原生会话再重试。") from None
    if proc.returncode:
        # Provider logs can include tokens. Never send raw stderr to a browser.
        reason = "需要登录或检查连接" if any(s in (out+err).lower() for s in
                 ("auth", "login", "401", "credential", "logged in")) else "请检查连接、模型额度和项目权限"
        raise ValueError(f"Agent 返回退出码 {proc.returncode}，{reason}。")
    return out


def invoke(name, prompt, project, session, history, config, execute=False):
    parley_id=configured(config, "parley_agents", name)
    if parley_id:
        # The upstream CLI checks that this invocation produced its expected artifact.
        # The output is private to this call until the round barrier opens.
        with tempfile.TemporaryDirectory(prefix=".allchat-job-",dir=project) as work:
            output=Path(work)/"reply.txt"
            target=str(output.relative_to(project))
            full_prompt=encode_history(history,prompt)+"\n将本次完整回复写入 "+target+"。"
            command(["parley","agents","exec","--dir",project,"--agent",parley_id,"--prompt-file","-",
                     "--artifact",target,"--json","--yes"],full_prompt,project)
            if output.is_symlink():raise ValueError("Agent 返回的产物路径无效。")
            return output.read_text(),None
    bridge = configured(config, "bridges", name)
    if bridge:
        data = {"prompt": prompt, "session": session, "project": project,
                "history": history, "mode": "execute" if execute else "plan"}
        result = json.loads(command(bridge, json.dumps(data, ensure_ascii=False), project))
        return result["text"], result.get("session") or session
    if canonical_name(name) == "ChatGPT":
        return codex_session.turn(config,project,session,prompt,execute)
    if name == "DeepSeek Harness":
        exe = harness_command()
        if not exe:
            raise ValueError("找不到支持 headless 的 DeepSeek Harness。")
        args = [exe, "headless", "--json", "--permission-mode",
                "workspace-write" if execute else "read-only", "--approval-policy", "never"]
        if session:
            args += ["--session-id", session]
        out = command(args + ["-"], prompt, project)
        for line in reversed(out.splitlines()):
            event = json.loads(line)
            if event.get("type") == "final" and event.get("text") and event.get("sessionId"):
                return event["text"], event["sessionId"]
        raise ValueError("DeepSeek Harness 没有返回最终回复。")
    if name == "Codex CLI":
        mode = "workspace-write" if execute else "read-only"
        args = ["codex", "exec", "-c", f'sandbox_mode="{mode}"']
        if session:
            args += ["resume"]
        args += ["--json", "--skip-git-repo-check"]
        if session:
            args.append(session)
        out = command(args+["-"], prompt, project)
        answers = []
        for line in out.splitlines():
            event = json.loads(line)
            if event["type"] == "thread.started":
                session = event["thread_id"]
            item = event.get("item", {})
            if event["type"] == "item.completed" and item.get("type") == "agent_message":
                answers.append(item["text"])
        return "\n".join(answers), session
    if name == "Claude Code":
        args = ["claude", "-p", "--output-format", "json", "--strict-mcp-config"]
        if not execute:
            args += ["--tools", "Read,Glob,Grep"]
        if session:
            args += ["--resume", session]
        result = json.loads(command(args, prompt, project))
        if result.get("is_error"):
            raise ValueError("Claude Code 未完成请求，请核对登录和模型额度。")
        return result["result"], result["session_id"]
    if canonical_name(name) == "Gemini CLI":
        args = ["gemini", "--output-format", "json", "--approval-mode", "default" if execute else "plan"]
        if session:
            args += ["--resume", session]
        result = json.loads(command(args+["-p", "请处理标准输入中的任务。"], prompt, project))
        return result["response"], result.get("session_id") or session
    if name not in ("自定义 API","DeepSeek API"):
        raise ValueError("这个入口需要配置可自动收发的连接程序。")
    headers = {"Content-Type": "application/json"}
    if name=="DeepSeek API":
        key=deepseek_key()
        url="https://api.deepseek.com/chat/completions"
        model=config.get("deepseek_model","deepseek-flash")
    else:
        key=os.environ.get(config.get("api_key_env","ALLCHAT_API_KEY"))
        url=config["api_url"]
        model=config["api_model"]
    if key:
        headers["Authorization"] = "Bearer "+key
    data = {"model": model, "messages": history+[{"role":"user","content":prompt}]}
    request = urllib.request.Request(url, headers=headers, data=json.dumps(data).encode())
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.load(response)["choices"][0]["message"]["content"], session


def encode_history(history,prompt):
    return json.dumps(history,ensure_ascii=False)+"\n"+prompt if history else prompt
