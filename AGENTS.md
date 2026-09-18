# DeckyHub contributor guide

DeckyHub is a Decky Loader plugin for Steam Deck. Its Python backend in `main.py` exposes Decky RPC methods; the React/TypeScript frontend in `src/` calls them through `src/api.ts`.

## Verify changes

```bash
pnpm run typecheck
pnpm run build
pnpm run test:backend
cd devtools/decky-mock && npm run test:e2e
```

The browser suite starts the local mock and backend bridge itself. Run `npx playwright install chromium` once before its first local run.

## Development rules

- Keep the backend dependency-free; it uses only the Python standard library.
- Create work branches as `<short-kebab-case-topic>`; add an ISO date suffix only when needed for uniqueness. Do not work directly on `main`.
- Any new `@decky/ui` import must have a matching stand-in in `devtools/decky-mock/ui.tsx` so the mock and E2E tests still build.
- Download progress and install instructions are one shared modal (`showDownloadModal()` in `src/components/DownloadProgress.tsx`), used by every download entry point (Updates/Discover, DeckyHub self-update, and the dev-mock preview buttons). Don't hand-roll a separate copy for previews or a new call site — it silently drifts from the real component.
- Preserve Steam Deck controller navigation: custom layouts need `Focusable` with valid `flow-children` values. Test controller behavior on real hardware before release; the browser mock cannot validate it.
- Treat registry data as trusted project data, but keep download URLs HTTPS and filenames reduced to a basename.

## Release

For a release, bump both `DECKYHUB_VERSION` in `main.py` and `version` in `package.json`, then push a `v*` tag. The release workflow runs type checks, backend tests, browser E2E tests, packages the plugin, and creates the GitHub release.
