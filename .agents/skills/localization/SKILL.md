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

## The Desktop Mode installer

`installer/install-deckyhub.sh` shows its dialogs in the system's language (`LC_ALL`, `LC_MESSAGES`, then `LANG`; `pt_PT` is `ptPT`, `zh_TW`/`zh_HK`/`zh_MO` are `zhTW`), English otherwise. Its texts live in `installer/i18n/<code>.json` (same codes and file names as `src/i18n/`, `en.json` is the source), and the button and badge labels the app already has (Install, Update, Cancel, AI, Runs as root, the audit warnings) come from `src/i18n/` through `APP_KEYS` in `installer/build_installer.py`, so both say the same. In the script, use `t <key> [name value]...`, never a hard-coded sentence.

- Texts are Pango markup for zenity: keep `<b>`/`<span>` tags paired and write `&` as `&amp;`. A real line break in the JSON becomes `\n` in the dialog; no backslashes otherwise.
- Keep every `{placeholder}`; URLs, tags and paths are placeholders, not text.
- `desktop.name` and `desktop.comment` also go into `installer/Install-DeckyHub.desktop` as `Name[xx]=`/`Comment[xx]=` (`pt_BR` for `pt`, `pt` for `ptPT`, `zh_CN`, `zh_TW`).
- `tests/test_installer.py` checks every language has every key with the same placeholders and valid markup, and that the launcher has every language's lines.

## Adding a language

1. Create `src/i18n/<file>.ts` translating every key of `en.ts`.
2. In `src/i18n/index.tsx`: the import, the `Locale` union, a `LOCALES` entry with the language's own name, and `MESSAGES`. Add a `detectLocale()` rule only for a regional variant (like `pt-PT`).
3. The installer: `installer/i18n/<file>.json`, the code in `LANGUAGES` in `installer/build_installer.py`, and its `Name[xx]=`/`Comment[xx]=` lines in `installer/Install-DeckyHub.desktop`.
4. Add the code to `SUPPORTED_LANGUAGES` in `py_modules/deckyhub/settings.py` (otherwise the saved choice resets to auto) and `LANGUAGES` in `devtools/deck/scenarios.mjs`.
5. Add `[code, "<its word for Language>"]` to the "Newer languages are offered" test in `devtools/decky-mock/e2e/deckyhub.spec.ts`.
6. Compatibility: an older DeckyHub doesn't know the new code and falls back to auto-detect after a downgrade. That's fine; never rename or reuse an existing code.

## Checking

```bash
pnpm typecheck
```

```bash
pnpm run test:frontend
```

Typecheck fails on a missing or extra key. `tests/i18n.test.ts` fails on a dropped or renamed `{placeholder}` and on a language missing from the backend's `SUPPORTED_LANGUAGES` or the Deck scenarios.

To list strings still identical to English (expect a few legitimate ones such as `OK`, `Fork`, `GitHub`, `dl.installPath`):

```bash
node -e "const fs=require('fs');const p=f=>Object.fromEntries([...fs.readFileSync('src/i18n/'+f,'utf8').matchAll(/^  \"([^\"]+)\": (\".*\"),$/gm)].map(m=>[m[1],JSON.parse(m[2])]));const en=p('en.ts');for(const f of fs.readdirSync('src/i18n').filter(f=>f.endsWith('.ts')&&f!=='en.ts')){const l=p(f);const same=Object.keys(en).filter(k=>en[k]&&l[k]===en[k]);if(same.length)console.log(f,same.join(', '))}"
```

Then look at the Settings page in a long language (`de`, `nl`) and in `ja` on the Deck or the mock (`deck-test` skill) for text that overflows.
