---
name: branches
description: Branch strategy - which branch work starts from and merges into, how PRs are merged, shipping develop to main and the back-merge, when a change needs a version bump and release, and how to clean up old branches safely. Use when starting work, opening or merging a PR, releasing or shipping, moving work that sits on an already merged branch, or deleting outdated branches.
---

# Branches

This skill is the same in every repo that uses it. What only one repo has (extra or generated branches, required checks, release steps, which paths users install) is in that repo's AGENTS.md, section **Branches and releases**. Read it too.

| Branch | What it is | Who writes to it |
| --- | --- | --- |
| `main` | Production and the default branch: what users get. | Squashed PRs from `develop` |
| `develop` | Where all work lands first. | Squashed topic PRs, and the back-merge from `main` |
| `<topic>` | One change each, short kebab-case (`fork-badge`, `add-<plugin>`); add an ISO date only to make a name unique. | You |

`main` and `develop` are protected by rulesets: no direct pushes, no deletion, and a PR must pass the required checks. `.githooks/pre-commit` blocks local commits on them; turn it on once per checkout with `git config core.hooksPath .githooks`.

Never push to `main` or `develop`, and never merge a PR without the user's OK, even when CI is green.

## Starting work

```bash
git fetch origin
git switch -c <topic> origin/develop
gh pr create --base develop
```

One topic per PR, merged with **Squash and merge**; its title becomes the commit on `develop` (`feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`).

If the branch you're on was already merged (`gh pr list --state all --head <branch>` says MERGED, or its upstream shows `[gone]`), move uncommitted work to a fresh branch instead of committing there:

```bash
git stash && git switch -c <new-topic> origin/develop && git stash pop
```

A topic branch that falls behind `develop` takes `git merge origin/develop`; don't rebase a branch that's already pushed for review.

## Shipping develop to main

1. A PR from `develop` into `main`, merged with **Squash and merge** once the user approves.
2. Right after, the back-merge: a PR from `main` into `develop` titled `chore: merge main back into develop`, merged with **Create a merge commit**, the one PR that isn't squashed. Without it the next `develop` → `main` PR conflicts, because the squash made a commit `develop` never got.

## When a change needs a release

A version bump, tag and release are only for changes to what users install (AGENTS.md lists those paths). Everything else ships by the steps above with no version bump, tag or release:

- `.md` files, the website, `devtools/`, tests and CI-only changes;
- data the app reads at runtime from another repo or branch (a registry, an index, scan results).

A release with nothing new to install still shows every user an update. The exception is a data change the installed app can't read yet: release the app first, then change the data (the `compatibility` skill covers the order).

## Cleaning up old branches

Squash merges leave no merge in the history, so `git branch --merged` misses them. Judge each branch this way:

```bash
git fetch --prune origin
git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads   # [gone]: its remote branch was deleted
git branch -r                                                               # remote branches a repo doesn't auto-delete
gh pr list --state all --head <branch> --json number,state,title            # MERGED, CLOSED or OPEN
git cherry origin/develop <branch> | grep -c '^+'                           # commits whose changes develop lacks
git worktree list                                                           # branches checked out somewhere
```

- **Safe:** its PR is merged, or it has no commits `develop` lacks. Delete with `git branch -D <branch>` (a squash-merged branch needs `-D`) and `git push origin --delete <branch>` if the remote branch is still there.
- **Ask first:** commits `develop` lacks and no merged PR (a closed PR, or none). Show the user what they are (`git log --oneline origin/develop..<branch>`) and whether later work replaced them.
- **Keep:** `main`, `develop`, every branch AGENTS.md says a workflow owns, anything with an open PR, the branch you're on, and any branch checked out in a worktree with uncommitted changes (`git -C <worktree> status --short`). Remove a clean worktree with `git worktree remove <path>` before deleting its branch.

Deleting a branch can't be undone once its commits are pruned: list what you'll delete and get the user's OK first.
