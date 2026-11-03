---
name: token-efficiency
description: Reduce context and output tokens during Codex or Claude Code work when asked to conserve tokens, shrink context, or handle verbose tools.
---

# Token efficiency

- Inspect a diff, symbol search, or targeted line range before opening whole files. For CI failures, start with the failing step and assertion. Expand only when evidence is missing.
- Cap noisy command output. Keep the exit status, failing assertion, and relevant context. Avoid repeating logs, diffs, or tool results in prose.
- Reuse facts already established in the conversation. After compaction, retain the objective, constraints, decisions, evidence, and next action. Read earlier material again only to resolve a gap.
- Run the smallest check that exercises the change, plus required repository gates. Summarize passing checks and explain actionable failures.
- Keep updates and final answers concise. Preserve user requirements, correctness checks, and material limitations.
