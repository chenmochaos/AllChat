# ![AllChat · Multi-agent planning automation](docs/readme-intro.gif)

AllChat 是一个在 T3 Code 中使用的多 Agent 方案评审 Skill。各个 Agent 先独立出方案，再互相挑问题。BOSS 把需要你拍板的取舍讲清楚。**只有全员确认同一版方案，才交给你选的 Agent 执行。**

[安装 Skill](#安装-skill) · [发起评审](#发起评审)

## Why

我遇到复杂问题的工作流是这样的：首先根据我的问题以及我要达到的目标，让几个很聪明的AI（如Astra、Claude、Gemini、deepseek）各自出一个v1方案，随后各自审查其余AI的方案、发现盲点或冲突，生成v2版本，再继续审查，以此类推，直到方案基本一致且无异议。然后交由便宜迅速的模型来执行。

但是不同的Agent有各自的桌面端，人在中间实际上是起调度作用，转发、汇总等等工作。其实是浪费时间精力的，人的精力应该放在决策判断上。所以我做了AllChat，你只需要将选择你对应的项目，然后配置好需要参与讨论的Agent，然后输入你的问题/目标，AllChat会协调不同Agent来进行商讨。

但是其中也有几个问题，有时候Agent写的方案不是给人看的，写出来就像一本说明书，非常复杂晦涩。所以我加了一个BOSS Agent，负责与用户的交互。当前方案大致的思路是什么、哪些冲突点需要你来判断，都由BOSS来进行简单直白的翻译。

最后确认方案无异议后用户可以选择Agent来执行。

## 安装 Skill

**让 Agent 安装。** 在目标项目里打开你准备用来主持评审的 Codex 或 Claude 会话，把下面这句话发给它：

> 请从 https://github.com/chenmochaos/AllChat 安装 `allchat-deliberation` Skill 到当前项目。按 README 选择适合你自己的目录，装好后告诉我怎么调用。

**手动安装。**

在本仓库试用时，Skill 已随仓库提供。在自己的项目中使用时，根据**主持讨论的 Agent** 选择下面一项，将整个 `allchat-deliberation` 文件夹放到目标项目根目录下的对应位置。

| T3 中的主持 Agent | 仓库里的文件夹 | 目标项目中的位置 |
| --- | --- | --- |
| Codex | [Codex Skill](.agents/skills/allchat-deliberation/) | `.agents/skills/allchat-deliberation/SKILL.md` |
| Claude | [Claude Skill](.claude/skills/allchat-deliberation/) | `.claude/skills/allchat-deliberation/SKILL.md` |

## 发起评审

用 T3 Code 打开目标项目，进入对应的 Agent 会话，选择 `allchat-deliberation`。在消息里写明要解决的问题，并点名至少两位 T3 可调用的参与者。

> 请让 Claude 和 Codex 各自给一版重复照片整理方案，再互相评审。照片内容一样、文件名不同时，把处理方式留给我选。定稿后我再指定谁来执行。

当前会话里的 Agent 担任 BOSS。它收齐各家的独立提案后再分发互评，等作者各自修订后整理共同稿。如果你决定“先列清单，由我勾选”，BOSS 会把这个决定写进新版，请每位参与者重新确认。默认最多评审八轮，仍有分歧时由你决定是否继续。全员确认同一版后，你就可以选执行者。

提案、评审意见、用户决定和签认记录保存在项目的 `parley-deck/ideas/allchat-<讨论标识>/`。在新会话里继续时，告诉 BOSS 要恢复哪一场讨论即可。
