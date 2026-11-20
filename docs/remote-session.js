import { connectionDiagnostics, exchange, timeout } from './remote-core.js';
import { translate } from './remote-i18n.js';

// The page's status line, its add-device window and its connection to the device. Each setup function adds its
// functions to ctx (the page's shared state and helpers, see init in remote-install.js).

// A message that says something went wrong is an alert: announced at once, styled red, and scrolled into view
// (on a phone it can be below the fold). Everything else stays a quiet status.
const ERROR_STATES = ['unreachable', 'unsupported', 'declined', 'error', 'failed'];

const setKind = (element, text, alert, politeness) => {
  element.textContent = text;
  element.dataset.kind = alert ? 'error' : '';
  element.setAttribute('role', alert ? 'alert' : 'status');
  if (politeness) element.setAttribute('aria-live', alert ? 'assertive' : 'polite');
};

const scrollBehavior = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

const showDialog = dialog => {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
};

export function setupStatus(ctx) {
  const { root, byId, compact } = ctx;
  const status = byId('status'), addDialog = byId('add-dialog'), dialogStatus = byId('dialog-status');
  ctx.openAdd = () => {
    if (addDialog && !addDialog.open) showDialog(addDialog);
  };
  ctx.closeAdd = () => {
    if (!addDialog?.open) return;
    if (typeof addDialog.close === 'function') addDialog.close();
    else addDialog.removeAttribute('open');
  };
  byId('add-close')?.addEventListener('click', ctx.closeAdd);
  // What the page shows follows root.dataset.state (remote-install.css): new, connecting, approve, unreachable,
  // unsupported, error, declined or paired. A device that is paired needs no window any more.
  ctx.setState = state => { root.dataset.state = state; if (state === 'paired') ctx.closeAdd(); };
  // The send card's own states; the Paired devices page keeps its own (and ignores these).
  ctx.flow = state => { if (!byId('pair-form')) ctx.setState(state); };
  ctx.say = (message, isError = false) => {
    const alert = Boolean(message) && (isError || ERROR_STATES.includes(root.dataset.state));
    const text = translate(message);
    setKind(status, text, alert, true);
    if (compact) status.hidden = !text;
    const inDialog = Boolean(addDialog?.open && dialogStatus);
    if (dialogStatus) {
      setKind(dialogStatus, text, alert, false);
      dialogStatus.hidden = !text;
    }
    if (alert) (inDialog ? dialogStatus : status).scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  };
  ctx.showError = error => ctx.say(error instanceof Error ? error.message : 'Unable to contact the device.', true);
  byId('copy-link')?.addEventListener('click', async () => {
    const field = byId('pairing-link');
    try { await navigator.clipboard.writeText(field.value); ctx.say('Link copied. Paste it into Chrome or Edge.'); }
    catch { field.select(); ctx.say('Select the link, copy it, then paste it into Chrome or Edge.'); }
  });
}

const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

// The details of one failed connection, for the bug report.
const diagnosticsFor = (tried, device, error, permission) => {
  const connection = /** @type {any} */ (navigator).connection;
  return connectionDiagnostics({
    when: new Date().toISOString(), page: location.origin + location.pathname, browser: navigator.userAgent,
    secure: Boolean(globalThis.isSecureContext), webTransport: typeof WebTransport !== 'undefined', online: navigator.onLine,
    network: connection ? [connection.type, connection.effectiveType].filter(Boolean).join(' ') : '',
    // From the endpoint being tried: during a first pairing there is no saved device yet.
    permission, address: tried ? new URL(tried.url).host : device?.address, error,
    pin: tried?.hashes?.[0] ? hex(tried.hashes[0].value.slice(0, 4)) : device?.fingerprint,
  });
};

export function setupConnection(ctx) {
  const { byId, s, buttons } = ctx;
  const diagnostics = byId('diagnostics'), diagnosticsText = byId('diagnostics-text');
  ctx.closeTransport = () => {
    const current = s.transport;
    s.transport = undefined;
    current?.close();
  };
  ctx.disconnect = () => {
    ctx.closeTransport();
    s.endpoint = undefined;
    s.token = undefined;
    buttons.request.disabled = true;
    if (buttons.cancel) buttons.cancel.disabled = true;
    if (buttons.reconnect) buttons.reconnect.hidden = true;
    if (buttons.forget) buttons.forget.hidden = true;
    s.inventory?.reset();
    s.inventory?.setEnabled(false);
  };
  // The details of the last failed connection, shown under the tips so they can go with a bug report.
  const showDiagnostics = async error => {
    if (!diagnostics || !diagnosticsText) return;
    // Read before the first await: the failed pairing disconnects, which forgets the endpoint.
    const tried = s.endpoint, device = ctx.activeDevice();
    let permission;
    try { permission = (await navigator.permissions.query({ name: /** @type {any} */ ('local-network-access') })).state; } catch { /* not every browser has it */ }
    diagnosticsText.textContent = diagnosticsFor(tried, device, error, permission);
    diagnostics.hidden = false;
  };
  byId('copy-diagnostics')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(diagnosticsText.textContent); ctx.say('Details copied.'); }
    catch { ctx.say('Select the details, copy them, then paste them into your bug report.'); }
  });
  const openTransport = () => {
    const current = new WebTransport(s.endpoint.url, { serverCertificateHashes: s.endpoint.hashes });
    s.transport = current;
    const onClose = () => { if (s.transport === current) s.transport = undefined; };
    void current.closed.then(onClose, onClose);
  };
  const waitUntilReady = async transport => {
    try {
      await timeout(transport.ready, 45000);
    } catch (reason) {
      // The browser's own words (WebTransportError: "Opening handshake failed.", say) tell a blocked network from a refused certificate.
      const detail = [reason?.name, reason?.message].filter(Boolean).join(': ') || 'no details';
      void showDiagnostics(detail);
      throw Object.assign(new Error(`Could not reach your device. Check that Remote access is on and that it is on the same network as this browser. (${detail})`), { unreachable: true });
    }
  };
  // Remembers a pairing as used (at most once an hour).
  const touchDevice = () => {
    const used = ctx.activeDevice();
    if (used && !(Date.now() - used.lastUsed < 3600000)) { used.lastUsed = Date.now(); ctx.saveDevices(); }
  };
  ctx.send = async message => {
    if (!s.endpoint) throw new Error('Pair with your device first.');
    if (!s.transport) openTransport();
    const current = s.transport;
    try {
      await waitUntilReady(current);
      const result = await exchange(current, message);
      touchDevice();
      ctx.learnPins(result);
      if (diagnostics) diagnostics.hidden = true;
      return result;
    } catch (error) {
      if (s.transport === current) ctx.closeTransport();
      throw error;
    }
  };
}
