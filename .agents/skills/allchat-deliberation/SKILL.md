---
name: allchat-deliberation
description: Run an auditable multi-agent planning and sign-off workflow in T3 Code. Use when the user asks for a proposal to be independently drafted, challenged, revised, agreed, or handed to an executor.
---

# AllChat Deliberation

Use T3 Code for agent sessions and cross-provider delegation. Keep the workflow state and canonical record in the current project's `parley-deck/ideas/` directory. Do not claim consensus unless every active participant explicitly approves the exact current plan revision.

## Start

1. The current T3 agent is the BOSS/facilitator. It explains progress to the user, merges proposals, and records user decisions. It has no vote unless the user explicitly adds it as a participant. Call `orchestrator_capabilities` once before the first delegation. Use `delegate_task` for other providers or models, and `task_status` to follow delegated work. Do not message a delegated thread directly. Start the participants the user requests, or ask who should participate when the roster materially affects the result. Use at least two participants for a deliberation.
2. Create `parley-deck/ideas/allchat-<slug>/00-prompt.md` and `discussion.json`. Record the request, project, roster, facilitator, round limit (default eight review rounds), selected materials, and current stage. Use a unique slug and never overwrite an existing discussion.
3. Ask each participant for an independent complete proposal before sharing other proposals. Keep each participant's response separate in `round-01/draft-<participant>.md`. Do not reveal peer proposals during this phase.

## Review rounds

For each round, carry out these phases in order. A round means review, individual revision, merged plan, and sign-off.

1. **Review.** Give each participant every other participant's latest proposal and the previous common plan. Ask for specific, actionable objections with author and quoted passage, or an explicit statement of no objection. Save replies under `round-NN/review-<participant>.md`.
2. **Revise.** Give each author their own latest proposal and all reviews. Ask for a complete replacement proposal, with each objection marked accepted or declined and a reason. Save under `round-NN/revise-<participant>.md`.
3. **Merge.** The facilitator writes one concise user-facing summary and a complete executable common plan with goal, assumptions, steps, risks, unresolved objections, and verifiable acceptance criteria. Save the full plan as `common-vN.md`. Compute SHA-256 over the exact UTF-8 plan body and record it as that revision's digest in `discussion.json`.
4. **Resolve user choices.** If disagreement is about user preference or tradeoffs, pause and ask the user. State the options, consequences, and a recommendation with its reason. Record the user's answer in `decisions.md` and `discussion.json`, then start another review round with that decision included. Technical factual disagreement should be investigated and cited or tested, then included in the next round. Do not turn a facilitator preference into a user decision.
5. **Sign off.** Send every participant the exact common plan and digest. Ask for strict JSON with `revision`, `approve`, and `objection`. Accept approval only when the revision matches exactly, `approve` is a boolean, and `objection` is empty for approval or concrete for rejection. Save each response in `round-NN/vote-<participant>.json`. A missing, timed-out, failed, malformed, or stale response is pending, never approval.
6. If any participant objects, include the objection in the next review round. If the round limit is reached with unresolved objections, pause and ask whether to add review rounds or end with unresolved items recorded. Ending is not consensus and cannot be handed off as an approved plan.
7. Any change to the common plan, decision, or participant roster invalidates all prior votes. Require every active participant to sign the new digest.

## Handoff

Only after every active participant approves the same digest, write `FINAL.md` with the exact approved plan and record all votes and the final digest in `discussion.json`. Ask the user to select the executor if they have not already done so. Delegate the approved goal, exact plan, user decisions, selected materials, and acceptance criteria to that executor. Record the handoff request and returned T3 task reference. Report delivery separately from completed execution. If execution requires changing an approved requirement, pause and return to review.

## Resume and recordkeeping

On resume, read `discussion.json` and all artifacts for its active round before dispatching work. Reconcile outstanding T3 delegated tasks with `task_status`. Never blindly duplicate a delegation whose outcome is unknown. Keep original replies intact, append corrections as new artifacts, and update `discussion.json` after every phase with stage, round, current plan digest, participants, task references, decisions, votes, and unresolved work.

Keep user-facing summaries brief and in plain language. Link specific claims to the relevant saved proposal or review. Do not imply that the T3 agent's ordinary coding review is a multi-agent deliberation unless the required participant artifacts and votes exist.
