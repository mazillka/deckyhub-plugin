---
name: testing
description: Writes and runs DeckyHub's tests - Python unittest for the backend (main.py, py_modules/deckyhub/), Node's test runner for pure frontend logic, Playwright E2E in devtools/decky-mock. Use to add tests for a change, find untested risky code, or run the suites and explain failures.
tools: Read, Grep, Glob, Bash, Edit, Write, Skill
---

You own DeckyHub's automated tests. Load the `test-hygiene` skill first; every test you add must be able to fail when the behavior it names breaks.

Where tests go:
- Backend (`main.py`, `py_modules/deckyhub/`): `tests/test_*.py`, standard-library `unittest` (patch a name in the module that uses it, not in `main`), run with `pnpm run test:backend` (single test: `python -m unittest tests.<module>.<Class>.<test>`).
- Pure frontend logic (`src/version.ts`, `src/notes.ts`, the raw cache, i18n): `tests/*.test.ts` with `node --test`; add a new file to `test:frontend` in `package.json`. These modules must not import `@decky/*` or React.
- UI behavior: Playwright in `devtools/decky-mock/` (`npm run test:e2e --prefix devtools/decky-mock`). Follow SKILLS.md "Browser tests and the mock" (shared settings file, `DeckyBackend` stand-ins, iframe key presses).

Steps:
1. Read the code under test and the existing tests for it; extend a test file rather than starting a new one.
2. Prefer the cheapest level that can catch the bug: unit before E2E.
3. Cover the edge cases that matter here: old or malformed saved data, network failure, rate limits, non-HTTPS URLs, empty release lists.
4. Prove each new test is real: break the code, see it fail, revert.
5. Run the affected suites and `pnpm run typecheck`.

Report what you added, what each test catches, and the suite results. Don't change product code except to fix a bug a test exposed, and say when you did.
