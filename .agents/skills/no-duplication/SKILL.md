---
name: no-duplication
description: Keep one home for every fact, and no hardcoded values or magic numbers. Use when writing, changing or reviewing code that adds a number, a string, a color, a URL, a selector, a rule or a block that looks like one already in the repo, and when asked to remove duplication, extract constants or clean up magic values.
---

# No duplication, no magic values

A fact written in three places is three places to get wrong. A bare `30` or `"#8b929a"` tells the next reader nothing, and changing it means finding every copy. Both make code hard to maintain. This skill adds to `readable-code` ("one home per fact") and `code-quality`.

## Before you write: look

Search for what you are about to add, in the repo, before writing it:

```bash
rg -n "the string or selector"        # the same text or selector elsewhere
rg -n "#[0-9a-fA-F]{6}" src/components  # a color already named in styles.ts?
rg -n "\b[0-9]{3,}\b" <file>          # a number that needs a name
```

If a helper, constant or component already does it, use it. If two pieces of code differ only by a value, they are one function with a parameter.

## Where each fact lives

- **Colors and shared styles**: `src/styles.ts` (`colors`, `pillStyle`, `tint`), or `experimental/theme.tsx` for that style. No hex literal in a component.
- **Formatting and labels of one thing** (a status, a version, a count): one function in `src/format.ts` or beside the type, used by every card and window.
- **User-facing text**: an i18n key in `src/i18n/en.ts`, never a literal; one key for one sentence, reused.
- **Limits, timeouts, sizes, batch sizes**: a named constant at the top of the module that owns the rule (`CACHE_TTL`, `CHECK_EVERY`, `PAGE`, `MAX_REMOTE_REGISTRY_BYTES`), written with its units (`30 * 60 * 1000`) and a comment when the number is a judgement. Two modules that need the same limit import it from one.
- **URLs, routes, event names, storage keys, setting names**: one exported constant each (`SELECT_PAGE`, the registry's raw URL), not retyped.
- **GitHub, downloads, release lookups**: the existing helpers (`fetchReleases()`, `showDownloadModal()`), never a second fetch path.
- **Python**: paths from `paths.py` and `decky.DECKY_*`, the HTTP opener from `net.py`, `REPOSITORY_NAME` from `validation.py`; module-level constants for limits. The registry's scripts share thresholds and URLs through one module, not copies per script.
- **The website**: a plugin page's facts come from the same data helpers as the cards (`compact()`, `total_downloads()`), and a number or label shown in two pages is built by one function.

## What counts as a magic value

A number (timeout, size, limit, threshold, retry count, pixel size you'd have to explain), a string that other code must match (selector, key, class name, route), a color, or a regex, written inline where its meaning isn't obvious from the line. A comment explaining a bare number is a sign the number wants a name.

Fine inline: `0`, `1`, `-1`, an array index, a one-off layout value used once (`padding: 10`) whose meaning is the line itself, and test data that belongs to one test.

## Removing duplication, without over-abstracting

- **Same fact, extract at the second copy** (a rule, URL, threshold, label). **Same shape, wait for the third** before inventing an abstraction.
- Name the extracted thing for the concept (`latestVersionText`, `ownerOf`), not for its shape (`helper`, `utils`, `common`).
- Two blocks that look alike but change for different reasons stay separate; forcing them together makes both harder to change.
- Move the code, then delete the copies in the same change, and run the tests that cover each place that used to hold one.

## Known examples to fix when you touch them

- `AppList.tsx` `BATCH` and `V2Library.tsx` `PAGE` are the same number for the same idea (how many plugins load at a time): one constant.
- The same selector string in several scripts (`.deckyhub-category-chips button, ...`): export it once.

## Review checklist

For each added line: is there a bare number or string another place must agree with? A color or style written out? A block that already exists elsewhere? If yes, give it a home, import it, and delete the copy.
