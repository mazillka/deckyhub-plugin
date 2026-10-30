// Builds this checkout's DeckyHub, serves the ZIP from this computer and has
// Decky Loader on the Deck install it, confirming Decky's own dialog.
//   DECK=192.168.1.209:8081 node devtools/deck/deploy.mjs
// The ZIP's version gets a "-dev.<time>" suffix so the Deck shows which build runs
// (or DECKYHUB_VERSION=3.0.0-rc.13 for one without).
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createSocket } from "node:dgram";
import { lookup } from "node:dns/promises";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect, DECK, resetFocus, sleep, TARGETS, waitFor } from "./cdp.mjs";

const root = new URL("../../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
// Rollup through Node itself: pnpm's shell shim isn't on every PATH.
execSync(`"${process.execPath}" node_modules/rollup/dist/bin/rollup -c`, { cwd: root, stdio: "inherit" });

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
// DECKYHUB_VERSION sets it exactly (say, for screenshots that shouldn't show "-dev").
const version = process.env.DECKYHUB_VERSION ?? `${pkg.version}-dev.${new Date().toISOString().replace(/\D/g, "").slice(4, 12)}`;
const stage = join(tmpdir(), "deckyhub-deck-deploy");
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, "DeckyHub", "dist"), { recursive: true });
cpSync(join(root, "dist", "index.js"), join(stage, "DeckyHub", "dist", "index.js"));
for (const file of ["LICENSE.md", "main.py", "plugin.json"]) cpSync(join(root, file), join(stage, "DeckyHub", file));
writeFileSync(join(stage, "DeckyHub", "package.json"), JSON.stringify({ ...pkg, version }, null, 2));
execSync(`python -c "import shutil; shutil.make_archive('DeckyHub', 'zip', '.', 'DeckyHub')"`, { cwd: stage });
const zip = readFileSync(join(stage, "DeckyHub.zip"));
const sha256 = createHash("sha256").update(zip).digest("hex");

// This computer's address on the Deck's network: the one a socket to it would use.
const deckHost = DECK.split(":")[0];
const { address: deckAddress } = await lookup(deckHost, { family: 4 });
const localAddress = await new Promise((resolve, reject) => {
  const socket = createSocket("udp4");
  socket.connect(9, deckAddress, () => { resolve(socket.address().address); socket.close(); });
  socket.on("error", reject);
});

const server = createServer((request, response) => {
  response.writeHead(request.url === "/DeckyHub.zip" ? 200 : 404, { "Content-Type": "application/zip" });
  response.end(request.url === "/DeckyHub.zip" ? zip : undefined);
}).listen(0, localAddress);
await new Promise((resolve) => server.once("listening", resolve));
const url = `http://${localAddress}:${server.address().port}/DeckyHub.zip`;

const shared = await connect(TARGETS.shared);
const main = await connect(TARGETS.main);
const startPath = await shared.eval("location.pathname.slice('/routes'.length)");
const running = await shared.eval(`DeckyPluginLoader.plugins?.find((plugin) => plugin.name === "DeckyHub")?.version ?? null`);
try {
  await shared.eval(`DFL.Navigation.CloseSideMenus?.(); DeckyBackend.call("utilities/install_plugin", ${JSON.stringify(url)}, "DeckyHub", ${JSON.stringify(version)}, "${sha256}", 2).then(() => true)`);
  // Decky asks "…update DeckyHub to version <version>?" on the main screen. Press
  // Update in that dialog only: other windows (a plugin's Manage) have Update buttons too.
  await waitFor(main, `(() => {
    // The dialog for this version that still waits for an answer (an earlier, broken
    // attempt can leave one behind, stuck mid-update).
    const button = [...document.querySelectorAll("[class*=ConfirmDialog]")]
      .filter((el) => el.textContent.includes(${JSON.stringify(version)}) && /DeckyHub/.test(el.textContent))
      .flatMap((el) => [...el.querySelectorAll("button, .DialogButton")])
      .find((el) => el.textContent.trim() === "Update");
    button?.click();
    return !!button;
  })()`);
  // Reinstalling the version already running: the check below passes at once, so
  // first give Decky time to swap the files and reload DeckyHub.
  if (running === version) await sleep(15000);
  await waitFor(shared, `DeckyPluginLoader.plugins?.some((plugin) => plugin.name === "DeckyHub" && plugin.version === ${JSON.stringify(version)})`, 60000);
  await resetFocus(shared, startPath);
  console.log(`DeckyHub ${version} is running on ${deckHost}`);
} finally {
  shared.close();
  main.close();
  server.close();
}
