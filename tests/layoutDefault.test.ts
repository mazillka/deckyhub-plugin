import assert from "node:assert/strict";
import { test } from "node:test";
import { readLayout, saveLayout } from "../src/layoutDefault.ts";

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};

test("a fresh device starts on the list", () => {
  assert.equal(readLayout(memory()), "list");
});

test("a grid chosen before the list became the default is dropped once", () => {
  const store = memory({ "deckyhub-layout": "grid" });
  assert.equal(readLayout(store), "list");
});

test("after that, a grid the person chooses is kept", () => {
  const store = memory({ "deckyhub-layout": "grid" });
  readLayout(store);
  saveLayout(store, "grid");
  assert.equal(readLayout(store), "grid");
  saveLayout(store, "list");
  assert.equal(readLayout(store), "list");
});

test("storage that throws leaves the list", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readLayout(broken), "list");
  saveLayout(broken, "grid");
});
