import assert from "node:assert/strict";
import { test } from "node:test";
import { installTabsFix } from "../src/tabsFix.ts";

// Decky Loader's TabsHook.render (frontend/src/tabs-hook.tsx) as it ships.
class DeckyHook {
  tabs: any[] = [];
  add(tab: any) {
    this.tabs.push(tab);
  }
  removeById(id: number) {
    this.tabs = this.tabs.filter((tab) => tab.id !== id);
  }
  render(strip: any[], visible: boolean) {
    const decky = strip.reduce((n: number, tab: any) => (tab.decky ? n + 1 : n), 0);
    if (decky == this.tabs.length) return void strip.forEach((tab) => tab.decky && (tab.initialVisibility = visible));
    for (const { title, icon, content, id } of this.tabs)
      strip.push({ key: id, title, tab: icon, decky: true, panel: { wrapped: content }, initialVisibility: visible });
  }
}

// A hook of its own class each time: the fix patches the class's prototype, as it does Decky's.
const fresh = () => new (class extends DeckyHook {})();

const DECKY = { id: 999, title: "Decky", content: "decky panel" };
const HUB = { id: 0x444855, title: "DeckyHub", content: "hub panel" };
const names = (strip: any[]) => strip.filter((tab) => tab.decky).map((tab) => tab.title);

test("without the fix, a tab added after the first render repeats Decky's tabs on every render", () => {
  const hook = fresh();
  const strip: any[] = [{ key: 1, title: "Notifications" }];
  hook.add(DECKY);
  hook.render(strip, true);
  hook.add(HUB);
  hook.render(strip, true);
  hook.render(strip, true);
  assert.equal(names(strip).length, 5);
});

test("with the fix, the same sequence keeps one tab of each however often it renders", () => {
  const hook = fresh();
  installTabsFix(hook as any, HUB.id);
  const strip: any[] = [{ key: 1, title: "Notifications" }];
  hook.add(DECKY);
  hook.render(strip, true);
  hook.add(HUB);
  for (let i = 0; i < 4; i++) hook.render(strip, true);
  assert.deepEqual(names(strip).sort(), ["Decky", "DeckyHub"]);
  assert.equal(strip[0].title, "Notifications");
  assert.deepEqual(strip.find((tab) => tab.key === HUB.id).panel, { wrapped: "hub panel" });
});

test("a tab another plugin's wrapper adds is left alone, with the wrapper installed before or after", () => {
  for (const order of ["before", "after"]) {
    const hook = fresh();
    const adapter = (inner: any) =>
      function (this: any, strip: any[], visible: boolean) {
        inner.call(this, strip, visible);
        if (!strip.some((tab) => tab.key === 7)) strip.push({ key: 7, title: "Panel", decky: true, panel: "p" });
      };
    if (order === "before") (hook as any).render = adapter(DeckyHook.prototype.render);
    const restore = installTabsFix(hook as any, HUB.id);
    if (order === "after") (hook as any).render = adapter((hook as any).render);
    const strip: any[] = [];
    hook.add(DECKY);
    hook.render(strip, true);
    hook.add(HUB);
    for (let i = 0; i < 3; i++) hook.render(strip, true);
    assert.deepEqual(names(strip).sort(), ["Decky", "DeckyHub", "Panel"], order);
    restore();
    hook.render(strip, true);
    assert.ok(names(strip).includes("Panel"), order);
  }
});

test("after DeckyHub reloads, its one tab in the strip shows the new panel", () => {
  const hook = fresh();
  installTabsFix(hook as any, HUB.id);
  const strip: any[] = [];
  hook.add(DECKY);
  hook.add(HUB);
  hook.render(strip, true);
  hook.removeById(HUB.id);
  hook.add({ ...HUB, content: "new panel" });
  hook.render(strip, true);
  const mine = strip.filter((tab) => tab.key === HUB.id);
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0].panel, { wrapped: "new panel" }, "built by Decky, in its own wrapper");
});

test("a tab strip handed in already holding every tab comes back unchanged (Panel de Control checks this before it adds its tab)", () => {
  const hook = fresh();
  installTabsFix(hook as any, HUB.id);
  hook.add(DECKY);
  hook.add(HUB);
  const strip: any[] = [{ key: "native" }, ...hook.tabs.map((tab) => ({ decky: true, key: tab.id, panel: {} }))];
  const before = [...strip];
  hook.render(strip, false);
  assert.equal(strip.length, before.length);
  assert.ok(strip.every((tab, index) => tab === before[index]));
});

test("it leaves a hook of an unexpected shape alone and can be taken off again", () => {
  for (const odd of [undefined, {}, { render: 1 }]) installTabsFix(odd as any, HUB.id);
  const hook = fresh();
  const prototype = Object.getPrototypeOf(hook);
  const restore = installTabsFix(hook as any, HUB.id);
  // Patched on the prototype: the hook itself has no render() of its own, so a plugin that checks for one finds none.
  assert.ok(!Object.prototype.hasOwnProperty.call(hook, "render"));
  assert.ok(Object.prototype.hasOwnProperty.call(prototype, "render"));
  restore();
  assert.ok(!Object.prototype.hasOwnProperty.call(prototype, "render"));
});
