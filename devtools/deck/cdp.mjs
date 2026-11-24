// A small client for Steam's CEF debugger on a Steam Deck in Gaming Mode. Decky
// Loader turns the debugger on (port 8081), so this reaches Steam's own pages:
// "SharedJSContext" (where Decky and its plugins run), "Steam Big Picture Mode"
// (the main screen) and "QuickAccess_uid2" (the Quick Access menu).
export const DECK = process.env.DECK ?? "steamdeck:8081";

export const TARGETS = { shared: "SharedJSContext", main: "Steam Big Picture Mode", quickAccess: "QuickAccess_uid2" };

export async function connect(title) {
  const targets = await (await fetch(`http://${DECK}/json`, { signal: AbortSignal.timeout(15000) })).json();
  // Steam numbers its windows (QuickAccess_uid2) and counts up each time its UI reloads, leaving the old ones
  // listed: for a numbered name take the newest, the one that is alive.
  const uid = (candidate) => Number(candidate.title.match(/\d+$/)?.[0] ?? 0);
  const target = /_uid\d+$/.test(title)
    ? targets
        .filter((candidate) => candidate.title.startsWith(title.replace(/\d+$/, "")))
        .sort((a, b) => uid(b) - uid(a))[0]
    : targets.find((candidate) => candidate.title === title);
  if (!target) throw new Error(`No "${title}" page on ${DECK}; is the Deck in Gaming Mode with Decky Loader?`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`Can't connect to ${title}`));
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method) listeners.forEach((listener) => listener(message));
  };
  const send = (method, params = {}, timeout = 15000) =>
    new Promise((resolve, reject) => {
      const messageId = ++id;
      const timer = setTimeout(() => {
        pending.delete(messageId);
        reject(new Error(`${title}: ${method} timed out`));
      }, timeout);
      pending.set(messageId, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(`${title}: ${message.error.message}`));
        else resolve(message.result);
      });
      ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  return {
    send,
    on: (listener) => listeners.add(listener),
    // Runs an expression (or `(() => ...)()`) in the page and returns its JSON value.
    async eval(expression) {
      const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails)
        throw new Error(`${title}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      return result.value;
    },
    // A page that isn't on screen (a closed Quick Access menu) never renders a frame.
    async screenshot() {
      const { data } = await send("Page.captureScreenshot", { format: "png" }, 8000);
      return Buffer.from(data, "base64");
    },
    close: () => ws.close(),
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls `expression` in `page` until it's truthy, and returns that value.
export async function waitFor(page, expression, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = await page.eval(expression).catch(() => null);
    if (value) return value;
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${expression}`);
    await sleep(300);
  }
}

// Opens a Gaming Mode page by replacing the current one in Steam's history, not
// adding to it: hundreds of test visits otherwise piled up, and B then walked back
// through them all (seen on a Deck).
export const goTo = (shared, path) =>
  shared.eval(
    `SteamUIStore.WindowStore.GamepadUIMainWindowInstance.MenuStore.CloseSideMenus(); SteamUIStore.WindowStore.GamepadUIMainWindowInstance.m_history.replace(${JSON.stringify(path)}); true`,
  );

// Scripts click Steam's dialogs directly, not with the controller, and a dialog
// closed that way can leave gamepad focus on its now-invisible element: the D-pad
// then does nothing until Up (seen on a Deck). Leaving the screen and coming back
// lets Steam place focus afresh. Call it last, with the path to end on.
export async function resetFocus(shared, path) {
  await goTo(shared, "/library/home");
  await sleep(1200);
  if (path && path !== "/library/home") {
    await goTo(shared, path);
    await sleep(1200);
  }
}

// Decky's plugin list as an expression for the page's eval (a promise of {name, version, ...}): newer Decky
// Loaders no longer expose DeckyPluginLoader, so every script asks the backend the way Decky's own UI does.
export const DECKY_PLUGINS = `DeckyBackend.call("loader/get_plugins")`;

// A value as JavaScript source for the page's eval: JSON, with the characters JSON allows but a script must not
// contain raw (< and the two Unicode line separators) written as escapes, so no text can end the code early.
export const quote = (value) =>
  JSON.stringify(value).replace(/[<\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
