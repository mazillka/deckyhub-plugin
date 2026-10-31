---
name: localization
description: Keep DeckyHub's translations complete and correct - translate new or changed English strings into every locale, add a new language, and check the locales for gaps, broken placeholders and untranslated text. Use when adding or changing user-facing text, when asked to add a language, translate, check or update localization, or before a release.
---

# Localization

DeckyHub's text lives in `src/i18n/` (see the i18n note in AGENTS.md). `en.ts` is the source; every other locale is a `Record<MessageKey, string>` with the same keys in the same order. All non-English text is machine-translated, which the Language setting says (`settings.languageHint`). Keep that line true: don't claim a native speaker reviewed a language unless one did.

## Locales

| Code | File | Notes |
| --- | --- | --- |
| `uk` `ru` `es` `de` `fr` `it` `pl` `tr` `nl` `cs` `ja` `ko` `zh` | `<code>.ts` | |
| `pt` | `pt.ts` | Brazilian: Configurações, Buscar, baixar, você |
| `pt-PT` | `ptPT.ts` | European: Definições, Pesquisar, transferir, ficheiro, "a carregar" |
| `zh-TW` | `zhTW.ts` | Traditional Chinese; `detectLocale()` also maps zh-HK/MO/Hant here |

## Translating a changed English string

Whenever you add a key to `en.ts` or change what an English string says, update all locale files in the same change, at the same position as in `en.ts`. Don't leave English as a placeholder: typecheck can't tell English from a translation.

- Keep every `{placeholder}` exactly; word order around it may change.
- Languages whose plurals change with the number (`pl`, `cs`, `uk`, `ru`) use a label form for counts (`Pobrania: {count}`), not a sentence that only fits some numbers.
- `dl.installPath` stays in English in every locale: it names Decky's own menu.
- Product names stay as they are: DeckyHub, Decky, Decky Loader, GitHub, Steam, Deck, Quick Access, Decky Extended Plugins.
- Match the tone of the file: informal "you" (tu/du/ty/sen/je) where the existing file does, polite where it does (`ja`, `ko`, `pt-PT` with "o seu").
- Short labels (buttons, tabs, badges) must stay short; the Deck's panel is narrow.

## Adding a language

1. Create `src/i18n/<file>.ts` translating every key of `en.ts`.
2. In `src/i18n/index.tsx`: the import, the `Locale` union, a `LOCALES` entry with the language's own name, and `MESSAGES`. Add a `detectLocale()` rule only for a regional variant (like `pt-PT`).
3. Add the code to `SUPPORTED_LANGUAGES` in `main.py` (otherwise the saved choice resets to auto) and `LANGUAGES` in `devtools/deck/scenarios.mjs`.
4. Add `[code, "<its word for Language>"]` to the "Newer languages are offered" test in `devtools/decky-mock/e2e/deckyhub.spec.ts`.
5. Compatibility: an older DeckyHub doesn't know the new code and falls back to auto-detect after a downgrade. That's fine; never rename or reuse an existing code.

## Checking

```bash
pnpm typecheck
```

```bash
pnpm run test:frontend
```

Typecheck fails on a missing or extra key. `tests/i18n.test.ts` fails on a dropped or renamed `{placeholder}` and on a language missing from `main.py` or the Deck scenarios.

To list strings still identical to English (expect a few legitimate ones such as `OK`, `Fork`, `GitHub`, `dl.installPath`):

```bash
node -e "const fs=require('fs');const p=f=>Object.fromEntries([...fs.readFileSync('src/i18n/'+f,'utf8').matchAll(/^  \"([^\"]+)\": (\".*\"),$/gm)].map(m=>[m[1],JSON.parse(m[2])]));const en=p('en.ts');for(const f of fs.readdirSync('src/i18n').filter(f=>f.endsWith('.ts')&&f!=='en.ts')){const l=p(f);const same=Object.keys(en).filter(k=>en[k]&&l[k]===en[k]);if(same.length)console.log(f,same.join(', '))}"
```

Then look at the Settings page in a long language (`de`, `nl`) and in `ja` on the Deck or the mock (`deck-test` skill) for text that overflows.
