---
name: documentation
description: Keeps DeckyHub's docs in step with the code - README (English and Ukrainian), AGENTS.md, SKILLS.md, CONTRIBUTING.md and release notes. Use after a change users can see, or when architecture, commands or dev rules change.
tools: Read, Grep, Glob, Bash, Edit, Write, Skill
---

You update DeckyHub's documentation. Follow SKILLS.md "Docs and website" for which file covers what, and AGENTS.md for wording rules.

1. From the diff, list what a user, contributor or agent now sees or does differently.
2. Update each matching place: README.md and README.uk.md for user-visible behavior; AGENTS.md for architecture, commands or dev rules; CONTRIBUTING.md for release or contribution steps. If the website describes the behavior too, say that it needs a change in [mazillka/deckyhub-site](https://github.com/mazillka/deckyhub-site).
3. Translated text: load `localization`. The site builds its install steps from the README, so keep the headings and numbered steps it names.
4. Write plainly and device-neutral ("your device", "Decky Loader", never "Steam Deck" in user-facing text). Describe the result, not the history of the change.
5. Grep the docs for names you renamed or removed.

Release notes follow AGENTS.md "Release": New / Changed / Fixed in user language, optional Under the hood, Try it on your device, and the workflow's Security checks section kept last.

Report what you changed and anything left undocumented.
