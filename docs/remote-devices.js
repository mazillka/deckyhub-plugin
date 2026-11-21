import { PAIRED_DEVICES_KEY, SELECTED_DEVICE_KEY, TERMINAL, deviceUrl, isPin, pinnedHashes, probeDevice } from './remote-core.js';
import { translate } from './remote-i18n.js';

// The paired devices: what the browser remembers of them, their cards and picker, and choosing one.

const DAY = 24 * 3600 * 1000;
export const MAX_DEVICES = 16;

// Pairings unused for 30 days are dropped; the device forgets them after the same time.
const isSavedDevice = device => Boolean(device) && typeof device.name === 'string' && typeof device.address === 'string' &&
  isPin(device.fingerprint) && /^[A-Za-z0-9_-]{43}$/.test(device.token);

export function loadDevices() {
  let devices = [], selectedFingerprint;
  try {
    const saved = JSON.parse(localStorage.getItem(PAIRED_DEVICES_KEY) || '[]');
    const cutoff = Date.now() - 30 * DAY;
    if (Array.isArray(saved)) devices = saved
      .filter(device => !(device?.lastUsed < cutoff))
      .filter(isSavedDevice)
      .slice(0, MAX_DEVICES)
      .map(device => isPin(device.nextFingerprint) ? device : { ...device, nextFingerprint: undefined });
    selectedFingerprint = localStorage.getItem(SELECTED_DEVICE_KEY);
  } catch { /* Pairing remains available without browser storage. */ }
  return { devices, selectedFingerprint };
}

export const ago = time => {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (!(minutes >= 0)) return '';
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
};

const ONLINE_PILLS = new Map([[true, ['online', 'Online']], [false, ['offline', 'Not reachable']]]);

const element = (doc, tag, className, text) => {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const cardButton = (doc, label, onClick, className = '') => {
  const button = element(doc, 'button', className, translate(label));
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
};

export function setupDevices(ctx) {
  const { byId, s, compact, picker, doc, buttons } = ctx;
  const cards = byId('device-cards');
  const online = new Map(); // fingerprint -> whether the device answered when this page opened
  ctx.activeDevice = () => s.devices.find(device => device.token === s.token);
  ctx.saveDevices = () => {
    try { localStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(s.devices)); } catch { /* Keep pairings in this page. */ }
  };
  ctx.rememberDevice = device => {
    try {
      if (device) localStorage.setItem(SELECTED_DEVICE_KEY, device.fingerprint);
      else localStorage.removeItem(SELECTED_DEVICE_KEY);
    } catch { /* Selection still works in this page. */ }
  };
  const currentIndex = () => {
    const index = s.devices.indexOf(ctx.activeDevice());
    return index < 0 ? undefined : index;
  };
  ctx.learnPins = result => {
    const device = ctx.activeDevice();
    if (!device || !isPin(result.fingerprint)) return;
    const next = isPin(result.nextFingerprint) ? result.nextFingerprint : undefined;
    if (device.fingerprint === result.fingerprint && device.nextFingerprint === next) return;
    device.fingerprint = result.fingerprint;
    device.nextFingerprint = next;
    s.endpoint = { ...s.endpoint, hashes: pinnedHashes(device) };
    ctx.saveDevices();
    ctx.rememberDevice(device);
  };

  const forgetDevice = device => {
    const wasActive = device === ctx.activeDevice();
    // Only a request that is being followed right now holds a device; one left over from before (the device
    // restarted, say) goes with it: that is how a stuck "Status unknown" is cleared.
    if (wasActive && s.busy) { ctx.say('A request is in progress. Wait for it to finish, then forget the device.'); return; }
    s.devices = s.devices.filter(other => other !== device);
    ctx.saveDevices();
    online.delete(device.fingerprint);
    if (wasActive) {
      ctx.clearRequest();
      ctx.disconnect();
      ctx.rememberDevice(undefined);
      ctx.setState('new');
    }
    ctx.renderPicker(currentIndex());
    ctx.say(`${device.name} forgotten in this browser. Remove this browser under Paired browsers in DeckyHub on the device too.`);
  };
  const startRename = (device, actions) => {
    const input = element(doc, 'input');
    input.value = device.name;
    input.maxLength = 64;
    input.setAttribute('aria-label', translate('Device name'));
    const save = () => {
      const value = input.value.trim().slice(0, 64);
      if (value) { device.name = value; ctx.saveDevices(); }
      ctx.renderPicker(currentIndex());
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); save(); }
      if (event.key === 'Escape') ctx.renderPicker(currentIndex());
    });
    actions.replaceChildren(input, cardButton(doc, 'Save', save));
    input.focus();
    input.select();
  };
  const cardMain = (device, index, selected) => {
    const open = element(doc, 'button', 'rd-card-main');
    open.type = 'button';
    open.setAttribute('aria-pressed', String(index === selected));
    open.append(element(doc, 'strong', '', device.name), element(doc, 'small', '', device.address));
    open.addEventListener('click', () => {
      if (picker.disabled) return;
      ctx.renderPicker(index);
      ctx.selectDevice(index);
    });
    return open;
  };
  const cardMeta = device => {
    const meta = element(doc, 'div', 'rd-card-meta');
    const [kind, label] = ONLINE_PILLS.get(online.get(device.fingerprint)) || ['checking', 'Checking…'];
    const pill = element(doc, 'span', 'rd-pill', translate(label));
    pill.dataset.kind = kind;
    meta.append(pill);
    if (device.lastUsed) meta.append(element(doc, 'span', '', translate(`Used ${ago(device.lastUsed)}`)));
    return meta;
  };
  const cardActions = device => {
    const actions = element(doc, 'div', 'rd-card-actions');
    actions.append(cardButton(doc, 'Rename', () => startRename(device, actions)), cardButton(doc, 'Forget', () => forgetDevice(device), 'rd-forget'));
    return actions;
  };
  // The devices list: one card per paired device. A browser can hold several devices, and a device can be paired with
  // several browsers: each pairing is its own entry here, and each browser keeps its own list.
  const renderCards = selected => {
    if (compact || !cards || !doc) return;
    cards.replaceChildren(...s.devices.map((device, index) => {
      const item = element(doc, 'li', 'rd-card');
      item.dataset.selected = String(index === selected);
      item.append(cardMain(device, index, selected), cardMeta(device), cardActions(device));
      return item;
    }));
  };
  // Which of the paired devices answer right now: checked once when the page opens, in parallel.
  const checkOnline = () =>
    Promise.all(s.devices.map(async device => online.set(device.fingerprint, await probeDevice(device))))
      .then(() => renderCards(currentIndex()));
  // Refresh: look for the paired devices again (one switched on after the page opened).
  const devicesRefresh = byId('devices-refresh');
  devicesRefresh?.addEventListener('click', () => {
    devicesRefresh.disabled = true;
    void checkOnline().finally(() => { devicesRefresh.disabled = false; });
  });
  const pickerLabel = () => translate(compact ? 'Select a device' : s.devices.length ? 'Pair another device' : 'Pair a device');
  ctx.renderPicker = selected => {
    picker.replaceChildren(new Option(pickerLabel(), ''));
    s.devices.forEach((device, index) => {
      if (!compact || s.reachable?.has(index)) picker.add(new Option(device.name, String(index)));
    });
    if (compact) {
      const showPicker = Boolean(s.reachable?.size);
      picker.hidden = buttons.request.hidden = !showPicker;
      byId('pair-new').hidden = showPicker;
    }
    picker.value = selected === undefined ? '' : String(selected);
    picker.disabled = false;
    ctx.root.dataset.hasDevices = String(s.devices.length > 0);
    renderCards(selected);
  };

  // A request left over from another page (the person moved on while Decky was still installing): ask once how it ended,
  // so a request that finished, or that the device forgot, does not keep this device's list blocked.
  const settlePending = async device => {
    const id = s.requestId;
    try {
      const next = await ctx.send({ op: 'status', token: s.token, requestId: id });
      if (s.requestId !== id || !TERMINAL.has(next.status)) return;
    } catch (error) {
      if (error?.code !== 'request_not_found' || s.requestId !== id) return;
    }
    ctx.clearRequest();
    ctx.saveRequest();
    ctx.updateActions();
    ctx.say(compact ? '' : `${device.name} selected.`);
    void s.inventory?.load();
  };
  // The request this device was left holding (see saveRequest).
  const restoreRequest = pending => {
    ({ id: s.requestId, key: s.idempotencyKey, pluginId: s.requestPluginId } = pending || {});
    s.requestAction = pending?.action || 'install';
    s.requestName = typeof pending?.name === 'string' ? pending.name : undefined;
    s.requestNames = Array.isArray(pending?.names) && pending.names.every(name => typeof name === 'string') ? pending.names : undefined;
  };
  const showDeviceInForm = device => {
    byId('address').value = device.address;
    byId('fingerprint').value = device.fingerprint;
    byId('device-name').value = device.name;
    if (buttons.reconnect) buttons.reconnect.hidden = false;
  };
  const nothingSelected = () => {
    ctx.setState(compact ? (s.reachable?.size ? 'ready' : 'none') : 'new');
    ctx.updateActions();
    ctx.say(compact ? '' : 'Turn on Remote access on your device, then scan its QR code or paste the pairing link.');
  };
  const pendingMessage = device => s.requestPluginId
    ? 'This device has a pending request. Retry its status before starting another change.'
    : compact ? '' : `${device.name} selected.`;
  ctx.selectDevice = index => {
    ctx.disconnect();
    ctx.clearRequest();
    const device = s.devices[index];
    ctx.rememberDevice(device);
    if (!device) return nothingSelected();
    try {
      ctx.setState(compact ? 'ready' : 'paired');
      s.endpoint = { url: deviceUrl(device.address), hashes: pinnedHashes(device) };
      s.token = device.token;
      restoreRequest(device.pending);
      if (ctx.form) showDeviceInForm(device);
      if (buttons.forget) buttons.forget.hidden = false;
      ctx.updateActions();
      if (!ctx.pluginId) ctx.loadDeviceLists();
      ctx.say(pendingMessage(device));
      if (s.requestId && !s.busy) void settlePending(device);
    } catch (error) { ctx.showError(error); }
  };
  picker.addEventListener('change', () => ctx.selectDevice(picker.value));
  buttons.forget?.addEventListener('click', () => {
    const device = ctx.activeDevice();
    if (device) forgetDevice(device);
  });

  // The first look at the devices when the page opens.
  ctx.startDevices = () => {
    const selectedIndex = Math.max(0, s.devices.findIndex(device => device.fingerprint === ctx.selectedFingerprint));
    if (compact) return startCompact(ctx, selectedIndex);
    const resume = s.devices.length > 0 && !ctx.details;
    ctx.renderPicker(resume ? selectedIndex : undefined);
    if (resume) ctx.selectDevice(selectedIndex);
    if (doc && resume) checkOnline();
  };
}

// A plugin's page: looks for the paired devices on the network; Refresh runs it again (a device switched on
// after the page opened).
function startCompact(ctx, selectedIndex) {
  const { byId, s } = ctx;
  ctx.renderPicker();
  ctx.setState(s.devices.length ? 'checking' : 'none');
  const refreshButton = byId('refresh');
  const settle = indices => {
    s.reachable = new Set(indices.filter(index => index !== null));
    const selected = s.reachable.has(selectedIndex) ? selectedIndex : s.reachable.values().next().value;
    ctx.renderPicker(selected);
    if (selected !== undefined) ctx.selectDevice(selected);
    else { ctx.setState('none'); ctx.say('No paired device is reachable. Turn on Remote access on your device, on the same network as this browser.'); }
  };
  const checkDevices = () => {
    if (!s.devices.length) return;
    ctx.setState('checking');
    ctx.say('Checking paired devices…');
    if (refreshButton) refreshButton.disabled = true;
    void Promise.all(s.devices.map(async (device, index) => await probeDevice(device) ? index : null))
      .then(settle)
      .finally(() => { if (refreshButton) refreshButton.disabled = false; });
  };
  if (refreshButton) {
    refreshButton.hidden = !s.devices.length;
    refreshButton.addEventListener('click', checkDevices);
  }
  checkDevices();
}
