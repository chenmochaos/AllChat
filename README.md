# AllChat

在本机启动工作区，选择项目文件夹、参会 Agent 和 BOSS。每家先独立出案，再互评和修订。所有人确认同一份共同稿后，可交给指定 Agent 执行。

## 启动

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
