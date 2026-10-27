---
name: deckyhub-registry
description: Maintain DeckyHub's curated registry, which lives only in mazillka/deckyhub-registry. Use when adding, removing, renaming or editing a registry app, changing the registry schema, or fixing the registry repo's validate CI.
---

# Maintaining the DeckyHub registry

The curated list lives only in [mazillka/deckyhub-registry](https://github.com/mazillka/deckyhub-registry), `registry/apps.json` on `main`. DeckyHub downloads it at startup (`REMOTE_REGISTRY_URL` in `main.py`) and caches the last good copy; no copy ships in the plugin ZIP. The registry repo's Pages site (`docs/`: catalog `index.html` and `editor.html`, served from `main` `/docs`) loads it live; this repo's promo page renders it at deploy time (`devtools/build-site.py`, run daily by `pages.yml`). Releases from before the move read this repo's old `registry/apps.json` from `main`, which no longer exists, so they keep their cached or bundled list.

The local checkout sits next to this repo: `../deckyhub-registry`. Clone it with `gh repo clone mazillka/deckyhub-registry` if it's missing. Follow [CONTRIBUTING.md](../../../CONTRIBUTING.md#releases): work on a short kebab-case branch, never commit to `main`, one topic per PR, squash-merge.

## Adding, removing or editing an app

1. **Registry repo**, on a branch: edit `registry/apps.json`. Follow the shape of existing entries and the rules in [CONTRIBUTING.md](../../../CONTRIBUTING.md#adding-a-registry-entry):
   - `id` and `repo` unique; `repo` is a strict `owner/name`.
   - `detect` is `{"type": "decky-plugin", "names": [...]}` with the plugin's name exactly as its `plugin.json` reports it. Check the plugin's repo for that file.
   - `asset.include`/`exclude` pick exactly one release ZIP. Check the repo's latest releases (`gh release view -R owner/name --json assets`) and add `releaseTagInclude` when the repo publishes non-plugin releases too.
   - Keep schema version 1 additive (see "Schema changes" below).
   - Update the README's **Repositories** table to match, in `apps.json` order; `scripts/validate.py` (offline part too) fails until it does.
2. Validate it with this repo's parser and schema test, from this repo (the test skips without `DECKYHUB_REGISTRY`):

   ```bash
   DECKYHUB_REGISTRY=../deckyhub-registry/registry/apps.json python -m unittest tests.test_registry_schema
   ```

   Then check the entry against GitHub the way DeckyHub will see it (repository, one matching ZIP per channel, the ZIP's `plugin.json` name in `detect.names`, no clashing ids, repos or detect names), from the registry checkout:

   ```bash
   GITHUB_TOKEN=$(gh auth token) python scripts/validate.py
   ```

   Fix every error. Warnings (no stable release, no SHA-256 digest, renamed or archived repo) are worth a look but don't fail CI.
3. Commit, push and open the registry PR; `main` only accepts squash-merged PRs whose `validate` check passed. Its CI runs both checks. Merge it. Nothing needs syncing into this repo.

## The registry's weekly CI run failed

The registry repo's CI runs `scripts/validate.py` weekly, because a plugin's new release can break its entry (renamed ZIP, a second ZIP, a changed `plugin.json` name) with no change in the registry. Fix the entry in a registry PR.

## Schema changes

`tests/test_registry_schema.py` (here; the registry repo's CI runs it from this repo's `main`) pins schema version 1 for every released DeckyHub:

- A new optional key that older versions safely ignore: add it to `OPTIONAL` in that test (plugin PR first), teach `main.py`/`src/` to use it, then add it to entries.
- Anything else (renaming, retyping, removing, new required meaning): bump `schemaVersion`. Older versions reject the file and keep their cached list, so plan that rollout deliberately.

## Security rules

- Registry entries are trusted project data, but only GitHub release assets of the entry's own `repo` can ever be downloaded.
- Never give an entry a `detect.names` value another entry already uses, and never `DeckyHub`; the plugin drops user-added entries that try, and the official list should never need to.
