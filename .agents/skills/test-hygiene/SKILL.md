---
name: test-hygiene
description: Find and remove fake tests (they can't fail, test a mock, or copy the code's own text) and duplicate tests, without losing real coverage. Use when asked to clean up, trim or audit tests, when a suite feels slow or noisy, and before adding a test that may already exist.
---

# Test hygiene

A test is worth keeping only if it fails when the behaviour breaks. Tests that can't fail, or say what another test already says, cost time on every run and hide the ones that matter.

## Fake tests: remove or rewrite

A test is fake when breaking the code it names would not turn it red. Look for:

- **No real assertion:** `assertTrue(True)`, an `expect` on a value the test just set, a test that only calls the code and checks nothing, or asserts only that nothing threw when a throw is impossible.
- **Testing the mock:** the assertion is about a stand-in's own return value, so it passes whatever the real code does.
- **Copying the source:** it reads a script or file and checks the text is there (`assertIn("some phrase", SCRIPT.read_text())`) when the behaviour could be run instead. Keep these only for text that is the product (a disclaimer, a placeholder the release fills in), and say why in a comment.
- **Restating a constant:** it asserts a constant or default equals the literal it was just defined as.
- **Skipped or empty:** `skip` with no reason, a `test` body that's commented out, a loop over an empty list.

For each: either rewrite it to run the behaviour (call the function, run the script with stand-ins, render the page) or delete it.

## Duplicate tests: merge or remove

- Two tests with the same setup and the same assertion, under different names.
- A narrow test fully covered by a broader one that fails in the same way (keep the broad one, and keep the narrow one only if it gives a much clearer failure).
- The same check run once per locale, per page or per plugin where one table-driven test says it all.
- A browser (e2e) test of logic a unit test already proves. Keep one e2e per user-visible flow.

## Procedure

1. List the tests and group them by what they claim (`git grep -n "def test_\|^test(\|  test("`). Read before judging.
2. For each suspect, **break the code on purpose** (comment out the line it guards, flip the condition) and run just that test. If it still passes, it is fake. Put the code back.
3. Before deleting, check why it exists: `git log -S"<test name>" --oneline` and `git blame`. A test added with a bug fix guards that bug; keep it, or make it better, never silently drop it.
4. Delete or merge. One concern per commit, so a revert is easy.
5. Run everything and compare: `pnpm typecheck`, `pnpm test:frontend`, `python -m unittest discover -s tests`, and the browser tests if you touched them. The failures that remain must be the same as before.
6. Check coverage didn't drop for the code the test covered (a coverage run, or break that code once more and confirm *some* test still goes red).

## Report

Say what you removed and why, in a short list: the test, which rule it broke (can't fail, tests the mock, copies the source, duplicate of X), and what still covers the behaviour. Say what you kept on purpose and why. Never claim a suite is "cleaner" without the before and after counts.

## This repository

- `tests/test_installer.py` runs the real installer script against stand-ins; some tests read the script's text on purpose (the disclaimer wording, the unticked default, the placeholders the release fills in). Prefer running the script.
- `tests/test_plugin_pages.py`, `tests/test_docs.py` and `devtools/audit-site.py` check the website; the audit already covers titles, descriptions, links and the sitemap, so don't repeat those per page.
- `tests/i18n.test.ts` already proves every locale has every key; don't add a per-locale test for a single string.
- `devtools/decky-mock/e2e/deckyhub.spec.ts` is large (130+ tests): look there first for duplicates and for tests whose only assertion is that a page renders.
- `devtools/deck/deck.test.mjs` runs on a real Deck and is slow: keep it small and don't duplicate what the mock covers.
