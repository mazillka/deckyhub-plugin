---
name: deckyhub-registry
description: Maintain DeckyHub's curated registry across its two repositories, mazillka/deckyhub-registry (source of truth) and mazillka/deckyhub-plugin (bundled copy). Use when adding, removing, renaming or editing a registry app, changing the registry schema, syncing the bundled registry/apps.json and README table, or fixing the "Bundled registry matches mazillka/deckyhub-registry" CI step.
---

# Maintaining the DeckyHub registry

The curated list lives in two places that must stay byte-identical:

| Repository | File | Who reads it |
| --- | --- | --- |
| [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry) | `registry/apps.json` on `main` | DeckyHub releases that include the move (`REMOTE_REGISTRY_URL` in `main.py`) |
| [mazillka/deckyhub-plugin](https://github.com/mazillka/deckyhub-plugin) | `registry/apps.json` on `main` | Releases from before the move, the bundled offline fallback in the ZIP, the Pages catalog and editor |

Edit the registry repo first, then sync the plugin repo. Never edit the plugin's copy by hand.

Local checkouts sit side by side: `../deckyhub-registry` next to this repo. Clone it with `gh repo clone mazillka/deckyhub-registry` if it's missing. Both repos follow [CONTRIBUTING.md](../../../CONTRIBUTING.md#releases): work on a short kebab-case branch, never commit to `main`, one topic per PR, squash-merge.

## Adding, removing or editing an app

1. **Registry repo**, on a branch: edit `registry/apps.json`. Follow the shape of existing entries and the rules in [CONTRIBUTING.md](../../../CONTRIBUTING.md#adding-a-registry-entry):
   - `id` and `repo` unique; `repo` is a strict `owner/name`.
   - `detect` is `{"type": "decky-plugin", "names": [...]}` with the plugin's name exactly as its `plugin.json` reports it. Check the plugin's repo for that file.
   - `asset.include`/`exclude` pick exactly one release ZIP. Check the repo's latest releases (`gh release view -R owner/name --json assets`) and add `releaseTagInclude` when the repo publishes non-plugin releases too.
   - Keep schema version 1 additive (see "Schema changes" below).
2. Validate it with this repo's own parser and schema test, from this repo:

   ```bash
   DECKYHUB_REGISTRY=../deckyhub-registry/registry/apps.json python -m unittest tests.test_registry_schema
   ```

   Then check the entry against GitHub the way DeckyHub will see it (repository, one matching ZIP per channel, the ZIP's `plugin.json` name in `detect.names`, no clashing ids, repos or detect names), from the registry checkout:

   ```bash
   GITHUB_TOKEN=$(gh auth token) python scripts/validate.py
   ```

   Fix every error. Warnings (no stable release, no SHA-256 digest, renamed or archived repo) are worth a look but don't fail CI.
3. Commit, push and open the registry PR; `main` only accepts squash-merged PRs whose `validate` check passed. Its CI runs both checks. Merge it.
4. **Plugin repo**, from a clean working tree: open the sync PR in one command:

   ```bash
   python devtools/sync-registry.py --pr
   ```

   It branches from `origin/main`, copies the merged registry into `registry/apps.json`, regenerates README's **Bundled repositories** table, bumps `package.json` to the next pre-release (`2.1.1-rc.N` -> `rc.N+1`; a stable `X.Y.Z` -> `X.Y.(Z+1)-rc.1`), runs the backend tests, commits, pushes and runs `gh pr create`, titled like `feat: add <App> to the registry (<version>)`. If nothing changed it says so and leaves no branch.

   Without `--pr` it only rewrites the two files, for doing the rest by hand; pass a path to sync from an unmerged registry branch: `python devtools/sync-registry.py ../deckyhub-registry/registry/apps.json`.
5. Check the PR's CI and merge it.

Order matters: a plugin PR opened before the registry PR merges fails the CI sync step, because that step compares against the registry repo's `main`.

## The "Bundled registry matches" CI step failed

The plugin's copy differs from the registry repo's `main`. Usually a registry PR merged without its sync. Run `python devtools/sync-registry.py --pr` for a sync PR of its own, or plain `python devtools/sync-registry.py` on the failing branch, then commit and push. Don't "fix" it by editing the registry repo to match a stale plugin copy.

## The registry's weekly CI run failed

The registry repo's CI runs `scripts/validate.py` weekly, because a plugin's new release can break its entry (renamed ZIP, a second ZIP, a changed `plugin.json` name) with no change in the registry. Fix the entry in a registry PR, then sync the plugin repo as usual.

## Schema changes

`tests/test_registry_schema.py` pins schema version 1 for every released DeckyHub:

- A new optional key that older versions safely ignore: add it to `OPTIONAL` in that test (plugin PR first, since the registry repo's CI runs the plugin's test from `main`), teach `main.py`/`src/` to use it, then add it to entries.
- Anything else (renaming, retyping, removing, new required meaning): bump `schemaVersion`. Older versions reject the file and keep their cached or bundled list, so plan that rollout deliberately.

## Security rules

- Registry entries are trusted project data, but only GitHub release assets of the entry's own `repo` can ever be downloaded.
- Never give an entry a `detect.names` value another entry already uses, and never `DeckyHub`; the plugin drops user-added entries that try, and the official list should never need to.
