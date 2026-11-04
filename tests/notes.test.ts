// Run with `pnpm run test:frontend` (Node's built-in runner strips the types).
import assert from "node:assert/strict";
import { test } from "node:test";
import { plainNotes, textSections } from "../src/notes.ts";

test("Windows line endings keep every bullet on its own line", () => {
  const notes = "New Features\r\n\r\n- Added itch.io\r\n- Added a banner\r\n\r\n\r\n\r\nNotes\r\n* Logged out";
  assert.equal(plainNotes(notes), "New Features\n\n• Added itch.io\n• Added a banner\n\nNotes\n• Logged out");
});

test("markdown, images and tags are reduced to plain text", () => {
  assert.equal(plainNotes("## Fixed\n**Bold** [link](https://x.test) ![img](a.png) <b>tag</b>"), "Fixed\nBold link  tag");
  assert.ok(!plainNotes("<scr<b>ipt>alert(1)</scr<b>ipt>").includes("<"), "a nested tag can't reassemble");
});

test("a section is cut at a line end, never right after a bullet", () => {
  const line = "• " + "word ".repeat(40).trim();
  const sections = textSections(`${line}\n${line}\n${line}`, 300);
  assert.ok(sections.length > 1);
  assert.ok(sections.every((section) => !/•\s*$/.test(section)), JSON.stringify(sections));
  assert.equal(sections.join(""), `${line}\n${line}\n${line}`);
});
