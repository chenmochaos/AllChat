# ![AllChat · Multi-agent planning automation](docs/readme-intro.gif)

[简体中文](README.md) | **English**

AllChat is a skill for reviewing plans with multiple agents in T3 Code. Each agent drafts a plan independently, then reviews the others' proposals. The agent leading the review, called BOSS, explains the trade-offs that need your judgment. **Once every participant signs off on the same version, you choose who carries it out.**

[Install the skill](#install-the-skill) · [Start a review](#start-a-review)

## Why

When I tackle a complex problem, I give several models, such as Astra, Claude, Gemini, and DeepSeek, the same problem and goal. Each drafts a first proposal, reads the others' work to find blind spots or conflicts, and revises its own plan. Once they agree, I hand the plan to a faster, cheaper model to carry it out.

Doing this across separate desktop apps left me copying messages and summarizing replies. I built AllChat so I could spend that time on decisions. I select a project, choose the agents I want in the discussion, and describe what I want to achieve. AllChat coordinates the review.

Some proposals read like instruction manuals. I added BOSS to explain the plan in plain language and bring me the points where the agents disagree. Once everyone signs off, I choose the agent that will do the work.

## Install the skill

**Ask your agent to install it.** Open a Codex or Claude session in the project where you want to run the review. Send this to the agent that will lead it:

> Install the `allchat-deliberation` skill from https://github.com/chenmochaos/AllChat.skill into this project. Follow the README to choose the directory for your agent, then tell me how to start a review.

**Install it manually.** The skill is already included if you're trying it in this repository. To use it in another project, copy the entire `allchat-deliberation` folder for your lead agent. The last column shows where its `SKILL.md` should sit relative to your project root.

| Lead agent in T3 Code | Folder to copy | File in your project |
| --- | --- | --- |
| Codex | [Codex skill](.agents/skills/allchat-deliberation/) | `.agents/skills/allchat-deliberation/SKILL.md` |
| Claude | [Claude skill](.claude/skills/allchat-deliberation/) | `.claude/skills/allchat-deliberation/SKILL.md` |

## Start a review

Open your project in T3 Code, enter the lead agent's session, and select `allchat-deliberation`. Describe the problem and name at least two participants available in T3 Code.

> Ask Claude and Codex to each propose a way to organize duplicate photos, then have them review each other's plans. Let me decide what to do when two photos have identical content but different filenames. I'll choose who carries out the final plan.

The agent in your session acts as BOSS. It collects all proposals before sharing them for peer review. After the authors revise their plans, BOSS combines them into a common draft. For example, if you say, "List the duplicates first and let me check which ones to act on," BOSS adds that decision to the draft and asks everyone to sign off again. By default, the review runs for up to eight rounds. If disagreements remain, you decide whether to continue. Once everyone approves the same version, you can choose an executor.

AllChat saves proposals, reviews, your decisions, and sign-offs in your project's `parley-deck/ideas/allchat-<discussion-id>/` directory. To pick up in a new session, tell BOSS which discussion to resume.
