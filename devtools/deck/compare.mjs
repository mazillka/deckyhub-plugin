// Lists where the dev mock (devtools/decky-mock) looks different from DeckyHub on a
// real Deck: position, size, font and colours of the same parts of each page.
//   DECK=192.168.1.209:8081 node devtools/deck/compare.mjs [discover updates ...]
// Needs the mock running (localhost:5183 with its bridge) and DeckyHub on the Deck.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect, sleep, TARGETS } from "./cdp.mjs";

const { chromium } = createRequire(new URL("../decky-mock/package.json", import.meta.url))("playwright");
const fingerprint = readFileSync(new URL("./fingerprint.js", import.meta.url), "utf8");
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ["discover", "updates", "search", "settings", "repositories"];
const MOCK = process.env.MOCK ?? "http://localhost:5183";

const shared = await connect(TARGETS.shared);
const deck = await connect(TARGETS.main);
// The mock lists the plugins the Deck has installed, so both show the same cards
// and updates. Its bridge reads .dev-data/plugins/*/plugin.json as installed.
const mockPlugins = new URL("../decky-mock/.dev-data/plugins/", import.meta.url);
const installed = JSON.parse(await shared.eval(`JSON.stringify(DeckyPluginLoader.plugins.filter((p) => p.name !== "DeckyHub").map((p) => [p.name, p.version]))`));
installed.forEach(([name, version], index) => {
  const dir = new URL(`deck-${index}/`, mockPlugins);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("plugin.json", dir), JSON.stringify({ name, version }));
});
const startPath = await shared.eval("location.pathname.slice(\"/routes\".length)");
const browser = await chromium.launch();
const mock = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// The mock's shell scales its Deck frame to fit the window; pin it to the real 1280x800 instead.
const PIN = "html,body,#root{width:1280px!important;height:800px!important;overflow:hidden!important;margin:0} .steam-mock{padding:0!important} .steam-deck{width:1280px!important;height:800px!important;border-radius:0!important;border:0!important;transform:none!important} .preview-nav{display:none!important}";

// The mock zooms its pages 1.5x where Steam renders 854x534 at a 1.5 pixel ratio.
const MOCK_ZOOM = 1.5;
const unzoom = (value) => typeof value === "number" ? Math.round(value / MOCK_ZOOM) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unzoom(item)])) : value;
// Numbers within this many CSS pixels count as the same.
const TOLERANCE = 2;
const diff = (path, a, b, out) => {
  if (a && typeof a === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b ?? {})])) diff(`${path}.${key}`, a[key], b?.[key], out);
  } else if (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) > TOLERANCE : a !== b) out.push(`${path}: deck ${JSON.stringify(a)}  mock ${JSON.stringify(b)}`);
};

let total = 0;
try {
  for (const name of pages) {
    await shared.eval(`DFL.Navigation.CloseSideMenus?.(); DFL.Navigation.Navigate("/deckyhub/${name}"); true`);
    await mock.goto(`${MOCK}/app.html?preview=/deckyhub/${name}`);
    await mock.addStyleTag({ content: PIN });
    await sleep(5000);
    const frame = mock.frames().find((candidate) => candidate.url().includes("app.html")) ?? mock.mainFrame();
    const [real, fake] = [JSON.parse(await deck.eval(fingerprint)), unzoom(JSON.parse(await frame.evaluate(fingerprint)))];
    delete real.viewport; delete fake.viewport;
    const out = [];
    diff(name, real, fake, out);
    console.log(`\n${name}: ${out.length ? `${out.length} differences` : "same"}`);
    for (const line of out) console.log(`  ${line}`);
    total += out.length;
  }
} finally {
  await shared.eval(`DFL.Navigation.Navigate(${JSON.stringify(startPath)}); true`).catch(() => {});
  shared.close(); deck.close();
  await browser.close();
  installed.forEach((_, index) => rmSync(new URL(`deck-${index}/`, mockPlugins), { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
}
process.exitCode = total ? 1 : 0;
