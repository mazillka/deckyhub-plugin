import assert from "node:assert/strict";
import { test } from "node:test";
import { autoColumns } from "../src/columns.ts";

test("the Deck's own screen keeps three cards per row", () => {
  assert.equal(autoColumns(1280), 3);
});

test("a wider screen fits more cards, up to six", () => {
  assert.equal(autoColumns(1920), 4);
  assert.equal(autoColumns(2560), 6);
  assert.equal(autoColumns(3840), 6);
});

test("a narrow window still gets one", () => {
  assert.equal(autoColumns(300), 1);
  assert.equal(autoColumns(0), 1);
});
