import { createPluginList } from './remote-plugins.js';
import { createUpdates } from './remote-updates.js';
import { setupScan } from './remote-scan.js';
import { setupShare } from './remote-share.js';
import { setupConnection, setupStatus } from './remote-session.js';
import { loadDevices, setupDevices } from './remote-devices.js';
import { setupPairing } from './remote-pairing.js';
import { setupRequests } from './remote-request.js';
import { PAIRING_DETAILS_KEY, defaultBrowserName, pairingDetails } from './remote-core.js';

// The helpers are in remote-core.js; they stay importable from here.
export { BROWSER_IDS_KEY, PAIRED_DEVICES_KEY, PAIRING_DETAILS_KEY, REQUEST_STATES, SELECTED_DEVICE_KEY, TERMINAL, browserIdFor, connectionDiagnostics, defaultBrowserName, detailsFromPairingLink, deviceUrl, exchange, fingerprintBytes, pairingDetails, pinnedHashes, sleep, timeout } from './remote-core.js';


const RELEASE_TAG = /^[A-Za-z0-9][A-Za-z0-9._+/-]{0,127}$/;
const PLUGIN_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

// A plugin page opened with ?tag=<release> asks the device for that release (same rules as the device's own check).
const releaseTagFrom = search => {
  const tag = new URLSearchParams(search).get('tag') || '';
  return RELEASE_TAG.test(tag) && !tag.includes('..') && !tag.includes('//') && !tag.endsWith('/') ? tag : undefined;
};

// The page's shared state and helpers. The setup functions in remote-session.js, remote-devices.js,
// remote-pairing.js and remote-request.js read the state from ctx.s and add their functions to ctx.
function createContext(root, details) {
  const byId = id => root.querySelector(`#remote-${id}`);
  const form = byId('pair-form');
  const pluginId = root.dataset.pluginId;
  const compact = Boolean(pluginId && !form);
  const { devices, selectedFingerprint } = loadDevices();
  return {
    root, details, byId, form, pluginId, compact, selectedFingerprint, doc: root.ownerDocument,
    releaseTag: compact ? releaseTagFrom(location.search) : undefined,
    picker: byId('device-picker'),
    buttons: { pair: byId('pair'), request: byId('request'), cancel: byId('cancel'), reconnect: byId('reconnect'), forget: byId('forget') },
    s: { devices, requestAction: 'install', busy: false, cancelled: false, pairing: false },
  };
}

// What the QR code carried, shown in the form before anything else can stop the page (a browser that
// can't pair still gets the link to copy into one that can). The address bar no longer has it.
function prefill({ byId, details }) {
  // The browser's name on the device's list: what it is, not just "Browser".
  const nameField = byId('name');
  if (nameField && (!nameField.value || nameField.value === 'Browser') && typeof navigator !== 'undefined') nameField.value = defaultBrowserName(navigator.userAgent);
  if (details?.link && byId('pairing-link')) byId('pairing-link').value = details.link;
  if (details?.code && byId('code')) byId('code').value = details.code;
}

// False (with the page told why) when this page cannot go on: a bad plugin id, or a browser without WebTransport.
function canRun(ctx) {
  const { pluginId, buttons, details } = ctx;
  if (pluginId && !PLUGIN_ID.test(pluginId)) {
    ctx.say('Invalid plugin identifier.');
    if (buttons.pair) buttons.pair.disabled = true;
    return false;
  }
  if (typeof WebTransport !== 'undefined' && globalThis.isSecureContext) return true;
  ctx.setState('unsupported');
  ctx.say(details?.link ? 'This browser can’t connect to your device. Copy the pairing link below and open it in Chrome or Edge.' : 'Remote install needs Chrome, Edge or another Chromium-based browser. Open this page there.');
  if (buttons.pair) buttons.pair.disabled = true;
  return false;
}

// The installed plugins and the update notices (docs/remote-plugins.js, docs/remote-updates.js).
function setupLists(ctx) {
  const { root, s, compact, pluginId } = ctx;
  s.inventory = createPluginList(root, {
    loadPage: offset => ctx.send({ op: 'plugins', token: s.token, offset }),
    request: (id, action, name) => ctx.runRequest(id, action, name),
  });
  // The Paired devices page only.
  if (!compact && !pluginId) {
    s.updates = createUpdates(root, { summary: () => ctx.send({ op: 'summary', token: s.token }), device: () => (s.token ? ctx.activeDevice() : undefined), onResult: result => s.inventory?.setUpdates(result) });
  }
}

// A plugin's page: Send to device opens this card as a window; the close button, Escape or a click outside close it.
function setupModal({ root, byId }) {
  if (!root.showModal) return;
  const open = () => { if (!root.open) root.showModal(); };
  root.ownerDocument.getElementById('remote-open')?.addEventListener('click', open);
  byId('close')?.addEventListener('click', () => root.close());
  root.addEventListener('click', event => { if (event.target === root) root.close(); });
  if (location.hash === '#remote-install') open();
}

export function init(root, details) {
  const ctx = createContext(root, details);
  const { s, form, pluginId, compact } = ctx;
  prefill(ctx);
  setupStatus(ctx);
  setupConnection(ctx);
  if (!canRun(ctx)) return;
  // What a device's lists show once it is chosen; the plugin's own page has no lists.
  ctx.loadDeviceLists = () => { void s.inventory?.load(); void s.updates?.check(); };
  setupDevices(ctx);
  setupRequests(ctx);
  setupPairing(ctx);
  // Handed over as functions that look the page's own up when used.
  setupScan({ root, byId: ctx.byId, form, pairDevice: link => ctx.pairDevice(link) });
  setupShare({ byId: ctx.byId, say: (...args) => ctx.say(...args), send: message => ctx.send(message), activeDevice: () => ctx.activeDevice() });
  ctx.startDevices();
  if (details && form) ctx.fillDevice(details);
  setupLists(ctx);
  ctx.updateActions();
  if (!pluginId && s.token) ctx.loadDeviceLists();
  if (compact) setupModal(ctx);
  if (form && details) ctx.openAdd();
  if (form && details?.pairingToken) void ctx.pairDevice(details);
  addEventListener('pagehide', ctx.disconnect, { once: true });
}

// The pairing link in the address bar (or the one kept for this tab) says which device to pair with.
function readPairingDetails() {
  const fromLink = pairingDetails(location.hash);
  let details = fromLink;
  try {
    if (fromLink) sessionStorage.setItem(PAIRING_DETAILS_KEY, new URLSearchParams({
      device: fromLink.address, fingerprint: fromLink.fingerprint,
    }).toString());
    else details = pairingDetails(sessionStorage.getItem(PAIRING_DETAILS_KEY) || '');
  } catch { /* Manual pairing is still available when browser storage is disabled. */ }
  if (fromLink) {
    /** @type {any} */ (fromLink).link = location.href;
    history.replaceState(history.state, '', location.pathname + location.search);
  }
  return { details, fromLink };
}

if (typeof document !== 'undefined') {
  const { details, fromLink } = readPairingDetails();
  const root = document.querySelector('#remote-install');
  if (root) init(root, details);
  else if (fromLink) {
    const prompt = /** @type {HTMLElement | null} */ (document.querySelector('#remote-device-ready'));
    if (prompt) prompt.hidden = false;
  }
}
