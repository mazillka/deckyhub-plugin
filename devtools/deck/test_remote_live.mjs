import { connect, TARGETS, DECK, goTo, sleep } from "./cdp.mjs";
import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
  console.log(`Connecting to ${DECK}...`);
  const shared = await connect(TARGETS.shared);
  const screen = await connect(TARGETS.main);

  // Connect through Decky Loader's plugin API
  const testRes = await shared.eval(`
    (async () => {
      const init = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
      if (!init) return { error: "No decky loader API init" };
      const api = init.connect(2, "DeckyHub");
      const settings = await api.call("get_settings");
      return { ok: true, settings };
    })()
  `);
  console.log("get_settings via API:", JSON.stringify(testRes, null, 2));

  // Test get_remote_install_status
  const statusRes = await shared.eval(`
    (async () => {
      const init = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
      const api = init.connect(2, "DeckyHub");
      return await api.call("get_remote_install_status");
    })()
  `);
  console.log("get_remote_install_status:", JSON.stringify(statusRes, null, 2));

  // Test set_remote_install_enabled(true)
  console.log("Enabling remote install...");
  const enableRes = await shared.eval(`
    (async () => {
      const init = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
      const api = init.connect(2, "DeckyHub");
      return await api.call("set_remote_install_enabled", true);
    })()
  `);
  console.log("set_remote_install_enabled(true):", JSON.stringify(enableRes, null, 2));

  // Test begin_remote_pairing
  console.log("Beginning remote pairing...");
  const pairRes = await shared.eval(`
    (async () => {
      const init = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
      const api = init.connect(2, "DeckyHub");
      return await api.call("begin_remote_pairing");
    })()
  `);
  console.log("begin_remote_pairing:", JSON.stringify(pairRes, null, 2));

  // Query status again to verify pairingCode is returned
  const statusAfterPair = await shared.eval(`
    (async () => {
      const init = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
      const api = init.connect(2, "DeckyHub");
      return await api.call("get_remote_install_status");
    })()
  `);
  console.log("Status after pairing:", JSON.stringify(statusAfterPair, null, 2));

  // Navigate Steam Big Picture Mode to DeckyHub settings
  console.log("Navigating to DeckyHub Settings in Gaming Mode...");
  await goTo(shared, "/deckyhub/settings");
  await sleep(3000);

  // Take screenshot of Steam Deck screen
  mkdirSync("devtools/deck/screenshots", { recursive: true });
  const shot = await screen.send("Page.captureScreenshot", { format: "png" });
  writeFileSync("devtools/deck/screenshots/deck_settings_remote_install.png", Buffer.from(shot.data, "base64"));
  console.log("Saved screenshot: devtools/deck/screenshots/deck_settings_remote_install.png");

  // Verify DOM on main screen
  const domInfo = await screen.eval(`
    (() => {
      const body = document.body.innerText;
      return {
        hasRemoteInstall: body.includes("Remote Install"),
        hasPairButton: body.includes("Pair New Browser"),
        hasAddress: body.includes("Device Address"),
        textSnippet: body.slice(0, 500)
      };
    })()
  `);
  console.log("Screen DOM info:", JSON.stringify(domInfo, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
