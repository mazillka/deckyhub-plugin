// Audit a few representative pages of the built static website, not the Decky mock.
import { chromium } from "playwright";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const path of ["/", "/help.html", "/contribute/"]) {
    await page.goto(`http://127.0.0.1:8765${path}`, { waitUntil: "networkidle" });
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const result = await page.evaluate(() =>
      window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } }),
    );
    const errors = result.violations.filter((v) => ["critical", "serious"].includes(v.impact));
    if (errors.length)
      throw new Error(
        `${path}: ${JSON.stringify(errors.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })))}`,
      );
    console.log(`${path}: no serious or critical WCAG 2 A/AA violations`);
  }
} finally {
  await browser.close();
}
