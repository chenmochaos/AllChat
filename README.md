---
created: 2026-11-22
updated: 2026-11-22
---
# AllChat

## Why

我遇到复杂问题的工作流是这样的：首先根据我的问题以及我要达到的目标，让几个很聪明的AI（如Astra、Claude、Gemini、deepseek）各自出一个v1方案，随后各自审查其余AI的方案、发现盲点或冲突，生成v2版本，再继续审查，以此类推，直到方案基本一致且无异议。然后交由便宜迅速的模型来执行。

但是不同的Agent有各自的桌面端，人在中间实际上是起调度作用，转发、汇总等等工作。其实是浪费时间精力的，人的精力应该放在决策判断上。所以我做了AllChat，你只需要将选择你对应的项目，然后配置好需要参与讨论的Agent，然后输入你的问题/目标，AllChat会协调不同Agent来进行商讨。

但是其中也有几个问题，有时候Agent写的方案不是给人看的，写出来就像一本说明书，非常复杂晦涩。所以我加了一个BOSS Agent，负责与用户的交互。当前方案大致的思路是什么、哪些冲突点需要你来判断，都由BOSS来进行简单直白的翻译。

最后确认方案无异议后用户可以选择Agent来执行。

## 启动

Windows 和 macOS 预览包可在仓库 **Actions → Desktop packages → 对应构建 → Artifacts** 下载。解压到本地后：

- Windows x64：解压完整的 Windows 压缩包，打开 `AllChat/AllChat.exe`。桌面窗口需要 Microsoft Edge WebView2 Runtime。
- Mac：Apple 芯片选择 `macos-arm64`，Intel 选择 `macos-x64`，解压后把 `AllChat.app` 放入应用程序。预览包未经 Apple 公证。

两个版本都内置 Python 服务。项目配置、记录和 `connections.json` 位于 Windows 的 `%LOCALAPPDATA%\AllChat` 或 Mac 的 `~/Library/Application Support/AllChat`。本地 Agent 仍需在该电脑安装并配置。关闭窗口后，已启动的服务会继续处理讨论；重新打开时会连接到它。

桌面预览版面向 Omarchy / Arch Linux x86_64。进入 `desktop` 目录运行 `makepkg -si` 安装后，在应用菜单搜索 **AllChat**。每次打开时，灰阶像素动画会过渡到工作区，点击或按 Esc 可跳过。开启减少动态效果时直接进入工作区。

桌面版在用户会话中运行本地服务。关掉窗口后讨论继续，再次打开可查看结果。桌面项目与记录保存在 `~/.local/state/allchat-desktop`（遵循 `XDG_STATE_HOME`）。桌面版和网页源码版共用连接配置。

### 网页源在本机启动工作区，选择项目文件夹、参会 Agent 和 BOSS。每家先独立出案，再互评和修订。所有人确认同一份共同稿后，可交给指定 Agent 执行。码版

需要 Linux、Python 3.10 或更高版本。系统文件夹选择器使用 Tk。服务和数据库仅依赖 Python 标准库。

```sh
python3 server.py
```

用浏览器打开终端显示的本机地址。点击「创建项目」选择真实目录。也可使用 `python3 server.py --project .` 导入当前目录。端口默认 8787，可用 `--port` 修改。直接打开 `index.html` 仍可体验离线演示，其历史与真实工作区分开。

## 连接

| 入口 | 接入条件 |
| --- | --- |
| Claude Code | 本机 `claude` 已配置模型服务。保留原生会话编号，后续轮次续聊。 |
| Codex CLI | 本机 `codex` 已登录。讨论阶段使用只读模式，交接后在项目中执行。 |
| ChatGPT | 统一的 OpenAI 桌面入口。优先使用配置的桥接或本地 Codex 控制套接字。在带有 `/usr/lib/chatgpt/resources/codex` 的 Linux 安装包上，也可直接启动包内的 Codex 会话服务。记录属于该服务的 Codex 会话。旧配置名「Codex 桌面端」仍可读取。 |
| Gemini CLI | 本机 Gemini CLI，支持 JSON 输出、plan 模式与 resume。 |
| DeepSeek Harness | 识别官方 `dsh` 的帮助信息。通过 `dsh headless` 收发并保留会话号。只找到旧的 `deepseek-harness` 启动器时，可配置桥接。 |
| Claude Desktop | 扫描桌面启动器。自动收发需要对应的桥接或已配置的 Parley 参与者。 |
| 自定义 API | 配置兼容 Chat Completions 的完整 URL、模型和存放密钥的环境变量名。DeepSeek 等在线服务均可在此配置。 |

本地扫描也识别 Grok Build、OpenCode、OpenClaw、Hermes、Pi、MiniMax Code、Kimi Code、Antigravity、Oh My Pi、Copilot CLI、WorkBuddy 和 ZCode。这些入口支持通过所配置的桥接或 Parley 参与讨论。配置页列出已发现的入口，并保留一个自定义 API 选项。

服务读取 `~/.config/allchat/connections.json`，也可通过 `--config` 指定文件。只填写需要的项，修改后重启。配置示例：

```json
{
  "api_url": "http://127.0.0.1:11434/v1/chat/completions",
  "api_model": "your-local-model",
  "api_key_env": "ALLCHAT_API_KEY"
}
```

可选的 `bridges` 字段把入口名称映射到命令参数数组。AllChat 在项目目录运行该程序，向标准输入发送含 `prompt`、`project`、`history`、`session` 和 `mode` 的 JSON。程序向标准输出返回 `{"text":"实际回复","session":"可恢复的会话标识"}`。桥接程序负责与对应的原应用通信，失败时返回非零退出码。

项目若已安装并配置 Parley CLI，可用 `"parley_agents":{"DeepSeek Harness":"你的参与者编号"}` 委派单次调用。使用上游 `parley agents exec` 的产物检查，AllChat 负责阶段转换。原生 CLI、API 和桥接入口可在同一场讨论混用。API 能处理用户选定的材料和文本交付。需要直接读写本地项目时，请选择具备文件工具的执行端。

## 保存与恢复

项目配置和讨论运行状态存入 `~/.local/state/allchat`（遵循 `XDG_STATE_HOME`，可用 `--data-dir` 修改）。每个项目在 `parley-deck/ideas/allchat-<讨论编号>/` 保存提案、互评、个人新版、共同稿、签认和交接记录。AllChat 有自己的工作流状态，未调用上游协议验证器的记录不构成 Parley 严格验证结果。

输入框用于向 BOSS 提问。涉及取舍时使用「补充并继续」登记决定，定稿后也可以「修改要求」。修改方案或名单会触发新的评审和签认。默认最多八轮，配置中可选择不限轮数。

讨论在服务端运行。关闭浏览器后可以继续；服务重启时，已经返回的提交保留。派发中断的调用标作待核对，可查看评审记录里的原生会话编号，再单独重试。执行端可能已经产生文件或费用；调用结果不明时请先核对接收方。

## 验证

```sh
python3 -m unittest -v test_workflow
```
