import assert from "node:assert/strict";
import { test } from "node:test";
import { describe } from "../docs/remote-plugins.js";

// A tiny stand-in for the DOM: enough for describe() to build what the Paired devices list shows.
const document = {
  createElement() {
    const node = {
      children: [],
      className: "",
      title: "",
      textContent: "",
      href: "",
      append(...items) {
        this.children.push(...items);
      },
      get childElementCount() {
        return this.children.length;
      },
    };
    return node;
  },
};
const texts = (parts) =>
  parts.flatMap((part) => [part.textContent, ...(part.children || []).map((child) => child.textContent)]);

test("shows badges, numbers and the virus scan of a matched plugin", () => {
  const record = {
    id: "example",
    downloads: 194400,
    stars: 303,
    latest: "v1.2.0",
    updated: "2026-09-03T00:00:00Z",
    root: true,
    warnings: ["obfuscated"],
    scan: { tag: "v1.2.0", kind: "clean", clamav: "clean", yara: "clean", virusTotal: [0, 67] },
  };
  const out = texts(describe(document, record, { obfuscated: ["Hidden code", "obfuscated"] })).join(" | ");
  assert.match(out, /Runs as root/);
  assert.match(out, /Hidden code/);
  assert.match(out, /Nothing flagged/);
  assert.match(out, /194\.4K GitHub downloads · 303 stars · latest release v1\.2\.0 · updated 2026-09-03/);
  assert.match(out, /VirusTotal: 0 of 67 engines flagged it/);
  assert.match(out, /isn't proof of safety/);
});

test("a plugin in the Decky store shows the downloads in total as well as each count", () => {
  const out = texts(describe(document, { id: "example", downloads: 1500, storeDownloads: 40000 }, {})).join(" | ");
  assert.match(
    out,
    /41\.5K approximate activity \(repeat downloads included; not unique installs\) · 1\.5K GitHub downloads · 40K Decky store downloads/,
  );
});

test("a valid store activity count includes updates and old data falls back to downloads", () => {
  const current = texts(
    describe(
      document,
      { id: "example", downloads: 1500, storeDownloads: 40000, storeActivity: { downloads: 20, updates: 5 } },
      {},
    ),
  ).join(" | ");
  assert.match(current, /1\.5K GitHub downloads · 25 Decky store activity \(downloads \+ updates; matched by name\)/);
  assert.doesNotMatch(current, /40K Decky store downloads/);
  const old = texts(describe(document, { id: "example", downloads: 1500, storeDownloads: 40000 }, {})).join(" | ");
  assert.match(old, /40K Decky store downloads/);
});

test("an unknown audit code still shows, and a record with no data adds only its link", () => {
  const unknown = texts(describe(document, { id: "x", warnings: ["brand-new"] }, {})).join(" | ");
  assert.match(unknown, /brand-new/);
  const bare = describe(document, { id: "x" }, {});
  assert.equal(bare.length, 1);
  assert.equal(bare[0].textContent, "All details on DeckyHub");
});

test("a bad id gets no link", () => {
  assert.deepEqual(describe(document, { id: "../evil" }, {}), []);
});
