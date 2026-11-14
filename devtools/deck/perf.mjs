// Measures what DeckyHub costs a real Deck: for each page, how many frames the Steam UI
// drew slower than 50 ms and how many long tasks and DOM changes opening it caused, then
// how long the backend takes to answer after a reload and how often it answers slowly.
//   DECK=192.168.1.209:8081 node devtools/deck/perf.mjs [seconds per page]
// Reloads DeckyHub once (settings are kept) and puts the Deck back on its home screen.
import { connect, goTo, sleep, TARGETS } from "./cdp.mjs";

const seconds = Number(process.argv[2] ?? 15);
const PAGES = ["discover", "installed", "updates", "search", "settings"];
const shared = await connect(TARGETS.shared);
const main = await connect(TARGETS.main);

const watch = () =>
  main.eval(`(() => {
    window.__perf = { frames: [], longTasks: [], batches: 0, records: 0, last: performance.now() };
    const p = window.__perf;
    const tick = (now) => { p.frames.push(now - p.last); p.last = now; if (!p.stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    try { new PerformanceObserver((list) => list.getEntries().forEach((e) => p.longTasks.push(e.duration))).observe({ entryTypes: ["longtask"] }); } catch {}
    p.observer = new MutationObserver((records) => { p.batches++; p.records += records.length; });
    p.observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    return true;
  })()`);
const report = () =>
  main.eval(`(() => {
    const p = window.__perf; p.stop = true; p.observer.disconnect();
    const frames = p.frames.slice(2), slow = frames.filter((ms) => ms > 50);
    return {
      slowFrames: slow.length,
      worstFrameMs: Math.round(Math.max(0, ...frames)),
      longTasks: p.longTasks.length,
      longTasksMs: Math.round(p.longTasks.reduce((sum, ms) => sum + ms, 0)),
      domChanges: p.records,
    };
  })()`);

const rows = [];
for (const page of PAGES) {
  await goTo(shared, "/library/home");
  await sleep(2500);
  await watch();
  await goTo(shared, `/deckyhub/${page}`);
  await sleep(seconds * 1000);
  rows.push({ page, ...(await report()) });
}
await goTo(shared, "/library/home");
console.table(rows);

// The backend: time from a reload until it answers, then the cost of its main calls.
const call = (method) =>
  shared.eval(`(async () => {
    const start = performance.now();
    await Promise.race([
      window.DeckyBackend.call("loader/call_plugin_method", "DeckyHub", ${JSON.stringify(method)}),
      new Promise((_, reject) => setTimeout(() => reject(new Error("no answer in 3 s")), 3000)),
    ]);
    return Math.round(performance.now() - start);
  })()`);
const began = Date.now();
await shared.eval(`window.DeckyBackend.call("loader/reload_plugin", "DeckyHub"); true`);
for (;;) {
  try {
    await call("get_settings");
    break;
  } catch {
    await sleep(250);
  }
}
console.log(`Backend answers ${Date.now() - began} ms after a reload`);
for (const method of ["get_settings", "get_apps", "get_apps"]) console.log(`${method}: ${await call(method)} ms`);
const idle = await shared.eval(
  `new Promise((resolve) => { let n = 0; try { new PerformanceObserver((l) => (n += l.getEntries().length)).observe({ entryTypes: ["longtask"] }); } catch {} setTimeout(() => resolve(n), 10000); })`,
);
console.log(`Long tasks in 10 s of idling: ${idle}`);
shared.close();
main.close();
