// Real download smoke test. Requires a trusted SSH host key and key-based access
// for deck@<DECK host>; SSH is used only to verify and remove this test's file.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { connect, DECK, TARGETS, sleep } from "./cdp.mjs";

const repo = process.env.DECK_TEST_REPO;
const url = process.env.DECK_TEST_URL;
const sha256 = process.env.DECK_TEST_SHA256?.toLowerCase();
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !url?.startsWith(`https://github.com/${repo}/releases/download/`) || !/^[a-f0-9]{64}$/.test(sha256 ?? "")) {
  throw new Error("Set DECK_TEST_REPO, DECK_TEST_URL and DECK_TEST_SHA256 to a GitHub release ZIP and its SHA-256.");
}
const host = DECK.split(":")[0];
const ssh = (script) => execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", `deck@${host}`, `python3 -c "exec(bytes.fromhex('${Buffer.from(script).toString("hex")}'))"`], { encoding: "utf8" }).trim();
const name = `deckyhub-test-${randomBytes(16).toString("hex")}.zip`;
const path = `/home/deck/Downloads/deckyhub/${name}`;
// Refuse to start without verified SSH access or if the random destination exists.
assert.equal(ssh(`from pathlib import Path\nprint(Path(${JSON.stringify(path)}).exists())`), "False");
const shared = await connect(TARGETS.shared);
const backend = (method, ...args) => shared.eval(`DeckyBackend.call("loader/call_plugin_method", "DeckyHub", ${JSON.stringify(method)}${args.map((arg) => `, ${JSON.stringify(arg)}`).join("")})`);
let job, jobId, removed = false;
try {
  const started = await backend("download_asset", { name, url, sha256 }, repo);
  assert.ok(started.jobId, JSON.stringify(started));
  jobId = started.jobId;
  const deadline = Date.now() + 120_000;
  do {
    job = await backend("get_download", started.jobId);
    if (!["queued", "downloading"].includes(job.state)) break;
    await sleep(500);
  } while (Date.now() < deadline);
  assert.equal(job.state, "complete", JSON.stringify(job));
  assert.equal(job.path, path);
  // Delete only the unique file this run requested, and only if its bytes match.
  const result = ssh(`from pathlib import Path\nimport hashlib\np=Path(${JSON.stringify(path)})\nh=hashlib.sha256(p.read_bytes()).hexdigest()\nassert h == ${JSON.stringify(sha256)}, 'checksum mismatch; file kept'\np.unlink()\nprint(h)`);
  assert.equal(result, sha256);
  removed = true;
  console.log(`Download verified and removed: ${path}`);
} finally {
  if (jobId && (!job || ["queued", "downloading"].includes(job.state))) {
    await backend("cancel_download", jobId).catch(() => {});
  }
  shared.close();
  if (!removed) console.error(`Check for a remaining test download: ${path}`);
}
