# DeckyHub skills

Use these project skills when working in this repository.

## Steam Deck UI

- Keep controller focus explicit for custom layouts with `Focusable` and valid `flow-children` values.
- Add matching `@decky/ui` stand-ins in `devtools/decky-mock/ui.tsx` for every new UI import.
- Verify UI behavior in the mock and on real Steam Deck hardware before release.

## Verification

```bash
pnpm run typecheck
pnpm run build
pnpm run test:backend
cd devtools/decky-mock && npm run test:e2e
```

## Security

- Keep the Python backend dependency-free.
- Download only GitHub release assets that belong to the selected repository.
- Treat repository names and imported files as untrusted input; validate them at the backend boundary.
- Preserve SHA-256 verification for DeckyHub self-updates.

## Release

- Create work branches as `<short-kebab-case-topic>`; add an ISO date suffix only when needed for uniqueness. Do not work directly on `main`.
- Bump `DECKYHUB_VERSION` in `main.py` and `version` in `package.json` together.
- Push a `v*` tag only after all checks pass.
