import { connect, TARGETS, DECK } from "./cdp.mjs";

async function main() {
  const shared = await connect(TARGETS.shared);
  const res = await shared.eval(`
    (async () => {
      const init = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
      const api = init.connect(2, "DeckyHub");
      // Call a test or export_logs or check python info
      const info = await api.call("get_deckyhub_info");
      return info;
    })()
  `);
  console.log("DeckyHub info from Steam Deck:", res);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
