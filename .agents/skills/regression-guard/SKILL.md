---
name: regression-guard
description: Check a change reaches every place it must and breaks nothing before calling it done - every UI style, the website, the browser extension and the registry, every locale, and a test that fails without the fix. Use before finishing or opening a PR for any UI, badge, wording, settings or registry-data change, and when fixing a bug.
---

# Regression guard

A change is done when it holds everywhere users see it, not when one screen looks right.

## 1. List every place it must reach, then tick each off

- **Two UI styles.** Default and Experimental render separately (`src/components/AppBadges.tsx` is shared; `src/components/experimental/` is not). Anything a page shows or a button does must be checked in both. Experimental swaps tabs with state and never changes the route (`src/components/experimental/ExpNavBar.tsx`), so code that navigates to a route can do nothing there.
- **Quick Access and full pages.** The same component renders in the Quick Access panel and on `/deckyhub/*` pages; check both.
- **Badge or info changes mirror across surfaces** (the user's rule: informative, equal changes): the plugin (`src/components/AppBadges.tsx`, Discover's legend in `ContentHeader.tsx`), the website and its Paired devices page (mazillka/deckyhub-site), the browser extension (`contentscript.ts`, its `badge-parity` skill), the registry data (`stats.json`), and the website's guide and help pages (also there).
- **Every locale.** A new string goes into all of `src/i18n/*.ts` (the `localization` skill); the type check fails on a missing key, `tests/i18n.test.ts` on a broken `{placeholder}`.
- **Special cases the app already has:** store-only plugins (`store: true`) show only the In Decky store badge; unverified-identity plugins (`identityUnverified`) cannot be installed or updated the normal way; pre-release-only plugins; a plugin installed but absent from the registry.
- **What installed users depend on** (settings keys, caches, registry fields): the `compatibility` skill, before the change, not after.

## 2. A bug gets a test that fails without the fix

Write or extend the test, see it fail on the old code (`git stash` the fix, or run it before editing), then see it pass. A test that was never red proves nothing (`test-hygiene`). UI behaviour belongs in `devtools/decky-mock/e2e/deckyhub.spec.ts`, once per style when both render it.

## 3. Run what CI runs, before pushing

```bash
pnpm install --frozen-lockfile   # a fresh checkout has no node_modules, and tsc then does nothing useful
pnpm exec tsc --noEmit
pnpm run test:frontend
python -m unittest discover -s tests
pnpm exec prettier --check "src/**/*.{ts,tsx}" "tests/**/*.ts" "devtools/**/*.{ts,tsx,mjs}"
python -m ruff format --check; python -m ruff check     # the `ruff` command is not on PATH on Windows
```

CI fails on a formatting miss, so format first. A passing type-check is not a working screen: say what was not tried on a Deck.

## 4. Say what you did not check

End with what was skipped or unverified, and any risk (a mirror not made, a style not tried, a locale translated by you rather than a speaker).
