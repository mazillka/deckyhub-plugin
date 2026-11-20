---
name: readable-code
description: Write code that people can read and maintain: a reviewer understands it in one read, and the next person can change it safely. Use when writing, changing or reviewing any code in src/, main.py, py_modules/, installer/ or devtools/, when a function or component has grown hard to follow or risky to change, or when asked to make code clearer, simpler, easier to review or easier to maintain.
---

# Readable, maintainable code

Code is written once and read, changed and debugged many times, by people. Two tests:

- **Readable:** a reviewer reading a diff on a phone, once, with no running app, can say what it does and why without scrolling back.
- **Maintainable:** someone who didn't write it can change it a year from now, knowing what else the change touches, and a test tells them if they broke it.

The `code-quality` skill has the project's structure rules; this one is about the lines themselves and how easy they are to change.

## Shape

- **One job per function.** If you need "and" to describe it, split it. A function that loads, filters and renders is three.
- **Short, flat bodies.** Return early on the cases that end the work (no apps, an error, nothing selected), so the main path isn't nested. Three levels of `if` or `map` inside each other is the limit; name the inner one.
- **Same level of detail in one function.** Don't mix "open the window" with "build the SHA-256 URL by hand" in the same block.
- **Data, then logic, then output.** Compute named values first, then return the JSX or the result; no logic buried in JSX props.

## Names

- A name says what the thing is or does, in the words of the feature: `moreFromAuthor`, `ownerOf`, `showInfoWindow`, not `data2`, `handle`, `util`.
- Booleans read as questions (`isUpdate`, `hasNotes`), functions as verbs (`showReleaseInfo`), constants as nouns in capitals (`CATEGORY_SHOWN`, `LAZY_AHEAD`).
- Don't shorten to save four characters (`app` is fine, `a`, `tmp` and `x` are not outside a one-line lambda).
- Rename instead of commenting: if a comment explains what a name means, change the name.

## Expressions

- No nested ternaries, no chains of `&&` and `||` that mix meanings. Pull the condition into a named `const` (`const unverified = ...`) and use that.
- A regular expression, a long filter or a format string gets a name and a one-line comment saying what it matches and why.
- No magic numbers: `PAGE = 30`, `LAZY_AHEAD = 5` say what the number is for.
- Prefer the standard library and the project's own helper (`ownerOf`, `compactNumber`, `keepInView`) to a new clever line.

## Comments

- Say **why**, in one or two lines, where the code can't: a Steam quirk, a Decky version, a rate limit, a shortcut and its limit. Never what the next line already says, never commented-out code.
- A comment that has gone stale is worse than none: change it in the same edit as the code.

## Easy to maintain

- **One home per fact.** A rule, a URL, a style or a number lives in one place and is imported (`ownerOf`, `CATEGORY_SHOWN`, `badgeLegend`). A fact written in three places is three places to get wrong; search before you add a copy.
- **Small blast radius.** A change should touch the files a reader would expect it to. If adding a field means editing six unrelated files, the code is missing a seam: name it, don't patch around it.
- **Follow the pattern that is already there.** The same problem is solved the same way everywhere (`showModal` with `t` as a prop, `Focusable` with `onActivate`, a keyed i18n string). A second, cleverer way is a maintenance cost even when it is shorter.
- **Make wrong states hard.** Prefer a type, a validated argument or a small function with one way to call it over a convention people must remember.
- **No dead code, no "for later".** Unused branches, props, flags and files are deleted, not commented out. Code written for a need nobody has yet is code someone must read, test and keep working.
- **A change brings its test.** New behavior gets a test that fails without it; a bug fix gets the test that failed first. Names that read as sentences make the test list a description of the system.
- **Leave it better, not different.** Tidy what you touch (a name, an extracted function), in its own commit, so a reviewer can see the refactor changes nothing.

## Tests

- A test name states the behavior, as a sentence: "the repo page lists more plugins by its owner, linked to DeckyHub, and shows nothing when there are none".
- Arrange, act, assert, in that order, with one reason to fail. No logic (loops, branches) in a test unless it is the thing being tested.

## Before you finish

Read your diff as the reviewer would. For each hunk ask: can I tell what this does without opening another file? Is there a name or a function that would let me skip a comment? Is anything here only for a future need nobody asked for? Fix, then stop: readability work that changes behavior belongs in its own commit.
