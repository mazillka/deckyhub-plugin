// Run with `pnpm run test:frontend`. Typecheck already catches missing or
// extra keys; this catches what it can't: broken {placeholders} and a
// language the backend or the Deck scenarios don't know about.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { en } from "../src/i18n/en.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const index = read("src/i18n/index.tsx");
const files = [...index.matchAll(/^import \{ (\w+) \} from "\.\/(\w+)";$/gm)].map((m) => m[2]).filter((f) => f !== "en");
const codes = [...index.matchAll(/\{ code: "([\w-]+)"/g)].map((m) => m[1]);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every locale keeps each string's {placeholders}", async () => {
  assert.ok(files.length > 0);
  for (const file of files) {
    const messages: Record<string, string> = Object.values(await import(`../src/i18n/${file}.ts`))[0] as never;
    for (const [key, value] of Object.entries(en)) {
      assert.deepEqual(placeholders(messages[key] ?? ""), placeholders(value), `${file}.ts "${key}"`);
    }
  }
});

test("every language in the picker is accepted by the backend and the Deck scenarios", () => {
  const backend = read("main.py").match(/^SUPPORTED_LANGUAGES = \{(.*)\}$/m)![1];
  const scenarios = read("devtools/deck/scenarios.mjs").match(/^const LANGUAGES = \[(.*)\];$/m)![1];
  assert.equal(codes.length, files.length + 1, "a LOCALES entry per locale file, plus English");
  for (const code of codes) {
    assert.ok(backend.includes(`"${code}"`), `main.py SUPPORTED_LANGUAGES lacks "${code}"`);
    assert.ok(scenarios.includes(`"${code}"`), `devtools/deck/scenarios.mjs LANGUAGES lacks "${code}"`);
  }
});
