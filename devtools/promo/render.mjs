// Renders the promo images (promo/hero.png 1920x1080, screenshots/hero.jpg, promo/social.png 1280x640) from a
// Deck screenshot of Discover (devtools/deck/screenshots.mjs writes discover-promo.png):
//   node devtools/promo/render.mjs <discover-promo.png> [plugin-count-text]
// Needs Playwright's Chromium from devtools/decky-mock (npm ci --prefix devtools/decky-mock first).
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "../decky-mock/node_modules/playwright/index.mjs";

const root = new URL("../../", import.meta.url);
const shot = process.argv[2];
const count = process.argv[3] ?? "500+";
if (!shot) throw new Error("usage: node devtools/promo/render.mjs <discover-promo.png> [500+]");
const screen = `data:image/png;base64,${readFileSync(shot).toString("base64")}`;
const logo = readFileSync(new URL("docs/favicon.svg", root), "utf8");

const html = (w, h, big) => `<!doctype html><meta charset=utf-8><style>
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:"Segoe UI",Inter,system-ui,sans-serif;color:#eef4ff;background:radial-gradient(ellipse at 80% 50%,#1b3254 0%,#10151f 70%)}
.brand{position:absolute;left:${big ? 120 : 72}px;top:${big ? 150 : 80}px;display:flex;align-items:center;gap:${big ? 26 : 20}px;font-size:${big ? 56 : 44}px;font-weight:700}
.brand svg{width:${big ? 84 : 70}px;height:${big ? 84 : 70}px}
h1{position:absolute;left:${big ? 120 : 72}px;top:${big ? 340 : 190}px;font-size:${big ? 76 : 56}px;line-height:1.1;font-weight:800;width:${big ? 640 : 520}px;letter-spacing:-.02em}
p.sub{position:absolute;left:${big ? 120 : 72}px;top:${big ? 610 : 415}px;font-size:${big ? 32 : 26}px;line-height:1.4;color:#b6c3d4;width:${big ? 620 : 470}px}
.pills{position:absolute;left:${big ? 120 : 72}px;top:${big ? 790 : 505}px;display:flex;gap:12px}
.pills span{border:2px solid #2e405a;border-radius:99px;padding:${big ? "12px 20px" : "10px 16px"};font-size:${big ? 22 : 21}px;font-weight:600;background:rgba(24,33,49,.7)}
.device{position:absolute;left:${big ? 780 : 576}px;top:${big ? 192 : 105}px;width:${big ? 1070 : 760}px;border-radius:${big ? 70 : 52}px;padding:${big ? 34 : 26}px;background:#1a1f2b;border:4px solid #3a4457;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.screen{position:relative;border-radius:${big ? 22 : 16}px;overflow:hidden;aspect-ratio:1280/800;background:#000}
.screen img{width:100%;display:block}
.screen i{position:absolute;left:0;right:0;top:6.9%;height:2.3%;background:#000}
</style>
<div class=brand>${logo}DeckyHub</div>
<h1>Decky plugins, straight from GitHub.</h1>
<p class=sub>${big ? `Browse ${count} Decky plugins, then install and update them from their authors' GitHub releases, right in Gaming Mode.` : `Install and update ${count} plugins right on your device.`}</p>
<div class=pills><span>${count} plugins</span><span>One-tap updates</span>${big ? "<span>Open source</span>" : ""}</div>
<div class=device><div class=screen><img src="${screen}"><i></i></div></div>`;

const browser = await chromium.launch();
for (const [file, w, h, big, type] of [
  ["promo/hero.png", 1920, 1080, true, "png"],
  ["promo/social.png", 1280, 640, false, "png"],
  ["screenshots/hero.jpg", 1920, 1080, true, "jpeg"],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html(w, h, big));
  writeFileSync(new URL(file, root), await page.screenshot({ type, ...(type === "jpeg" ? { quality: 90 } : {}) }));
  await page.close();
  console.log("wrote", file);
}
await browser.close();
