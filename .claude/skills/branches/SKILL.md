---
name: branches
description: DeckyHub's branch strategy - which branch work starts from and merges into, how PRs are merged, how releases and the main → develop back-merge go, and how to clean up old branches safely. Use when starting work, opening or merging a PR, releasing, moving work that sits on an already merged branch, or deleting outdated branches.
---

# Branches

| Branch | What it is | Who writes to it |
| --- | --- | --- |
| `main` | Stable releases only; the default branch. Stable tags `vX.Y.Z` go here. | Release PRs from `develop` |
| `develop` | Where all work lands. Pre-release tags `vX.Y.Z-rc.N` go here. | Squashed topic PRs, and the back-merge from `main` |
| `<topic>` | One topic each, short kebab-case (`fork-badge`, `settings-tabs`); add an ISO date only to make a name unique. | You |
| `.claude/worktrees/*` | Other Claude sessions' worktrees, each on its own topic branch. | Their sessions |

Both `main` and `develop` are protected by rulesets (`protect-main`, `protect-develop`): no direct pushes, no deletion, and a PR must pass `test`, `review` and both `analyze` checks. `.githooks/pre-commit` blocks local commits on `main`, `develop` and `staging`; turn it on once per checkout with `git config core.hooksPath .githooks`.

Never merge a PR without the user's OK, even when CI is green.

## Starting work

```bash
git fetch origin
git switch -c <topic> origin/develop
```

Then open the PR against `develop`: `gh pr create --base develop`. Keep each PR to one topic: it's merged with **Squash and merge**, and its title becomes the commit message on `develop` (`feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`).

GitHub deletes a topic branch once its PR merges, so a local branch whose upstream shows `[gone]` has been merged or closed. If you still have work on it (`git status` shows changes), move it onto a fresh branch instead of committing there:

```bash
git stash && git switch -c <new-topic> origin/develop && git stash pop
```

A topic branch that falls behind `develop` takes `git merge origin/develop`; don't rebase a branch that's already pushed for review.

## Releasing

- **Pre-release:** bump `version` in `package.json` to `X.Y.Z-rc.N` in a PR to `develop` (`chore: version X.Y.Z-rc.N`), then tag that commit on `develop` with `vX.Y.Z-rc.N`.
- **Stable:** a PR from `develop` into `main` titled `release: X.Y.Z`, squashed, then tag `vX.Y.Z` on `main`.
- **Back-merge, right after every stable release:** a PR from `main` into `develop` titled `chore: merge main back into develop (X.Y.Z)`, merged with **Create a merge commit**, the one PR that isn't squashed. Without it the next `develop` → `main` PR conflicts, because the squash made a commit `develop` never got.

The tag starts `release.yml`; release notes and the rest are in CONTRIBUTING.md's Releases section and AGENTS.md's Release section. Changes users already depend on (settings, caches, asset names, tags) need the `compatibility` skill first.

## Cleaning up old branches

Squash merges leave no merge in the history, so `git branch --merged` misses them. Judge each branch this way:

```bash
git fetch --prune origin
git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads   # [gone]: its remote branch was deleted
gh pr list --state all --head <branch> --json number,state,title            # MERGED, CLOSED or OPEN
git cherry origin/develop <branch> | grep -c '^+'                           # commits whose changes develop lacks
git worktree list                                                           # branches checked out somewhere
```

- **Safe:** its PR is merged, or it has no commits `develop` lacks. Delete with `git branch -D <branch>`, which a squash-merged branch needs, and `git push origin --delete <branch>` if the remote branch is still there.
- **Ask first:** commits `develop` lacks and no merged PR (a closed PR, or none). Show the user what they are (`git log --oneline origin/develop..<branch>`) and whether later work replaced them.
- **Keep:** `main`, `develop`, anything with an open PR, the branch you're on, and any branch checked out in a worktree with uncommitted changes (`git -C <worktree> status --short`). Remove a clean worktree with `git worktree remove <path>` before deleting its branch.

Deleting a branch can't be undone once its commits are pruned: list what you'll delete and get the user's OK first.
