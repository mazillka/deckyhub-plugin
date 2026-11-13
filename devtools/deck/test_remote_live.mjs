import { connect, TARGETS, DECK } from "./cdp.mjs";

// Remote Install's backend on a real device, through Decky Loader's plugin API: Pair mode on, a pairing code,
// the update summary paired browsers ask for, and Pair mode off again. The pairing window and the panel's
// buttons are covered by the browser mock (decky-mock/e2e/remote-install.spec.ts); pairing a real phone is manual.
async function main() {
  console.log(`Connecting to ${DECK}...`);
  const shared = await connect(TARGETS.shared);

  const call = async (route, ...args) => {
    const result = await shared.eval(`
      (async () => {
        const init = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
        if (!init) return { error: "No decky loader API init" };
        return await init.connect(2, "DeckyHub").call(${JSON.stringify(route)}, ...${JSON.stringify(args)});
      })()
    `);
    console.log(`${route}:`, JSON.stringify(result, null, 2));
    return result;
  };

  const failures = [];
  const check = (name, ok) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
    if (!ok) failures.push(name);
  };

  try {
    const enabled = await call("set_remote_install_enabled", true);
    check("Pair mode starts and has an address", Boolean(enabled?.enabled && enabled.active && enabled.address));

    const pairing = await call("begin_remote_pairing");
    check(
      "a six-digit pairing code and a token",
      /^\d{6}$/.test(pairing?.code ?? "") && Boolean(pairing?.pairingToken),
    );

    const status = await call("get_remote_install_status");
    check(
      "the status shows the code and its countdown",
      status?.pairingCode === pairing?.code && status.pairingExpiresIn > 0,
    );

    const reported = await call("set_remote_updates", [{ name: "Test plugin", version: "1.0.0" }]);
    check("the update summary is stored", reported?.count === 1);
    await call("set_remote_updates", []);
  } finally {
    await call("set_remote_install_enabled", false);
  }

  if (failures.length) {
    console.error(`${failures.length} check(s) failed`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
