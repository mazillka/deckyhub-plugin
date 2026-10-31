---
name: compatibility
description: Keep DeckyHub working for existing users across updates - their saved settings and caches, the self-update path from older releases, and the registry data every release reads. Use before changing settings keys, caches, release asset names or tags, what DeckyHub reads from the registry or release index, or anything else an installed or older DeckyHub depends on.
---

# Backward compatibility

DeckyHub is in production. People update from any older release (or never update), keep their settings and caches across updates, and their DeckyHub reads data published by mazillka/deckyhub-registry. A change is only done when it works for all of them, not just a fresh install of the newest build.

## What must keep working

| Surface | Where | Rule |
| --- | --- | --- |
| Saved settings | `settings.json` in Decky's settings dir, `_coerce_settings()` / `_load_settings()` in `main.py` | A new key gets a default for files that lack it (old installs); an unknown or invalid value falls back to the default. Never rename a key or change what a value means: an old file would silently lose the user's choice. |
| Registry caches | `registry-cache.json` (stable), `registry-cache-prerelease.json`, `registries/<hash>.json` | Keep the names; a new format must still read the old file, or ignore it and fetch again. A broken or empty download never replaces a good cache. |
| Release cache | `localStorage` keys starting `deckyhub-releases:` (`readCache`/`writeCache` in `src/releases.ts`) | Entries written by an older build must parse or be ignored, never crash a page. |
| Self-update | `DeckyHub-vX.Y.Z.zip` with a SHA-256 digest on a `vX.Y.Z` / `vX.Y.Z-rc.N` release (`release.yml`), found by `/^DeckyHub-.*\.zip$/` in `listDeckyHubReleases()` | Old releases find updates this way forever: never rename the asset, drop the digest, or change the tag scheme. |
| Official registry | `REMOTE_REGISTRY_URL` (registry `main`), `PRERELEASE_REGISTRY_URL` (`develop`, opt-in); newer builds read the same file from the channel's newest registry release first (`newest_registry_release()`), the branch file as fallback | Schema version 1 (`tests/test_registry_schema.py`); a file over `MAX_REMOTE_REGISTRY_BYTES` is refused. It's 4 MB now, but releases up to 3.0.0 refuse anything over 512 KB and keep that limit, so the registry's CI holds `apps.json` under 512 KB. |
| Release index and stats | `release-index` / `release-index-develop` branches; `fetchReleaseIndex()`, `fetchPluginStats()`, `PluginStats` | Read only fields the registry already publishes, and treat every one as optional. The registry's CI checks it never drops what this repo's `main` reads. |
| User-added registries | `customRegistries`, `validate_registry_url()`, `parse_registry()` | Third parties publish these and never update them: a new optional key must have a default when it's missing, and a stricter check must not drop entries that loaded before without a clear reason. |
| Decky Loader | `@decky/api`, `@decky/ui`, backend routes | Keep working on the Decky Loader versions people run (3.2.x was seen on a Deck); check a new API exists there before relying on it. |

## Rules

1. **Old data in, no crash out.** Every value read from disk, `localStorage` or the network may come from an older (or newer) version: coerce it, default it, or skip it.
2. **New behavior is opt-in.** Defaults stay what users have today. The Registry channel is the example: Stable by default, and Pre-release falls back to stable data when develop's can't be read.
3. **Add first, remove later.** To replace a key, file, URL or field, read the new one and fall back to the old, release that, and remove the old one only in a later release, once the user agrees no supported version needs it.
4. **Registry changes go first.** When DeckyHub needs new registry data, the registry publishes it first (additively), then DeckyHub reads it. See that repo's `compatibility` skill.

## Checking a change

- Unit tests: `npm run test:backend` covers settings coercion (`tests/test_plugin_status.py`) and registry loading and caches (`tests/test_custom_registries.py`); add a case that loads an **old** settings file or cache whenever you touch them.
- Typecheck and build: `pnpm typecheck`, then build.
- Upgrade on a Deck (`deck-test` skill): with the current release installed and some settings changed, deploy the new build and check that settings, custom repositories and registries, and cached lists are all still there. For a self-update change, install an older release and let it update itself.
- In the PR, say what an existing user sees after updating. Anything other than "the same, plus the new feature" needs the user's OK first.
