---
name: plan-then-implement
description: Plan with a stronger model and implement with a faster, cheaper one, handing over a written plan. Use for changes that touch several files, need design choices, or when asked to save cost or split planning from editing.
---

# Plan, then implement

Planning needs the strongest model you have; typing out a well-specified change does not. Split them and hand over a written plan, not the conversation.

Skip this for a one-line fix, a rename or anything you can finish faster than you can describe.

## 1. Plan (strong model, no edits)

Read the code, trace the real flow, decide. Write the plan to a scratch file (not the repo) with:

- the goal in one sentence, and what is out of scope;
- each file to change and the exact change (names, signatures, strings), small enough to apply without redesigning;
- the skills that apply (`compatibility` for settings, caches, tags, asset names; `localization` for user-facing text) and what they require;
- the checks that prove it works (`pnpm typecheck`, `pnpm test:frontend`, `python -m unittest discover -s tests`, Deck tests) and the edge cases to look at.

## 2. Implement (cheaper model)

Give a fresh session or subagent the plan file and the repo, nothing else. One plan per session. It follows the plan, runs the checks and reports what it changed. If the plan is wrong or unclear, it stops and says so instead of improvising.

## 3. Review (strong model)

Read the diff against the plan and rerun the checks yourself; a report that says "done" is not evidence. Send fixes back as short, specific instructions, or make a small one yourself.

## How, per tool

Model names change; pick the strongest and the cheapest you can use.

- **Claude Code:** plan in the main session (plan mode, or `/model` to the strongest), then start the implementer as a subagent or session on a cheaper model (the Agent tool's `model` option, or `start_session` with `model`). Review in the main session.
- **Codex and other agents:** run the plan with the strongest model, then the implementation with a cheaper one, such as `codex exec -m <model> "implement <plan file>"`, and review with the first.
