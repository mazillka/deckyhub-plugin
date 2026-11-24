import assert from "node:assert/strict";
import { test } from "node:test";
import { markSharedNames, titleOf } from "../src/author.ts";
import type { App } from "../src/types.ts";

const app = (id: string, name: string, repo: string) => ({ id, name, repo }) as App;
const t = ((key: string, vars?: { author: string }) =>
  `${key === "appcard.byAuthor" ? "by" : key} ${vars?.author}`) as never;

test("plugins that share a name say whose they are in their title; the others keep their name", () => {
  const [a, b, c] = markSharedNames([
    app("a", "SteamGridDB", "K1tsune12/SteamGridDB"),
    app("b", "steamgriddb", "SteamGridDB/decky-steamgriddb"),
    app("c", "CSS Loader", "DeckThemes/SDH-CssLoader"),
  ]);
  assert.equal(titleOf(a, t), "SteamGridDB by K1tsune12");
  assert.equal(titleOf(b, t), "steamgriddb by SteamGridDB");
  assert.equal(titleOf(c, t), "CSS Loader");
});
