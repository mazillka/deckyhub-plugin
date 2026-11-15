---
name: code-quality
description: Keep DeckyHub's code well organized, easy for people to read, review and maintain, and in line with Decky Loader's plugin conventions. Use when writing or changing code in src/, main.py, py_modules/, installer/ or devtools/, when reviewing a diff or PR, or when asked to review, audit, clean up or refactor the code.
---

# Code quality

Code here is read far more than it's written, often by someone reviewing a PR on a phone. Optimize for that reader: small focused files, obvious names, one concern per change, and the same patterns everywhere. The project's structural rules live in [AGENTS.md](../../../AGENTS.md#development-rules) and [SKILLS.md](../../../SKILLS.md); this skill gathers them into one checklist and adds what they don't cover.

## Organization

- **Frontend layout** (AGENTS.md "Split UI into components"): pages in `src/pages/` own state, loading and handlers; each visual section is a component in `src/components/` taking data and callbacks as props; data loading can be a hook in `src/hooks/`; non-UI code is one module per concern (`github.ts`, `releases.ts`, `install.ts`, ...). `src/utils.ts` only re-exports.
- **Size**: split a file once it passes about 300 lines or mixes data loading with layout; a component should fit on one screen. i18n files are the exception.
- **Backend**: `main.py` holds the `Plugin` class (Decky's entry point) and its lifecycle; everything else is one module per concern in `py_modules/deckyhub/` (Decky's convention: the loader adds `py_modules/` to `sys.path`), each with a mixin for its RPC methods and plain functions for the rest, testable without a `Plugin`. A new concern gets a new module and mixin, not more code in `main.py`; AGENTS.md lists them.
- **One home per fact**: a constant, URL, style or rule lives in one place and is imported. Look before adding: `styles.ts` for styles, `format.ts` for formatting, `fetchReleases()` for GitHub releases, `showDownloadModal()` for downloads, `DetailsWindow` for version windows, `openExternalWeb()` for links.
- **Don't widen a module's job**: a helper that needs React or `@decky/*` doesn't belong in `version.ts`, `notes.ts` or the raw cache, which Node's test runner loads.

## Readable for reviewers

- **Names say what, comments say why.** A comment explains a constraint the code can't show (a Steam quirk, a Decky version, a rate limit), in one or two lines. No comments that restate the code, no commented-out code, no TODOs without an issue link.
- **Lines a person can read.** Break JSX with more than two or three props or children across lines, one prop or child per line. Pull a long inline expression (a filter, a map with a condition, a nested ternary) into a named `const` or function above the JSX. Same in Python: no 150-character comprehension with three conditions; give it a name.
- **No magic values.** Timeouts, sizes, limits and colors get a named constant (`CACHE_TTL`, `CHECK_EVERY`, `MAX_REMOTE_REGISTRY_BYTES`). Colors and repeated inline styles go in `styles.ts` (or `experimental/theme.tsx` for the experimental style), not as hex literals in components.
- **Small, single-purpose changes.** One concern per commit and PR (the `split-commit` skill splits a mixed working tree). A refactor and a behavior change are separate commits, so the reviewer can check the refactor changes nothing.
- **Delete, don't deprecate in place.** Unused exports, props, settings readers and branches go, unless the `compatibility` skill says an older install still needs them.

## TypeScript and React

- `strict` stays on. No `@ts-ignore`, and `any` only at a real boundary (raw JSON from GitHub, `window.SteamClient`, a `@decky/ui` prop the types lack), narrowed to a named type right there. Prefer `unknown` plus a type guard (`isAuditWarning()` in `types.ts` is the model) over `as` casts.
- Every effect that adds a listener, interval or timeout returns a cleanup that removes it. Everything `definePlugin()` registers (routes, events, tabs, timers) is undone in `onDismount`.
- A component shown with `showModal()` gets `t` as a prop; it can't call `useT()` (AGENTS.md).
- Errors reach the user as a toast or inline message built with `t`/`tr`, never a bare `String(error)` of an internal object; log details with `log()` (`src/log.ts`).
- No new runtime dependency for a few lines of code. The ZIP ships `dist/index.js` plus the per-language chunks; every package grows `index.js`.

## Python backend

- Standard library only (AGENTS.md). Type hints on every function signature.
- Never block the event loop: file, network and subprocess work in an `async` method goes through `asyncio.to_thread()`.
- Validate every RPC argument at the top of the method (types, `REPOSITORY_NAME`, HTTPS, basenames, sizes) before using it; the frontend is not a trust boundary.
- Catch the specific exceptions you expect (`OSError`, `json.JSONDecodeError`, `URLError`, ...). `except Exception` only at the top of a background task, and it logs.
- Log with `decky.logger`, never `print`. Paths come from `decky.DECKY_*` constants, never a hard-coded `/home/deck`.

## Decky Loader plugin conventions

Compare with [decky-plugin-template](https://github.com/SteamDeckHomebrew/decky-plugin-template) and decky-loader's `backend/decky_loader/` when in doubt.

- **`plugin.json`**: `name`, `author`, `flags`, `api_version: 2`, `publish` (`tags`, `description`, `image`). Don't rename `name`: Decky and the self-update find DeckyHub by it.
- **`package.json`**: `version` is the plugin version (Decky reads it); `@decky/api` is a runtime dependency, `@decky/ui` and `@decky/rollup` are dev dependencies; the build is `@decky/rollup` with no custom bundling.
- **Release ZIP**: one top-level folder named after the plugin, holding `dist/index.js` and the `dist/<lang>-<hash>.js` language chunks, `main.py`, `plugin.json`, `package.json`, `LICENSE.md` and `py_modules/` (plus `defaults/` if added). `release.yml` builds it; keep `decky plugin build`'s layout.
- **Backend lifecycle**: `Plugin._main()` starts work, `_unload()` stops it (cancel background tasks, close what's open), `_uninstall()` removes what DeckyHub created outside Decky's own settings and runtime folders. RPC methods are `async`, snake_case, return JSON-safe values, and match `callable()` names in `src/api.ts`.
- **Frontend**: talk to the backend only through `callable()`/`addEventListener()` from `@decky/api` (wrapped in `src/api.ts`); reach Decky Loader's global routes only through `getDeckyBackend()`. Use `@decky/ui` components so controller focus works, wrap custom layouts in `Focusable` with a valid `flow-children` (AGENTS.md), and add a stand-in to `devtools/decky-mock/ui.tsx` for any new `@decky/ui` import.
- **Events**: backend → frontend with `decky.emit()`; frontend cross-component signals with window `CustomEvent`s (`REGISTRY_UPDATED`, `LOCALE_CHANGED`).

## Reviewing code

Read the changed code and what calls it, then check, in this order:

1. **Correct**: does it do what the PR says, for empty, missing, old and failed inputs (the `compatibility` skill for saved data)?
2. **Safe**: the [Security](../../../SKILLS.md#security) rules and AGENTS.md's security boundaries.
3. **Placed right**: the Organization rules above; nothing duplicated that already exists.
4. **Readable**: the reviewer rules above.
5. **Decky conventions**: lifecycle, cleanup, focus, mock stand-ins.
6. **Covered**: a test that would fail if the change broke (the `test-hygiene` skill); text translated (`localization`); docs updated (SKILLS.md "Docs and website").

Report each finding with `file:line`, what goes wrong and for whom, and the smallest fix. Rank by impact; skip pure taste.

Before finishing any change: `pnpm run lint` (`pnpm run format` fixes what it can), `pnpm run typecheck`, `pnpm run build`, `pnpm run test:frontend`, `pnpm run test:backend`.
