---
name: safe-edits
description: Avoid the editing mistakes that have bitten this repo - CRLF line endings, JSON files with silently duplicated keys, hand-merged conflicts, work committed on the wrong branch, pushes to someone else's fork, and end-to-end tests that race the app. Use before bulk-editing files with a script, resolving a merge conflict, committing, pushing, or writing an end-to-end test.
---

# Safe edits

## Line endings

On Windows the working copy is often CRLF while a search string written in a script is LF, so `str.replace` silently finds nothing (or an assertion fires). In a script: read the file, note whether it contained `\r\n`, edit the LF text, write it back in the same style. Check with `python -c "print('\r\n' in open(p, newline='').read())"` rather than `grep -c $'\r'`.

## JSON and the registry

- Python's `json.loads` accepts a repeated key and keeps the last, so a mangled merge can parse fine and still be wrong. After editing `registry/apps.json` (or any data file), check duplicates with `json.loads(text, object_pairs_hook=...)` and that the entry count and the last two ids are what you expect. `git diff origin/develop --stat` should show only the lines you meant.
- Conflict hunks split entries in half. Never concatenate the two sides of a hunk: take one side of the file whole and re-add your entry (and its README row, in the same order) on top.

## Branches and pushes

- Before editing, `git branch --show-current`. Start each topic with `git switch -c <topic> origin/develop`; a test written on one topic's branch is lost to the next.
- `git stash` then `git switch` then `git stash pop` can conflict when the target moved; read `git status` after it, resolve, and drop the stash only once clean.
- Never push to a URL you typed from memory. A contributor's fork branch is theirs: push to it only after the user says so (the PR's `maintainerCanModify` must be true), using the PR's own `headRepository`.
- Never merge a PR, tag, or edit a release without the user's OK for that action.

## End-to-end tests (`devtools/decky-mock/e2e/deckyhub.spec.ts`)

- The mock bridge needs about a minute to load the registry: run with `--timeout=150000`, or a `beforeAll` times out at 30 s.
- The Experimental style is applied after settings load and rebuilds the page: wait for `.dh-exp-nav` before acting, or state (a search, a form) is lost.
- That style has its own Search tab, so `getByRole("button", { name: "Search" })` can hit the tab; press Enter in the field instead.
- Result headings carry the full `owner/name` as their accessible name.
- Restore `uiStyle` to `default` in a `finally`, and remove seeded plugins (`seedPlugin` returns the remover).
