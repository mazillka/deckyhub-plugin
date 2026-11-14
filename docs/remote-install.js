import { createPluginList } from './remote-plugins.js';
import { createUpdates } from './remote-updates.js';
import { translate } from './remote-i18n.js';

// Remote requests use WebTransport with the certificate fingerprint displayed on the device.
// The user must enter the fingerprint through this trusted HTTPS page, not a network response.
export function deviceUrl(address) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/.exec(address.trim());
  if (!match) throw new Error('Enter a private IPv4 address and port, for example 192.168.1.50:8765.');
  const [a, b, c, d, port] = match.slice(1).map(Number);
  if ([a, b, c, d].some(n => n > 255) || port !== 8765 ||
      !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) {
    throw new Error('Enter the private IPv4 address shown in DeckyHub with port 8765.');
  }
  return `https://${a}.${b}.${c}.${d}:${port}/remote-install`;
}

export function fingerprintBytes(value) {
  const hex = value.trim().replace(/[:\s-]/g, '');
  if (!/^[a-f\d]{64}$/i.test(hex)) throw new Error('Enter the 64-digit SHA-256 fingerprint shown on your device.');
  return Uint8Array.from(hex.match(/../g), pair => parseInt(pair, 16));
}

export function pairingDetails(fragment) {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const address = params.get('device');
  const fingerprint = params.get('fingerprint');
  const pairingToken = params.get('pair');
  // The six-digit code shown beside the QR code; the QR link carries it so the form can show it too.
  const code = /^\d{6}$/.test(params.get('code') || '') ? params.get('code') : undefined;
  if (!address || !fingerprint) return null;
  if (pairingToken !== null && !/^[A-Za-z0-9_-]{43}$/.test(pairingToken)) return null;
  // The device's own name, shown instead of its address; ignored if it looks odd.
  const name = /^[\w .-]{1,40}$/.test(params.get('name') || '') ? params.get('name') : undefined;
  try {
    deviceUrl(address);
    fingerprintBytes(fingerprint);
    return { address, fingerprint, ...(pairingToken && { pairingToken }), ...(code && { code }), ...(name && { name }) };
  } catch {
    return null;
  }
}

export function detailsFromPairingLink(value) {
  try {
    const url = new URL(value.trim());
    if (url.origin !== 'https://deckyhub.com' ||
        !['/develop/plugins/', '/develop/paired-devices.html', '/develop/paired-devices/', '/develop/remote-install/'].includes(url.pathname) || url.username || url.password) return null;
    return pairingDetails(url.hash);
  } catch {
    return null;
  }
}

const PAIRING_DETAILS_KEY = 'deckyhub.remoteInstall.device';
const PAIRED_DEVICES_KEY = 'deckyhub.remoteInstall.pairedDevices';
const SELECTED_DEVICE_KEY = 'deckyhub.remoteInstall.selectedDevice';

// What goes into a bug report when the device can't be reached: the browser, what it supports, the network it
// reports, the device's address and the start of its certificate pin, and the browser's own error. Never a token,
// a pairing code or a secret.
export function connectionDiagnostics({ when, page, browser, secure, webTransport, online, network, permission, address, pin, error }) {
  const yes = value => (value ? 'yes' : 'no');
  return [
    'DeckyHub connection details',
    `Time: ${when}`,
    `Page: ${page}`,
    `Browser: ${browser}`,
    `WebTransport: ${yes(webTransport)}, secure page: ${yes(secure)}, online: ${yes(online)}`,
    `Network the browser reports: ${network || 'unknown'}`,
    `Local network permission: ${permission || 'unknown'}`,
    `Device address: ${address || 'none'}`,
    `Certificate pin starts with: ${pin ? pin.slice(0, 8) : 'none'}`,
    `Error: ${error || 'none'}`,
  ].join('\n');
}

function timeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The device did not respond.')), ms);
  })]).finally(() => clearTimeout(timer));
}

// The device's current and upcoming certificates; the browser trusts either, so a
// certificate change on the device does not require pairing again.
export function pinnedHashes(device) {
  return [device.fingerprint, device.nextFingerprint].filter(Boolean)
    .map(value => ({ algorithm: 'sha-256', value: fingerprintBytes(value) }));
}

export async function exchange(transport, message) {
  const stream = await timeout(transport.createBidirectionalStream(), 10000);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  try {
    const payload = new TextEncoder().encode(JSON.stringify(message));
    if (payload.length > 16384) throw new Error('Request is too large.');
    await timeout(writer.write(payload), 10000);
    await timeout(writer.close(), 10000);
    let size = 0;
    const chunks = [];
    for (;;) {
      const { value, done } = await timeout(reader.read(), 10000);
      if (done) break;
      size += value.length;
      if (size > 16384) throw new Error('Device response is too large.');
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) { data.set(chunk, position); position += chunk.length; }
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (!result || typeof result !== 'object' || result.ok !== true) throw Object.assign(new Error('The device rejected the request.'), { code: result?.code === 'request_not_found' ? 'request_not_found' : undefined });
    return result;
  } finally {
    try { await reader.cancel(); } catch (_) { /* stream already closed */ }
    writer.releaseLock();
    reader.releaseLock();
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const REQUEST_STATES = new Set(['pending_confirmation', 'approved', 'installing', 'installed', 'uninstalled', 'enabled', 'disabled', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);
const TERMINAL = new Set(['installed', 'uninstalled', 'enabled', 'disabled', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);

export function init(root, details) {
  const byId = id => root.querySelector(`#remote-${id}`);
  const form = byId('pair-form'), status = byId('status'), pairButton = byId('pair');
  const requestButton = byId('request'), cancelButton = byId('cancel');
  const reconnectButton = byId('reconnect');
  const forgetButton = byId('forget');
  const picker = byId('device-picker');
  // What the QR code carried, shown in the form before anything else can stop the page (a browser that
  // can't pair still gets the link to copy into one that can). The address bar no longer has it.
  if (details?.link && byId('pairing-link')) byId('pairing-link').value = details.link;
  if (details?.code && byId('code')) byId('code').value = details.code;
  // What the page shows follows root.dataset.state (remote-install.css): new, connecting, approve, unreachable,
  // unsupported, error, declined or paired.
  const addDialog = byId('add-dialog');
  const dialogStatus = byId('dialog-status');
  const openAdd = () => {
    if (!addDialog || addDialog.open) return;
    if (typeof addDialog.showModal === 'function') addDialog.showModal();
    else addDialog.setAttribute('open', '');
  };
  const closeAdd = () => {
    if (!addDialog?.open) return;
    if (typeof addDialog.close === 'function') addDialog.close();
    else addDialog.removeAttribute('open');
  };
  byId('add-close')?.addEventListener('click', closeAdd);
  // A device that is paired needs no window any more.
  const setState = state => { root.dataset.state = state; if (state === 'paired') closeAdd(); };
  // The send card's own states; the Paired devices page keeps its own (and ignores these).
  const flow = state => { if (!byId('pair-form')) setState(state); };
  byId('copy-link')?.addEventListener('click', async () => {
    const field = byId('pairing-link');
    try { await navigator.clipboard.writeText(field.value); say('Link copied. Paste it into Chrome or Edge.'); }
    catch { field.select(); say('Select the link, copy it, then paste it into Chrome or Edge.'); }
  });
  const pluginId = root.dataset.pluginId;
  const compact = Boolean(pluginId && !form);
  // A plugin page opened with ?tag=<release> asks the device for that release (same rules as the device's own check).
  const wantedTag = compact ? new URLSearchParams(location.search).get('tag') || '' : '';
  const releaseTag = /^[A-Za-z0-9][A-Za-z0-9._+/-]{0,127}$/.test(wantedTag) && !wantedTag.includes('..') && !wantedTag.includes('//') && !wantedTag.endsWith('/') ? wantedTag : undefined;
  const pairNew = compact ? byId('pair-new') : null;
  let reachable = null;
  let transport, endpoint, token, requestId, idempotencyKey, requestPluginId, cancelled = false;
  let requestAction = 'install', requestName, requestNames, busy = false;
  let inventory, updates;
  let devices = [];
  let selectedFingerprint;
  try {
    const saved = JSON.parse(localStorage.getItem(PAIRED_DEVICES_KEY) || '[]');
    // Pairings unused for 30 days are dropped; the device forgets them after the same time.
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    if (Array.isArray(saved)) devices = saved.filter(device => !(device?.lastUsed < cutoff)).filter(device =>
      device && typeof device.name === 'string' && typeof device.address === 'string' &&
      /^[a-f0-9]{64}$/.test(device.fingerprint) && /^[A-Za-z0-9_-]{43}$/.test(device.token),
    ).slice(0, 16).map(device => /^[a-f0-9]{64}$/.test(device.nextFingerprint) ? device : { ...device, nextFingerprint: undefined });
    selectedFingerprint = localStorage.getItem(SELECTED_DEVICE_KEY);
  } catch { /* Pairing remains available without browser storage. */ }
  // A message that says something went wrong is an alert: announced at once, styled red, and scrolled into view
  // (on a phone it can be below the fold). Everything else stays a quiet status.
  const ERROR_STATES = ['unreachable', 'unsupported', 'declined', 'error', 'failed'];
  const say = (message, isError = false) => {
    const alert = Boolean(message) && (isError || ERROR_STATES.includes(root.dataset.state));
    const text = translate(message);
    status.textContent = text;
    if (compact) status.hidden = !text;
    status.dataset.kind = alert ? 'error' : '';
    status.setAttribute('role', alert ? 'alert' : 'status');
    status.setAttribute('aria-live', alert ? 'assertive' : 'polite');
    const inDialog = Boolean(addDialog?.open && dialogStatus);
    if (dialogStatus) {
      dialogStatus.textContent = text;
      dialogStatus.hidden = !text;
      dialogStatus.dataset.kind = alert ? 'error' : '';
      dialogStatus.setAttribute('role', alert ? 'alert' : 'status');
    }
    if (alert) (inDialog ? dialogStatus : status).scrollIntoView({ block: 'center', behavior: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const closeTransport = () => {
    const current = transport;
    transport = undefined;
    current?.close();
  };
  const disconnect = () => {
    closeTransport();
    endpoint = undefined;
    token = undefined;
    requestButton.disabled = true;
    if (cancelButton) cancelButton.disabled = true;
    if (reconnectButton) reconnectButton.hidden = true;
    if (forgetButton) forgetButton.hidden = true;
    inventory?.reset();
    inventory?.setEnabled(false);
  };
  // The details of the last failed connection, shown under the tips so they can go with a bug report.
  const diagnostics = byId('diagnostics'), diagnosticsText = byId('diagnostics-text');
  const showDiagnostics = async error => {
    if (!diagnostics || !diagnosticsText) return;
    // Read before the first await: the failed pairing disconnects, which forgets the endpoint.
    const tried = endpoint, device = activeDevice();
    let permission;
    try { permission = (await navigator.permissions.query({ name: 'local-network-access' })).state; } catch { /* not every browser has it */ }
    const connection = navigator.connection;
    diagnosticsText.textContent = connectionDiagnostics({
      when: new Date().toISOString(), page: location.origin + location.pathname, browser: navigator.userAgent,
      secure: Boolean(globalThis.isSecureContext), webTransport: typeof WebTransport !== 'undefined', online: navigator.onLine,
      network: connection ? [connection.type, connection.effectiveType].filter(Boolean).join(' ') : '',
      // From the endpoint being tried: during a first pairing there is no saved device yet.
      permission, address: tried ? new URL(tried.url).host : device?.address, error,
      pin: tried?.hashes?.[0] ? [...tried.hashes[0].value.slice(0, 4)].map(byte => byte.toString(16).padStart(2, "0")).join("") : device?.fingerprint,
    });
    diagnostics.hidden = false;
  };
  byId('copy-diagnostics')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(diagnosticsText.textContent); say('Details copied.'); }
    catch { say('Select the details, copy them, then paste them into your bug report.'); }
  });
  const send = async message => {
    if (!endpoint) throw new Error('Pair with your device first.');
    if (!transport) {
      const current = new WebTransport(endpoint.url, {
        serverCertificateHashes: endpoint.hashes,
      });
      transport = current;
      const onClose = () => { if (transport === current) transport = undefined; };
      void current.closed.then(onClose, onClose);
    }
    const current = transport;
    try {
      try {
        await timeout(current.ready, 45000);
      } catch (reason) {
        // The browser's own words (WebTransportError: "Opening handshake failed.", say) tell a blocked network from a refused certificate.
        const detail = [reason?.name, reason?.message].filter(Boolean).join(': ') || 'no details';
        void showDiagnostics(detail);
        throw Object.assign(new Error(`Could not reach your device. Check that Remote access is on and that it is on the same network as this browser. (${detail})`), { unreachable: true });
      }
      const result = await exchange(current, message);
      const used = activeDevice();
      if (used && !(Date.now() - used.lastUsed < 3600000)) { used.lastUsed = Date.now(); saveDevices(); }
      learnPins(result);
      if (diagnostics) diagnostics.hidden = true;
      return result;
    } catch (error) {
      if (transport === current) closeTransport();
      throw error;
    }
  };
  const learnPins = result => {
    const device = activeDevice();
    if (!device || !/^[a-f0-9]{64}$/.test(result.fingerprint || '')) return;
    const next = /^[a-f0-9]{64}$/.test(result.nextFingerprint || '') ? result.nextFingerprint : undefined;
    if (device.fingerprint === result.fingerprint && device.nextFingerprint === next) return;
    device.fingerprint = result.fingerprint;
    device.nextFingerprint = next;
    endpoint = { ...endpoint, hashes: pinnedHashes(device) };
    saveDevices();
    rememberDevice(device);
  };
  const showError = error => say(error instanceof Error ? error.message : 'Unable to contact the device.', true);
  if (pluginId && !/^[a-z0-9][a-z0-9-]{0,127}$/.test(pluginId)) { say('Invalid plugin identifier.'); if (pairButton) pairButton.disabled = true; return; }
  if (typeof WebTransport === 'undefined' || !globalThis.isSecureContext) {
    setState('unsupported');
    say(details?.link ? 'This browser can’t connect to your device. Copy the pairing link below and open it in Chrome or Edge.' : 'Remote install needs Chrome, Edge or another Chromium-based browser. Open this page there.');
    if (pairButton) pairButton.disabled = true;
    return;
  }
  const activeDevice = () => devices.find(device => device.token === token);
  const saveDevices = () => {
    try { localStorage.setItem(PAIRED_DEVICES_KEY, JSON.stringify(devices)); } catch { /* Keep pairings in this page. */ }
  };
  const rememberDevice = device => {
    try {
      if (device) localStorage.setItem(SELECTED_DEVICE_KEY, device.fingerprint);
      else localStorage.removeItem(SELECTED_DEVICE_KEY);
    } catch { /* Selection still works in this page. */ }
  };
  const saveRequest = () => {
    const device = activeDevice();
    if (!device) return;
    device.pending = idempotencyKey ? { key: idempotencyKey, id: requestId, pluginId: requestPluginId, name: requestName, names: requestNames, action: requestAction } : undefined;
    saveDevices();
  };
  const updateActions = () => {
    requestButton.disabled = !token || busy;
    if (!compact) requestButton.hidden = !pluginId && !idempotencyKey;
    requestButton.textContent = translate(idempotencyKey ? 'Retry request status' : compact ? 'Send to device' : 'Send install request');
    if (pairButton) pairButton.disabled = Boolean(idempotencyKey);
    inventory?.setEnabled(Boolean(token) && !busy && !idempotencyKey);
  };
  // The devices list: one card per paired device. A browser can hold several devices, and a device can be paired with
  // several browsers: each pairing is its own entry here, and each browser keeps its own list.
  const cards = byId('device-cards');
  const doc = root.ownerDocument;
  const online = new Map(); // fingerprint -> whether the device answered when this page opened
  const currentIndex = () => {
    const index = devices.indexOf(activeDevice());
    return index < 0 ? undefined : index;
  };
  const ago = time => {
    const minutes = Math.round((Date.now() - time) / 60000);
    if (!(minutes >= 0)) return '';
    if (minutes < 2) return 'just now';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
  };
  const cardButton = (label, onClick, className = '') => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = translate(label);
    if (className) button.className = className;
    button.addEventListener('click', onClick);
    return button;
  };
  const forgetDevice = device => {
    const wasActive = device === activeDevice();
    if (wasActive && idempotencyKey) return;
    devices = devices.filter(other => other !== device);
    saveDevices();
    online.delete(device.fingerprint);
    if (wasActive) {
      disconnect();
      rememberDevice(undefined);
      setState('new');
    }
    renderPicker(currentIndex());
    say(`${device.name} forgotten in this browser. Remove this browser under Paired browsers in DeckyHub on the device too.`);
  };
  const startRename = (device, actions) => {
    const input = doc.createElement('input');
    input.value = device.name;
    input.maxLength = 64;
    input.setAttribute('aria-label', translate('Device name'));
    const save = () => {
      const value = input.value.trim().slice(0, 64);
      if (value) { device.name = value; saveDevices(); }
      renderPicker(currentIndex());
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); save(); }
      if (event.key === 'Escape') renderPicker(currentIndex());
    });
    actions.replaceChildren(input, cardButton('Save', save));
    input.focus();
    input.select();
  };
  const renderCards = selected => {
    if (compact || !cards || !doc) return;
    cards.replaceChildren(...devices.map((device, index) => {
      const item = doc.createElement('li');
      item.className = 'rd-card';
      item.dataset.selected = String(index === selected);
      const open = doc.createElement('button');
      open.type = 'button';
      open.className = 'rd-card-main';
      open.setAttribute('aria-pressed', String(index === selected));
      const name = doc.createElement('strong');
      name.textContent = device.name;
      const address = doc.createElement('small');
      address.textContent = device.address;
      open.append(name, address);
      open.addEventListener('click', () => {
        if (picker.disabled) return;
        renderPicker(index);
        selectDevice(index);
      });
      const meta = doc.createElement('div');
      meta.className = 'rd-card-meta';
      const pill = doc.createElement('span');
      pill.className = 'rd-pill';
      const state = online.get(device.fingerprint);
      pill.dataset.kind = state === true ? 'online' : state === false ? 'offline' : 'checking';
      pill.textContent = translate(state === true ? 'Online' : state === false ? 'Not reachable' : 'Checking…');
      meta.append(pill);
      if (device.lastUsed) {
        const used = doc.createElement('span');
        used.textContent = translate(`Used ${ago(device.lastUsed)}`);
        meta.append(used);
      }
      const actions = doc.createElement('div');
      actions.className = 'rd-card-actions';
      actions.append(cardButton('Rename', () => startRename(device, actions)), cardButton('Forget', () => forgetDevice(device), 'rd-forget'));
      item.append(open, meta, actions);
      return item;
    }));
  };
  // Which of the paired devices answer right now: checked once when the page opens, in parallel.
  const checkOnline = () => {
    void Promise.all(devices.slice().map(async device => {
      let connection;
      try {
        connection = new WebTransport(deviceUrl(device.address), { serverCertificateHashes: pinnedHashes(device) });
        void connection.closed.catch(() => {});
        await timeout(connection.ready, 5000);
        online.set(device.fingerprint, true);
      } catch {
        online.set(device.fingerprint, false);
      } finally {
        connection?.close();
      }
    })).then(() => renderCards(currentIndex()));
  };
  const renderPicker = selected => {
    picker.replaceChildren(new Option(translate(compact ? 'Select a device' : devices.length ? 'Pair another device' : 'Pair a device'), ''));
    devices.forEach((device, index) => {
      if (!compact || reachable?.has(index)) picker.add(new Option(device.name, String(index)));
    });
    if (compact) {
      const showPicker = Boolean(reachable?.size);
      picker.hidden = requestButton.hidden = !showPicker;
      pairNew.hidden = showPicker;
    }
    picker.value = selected === undefined ? '' : String(selected);
    picker.disabled = false;
    root.dataset.hasDevices = String(devices.length > 0);
    renderCards(selected);
  };
  const selectDevice = index => {
    disconnect();
    requestId = idempotencyKey = requestPluginId = requestName = requestNames = undefined;
    const device = devices[index];
    rememberDevice(device);
    if (!device) { setState(compact ? 'none' : 'new'); updateActions(); say(compact ? '' : 'Turn on Remote access on your device, then scan its QR code or paste the pairing link.'); return; }
    try {
      setState(compact ? 'ready' : 'paired');
      endpoint = { url: deviceUrl(device.address), hashes: pinnedHashes(device) };
      token = device.token;
      ({ id: requestId, key: idempotencyKey, pluginId: requestPluginId } = device.pending || {});
      requestAction = device.pending?.action || 'install';
      requestName = typeof device.pending?.name === 'string' ? device.pending.name : undefined;
      requestNames = Array.isArray(device.pending?.names) && device.pending.names.every(name => typeof name === 'string') ? device.pending.names : undefined;
      if (form) {
        byId('address').value = device.address;
        byId('fingerprint').value = device.fingerprint;
        byId('device-name').value = device.name;
        if (reconnectButton) reconnectButton.hidden = false;
      }
      if (forgetButton) forgetButton.hidden = false;
      updateActions();
      if (!pluginId) { void inventory?.load(); void updates?.check(); }
      say(requestPluginId
        ? 'This device has a pending request. Retry its status before starting another change.'
        : compact ? '' : `${device.name} selected.`);
    } catch (error) { showError(error); }
  };
  picker.addEventListener('change', () => selectDevice(picker.value));
  byId('pair-another')?.addEventListener('click', () => {
    if (pairing) return openAdd();
    disconnect();
    renderPicker();
    setState('new');
    openAdd();
    say('Turn on Remote access on your device, then scan its QR code or paste the pairing link.');
  });
  // A paired browser hands out a one-time link: the other browser opens it, pairs by itself, and the device asks for approval.
  const shareBox = byId('share-box'), shareLink = byId('share-link'), shareStatus = byId('share-status'), shareButton = byId('share-button');
  let shareTimer;
  // Said beside the button, where the person is looking, not only in the status line further up the page.
  const shareSay = (message, isError = false) => {
    shareStatus.textContent = translate(message);
    shareStatus.hidden = !message;
    shareStatus.dataset.kind = isError ? 'error' : '';
    say(message, isError);
  };
  shareButton?.addEventListener('click', async () => {
    shareButton.disabled = true;
    shareSay('Making a link…');
    try {
      const device = activeDevice();
      if (!device) throw new Error('Pair with your device first.');
      const ticket = await send({ op: 'pair_link' });
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket.pairingToken || '') || !/^[a-f0-9]{64}$/.test(ticket.fingerprint || '')) throw new Error('Invalid pairing response.');
      const params = new URLSearchParams({ device: device.address, fingerprint: ticket.fingerprint, pair: ticket.pairingToken });
      if (/^[\w .-]{1,40}$/.test(device.name || '')) params.set('name', device.name);
      shareLink.value = `https://deckyhub.com/develop/paired-devices/#${params}`;
      shareBox.hidden = false;
      clearTimeout(shareTimer);
      shareTimer = setTimeout(() => { shareBox.hidden = true; shareLink.value = ''; }, Math.min(ticket.expiresInSeconds || 300, 300) * 1000);
      shareSay('Link ready. Open it in the other browser.');
    } catch (error) {
      // A device on an older DeckyHub answers any message it doesn't know with a plain rejection.
      shareSay(error.message === 'The device rejected the request.'
        ? 'Your device could not make a link. Update DeckyHub on it to the newest version, then try again.'
        : error.message, true);
    } finally { shareButton.disabled = false; }
  });
  byId('share-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareLink.value); say('Link copied. Paste it into Chrome or Edge.'); }
    catch { shareLink.select(); say('Select the link, copy it, then paste it into Chrome or Edge.'); }
  });
  const selectedIndex = Math.max(0, devices.findIndex(device => device.fingerprint === selectedFingerprint));
  if (!compact) {
    renderPicker(devices.length && !details ? selectedIndex : undefined);
    if (devices.length && !details) selectDevice(selectedIndex);
    if (doc && devices.length && !details) checkOnline();
  } else {
    renderPicker();
    setState(devices.length ? 'checking' : 'none');
    if (devices.length) {
      say('Checking paired devices…');
      void Promise.all(devices.map(async (device, index) => {
        let connection;
        try {
          connection = new WebTransport(deviceUrl(device.address), {
            serverCertificateHashes: pinnedHashes(device),
          });
          void connection.closed.catch(() => {});
          await timeout(connection.ready, 5000);
          return index;
        } catch {
          return null;
        } finally {
          connection?.close();
        }
      })).then(indices => {
        reachable = new Set(indices.filter(index => index !== null));
        const selected = reachable.has(selectedIndex) ? selectedIndex : reachable.values().next().value;
        renderPicker(selected);
        if (selected !== undefined) selectDevice(selected);
        else { setState('none'); say(compact ? 'No paired device is reachable. Turn on Remote access on your device, on the same network as this browser.' : 'No paired devices are reachable.'); }
      });
    }
  }
  const fillDevice = ({ address, fingerprint, name }) => {
    byId('address').value = address;
    if (name && !byId('device-name').value.trim()) byId('device-name').value = name;
    if (token) {
      say('Address filled in. Select Use new device address to reconnect to the paired device.');
    } else {
      byId('fingerprint').value = fingerprint;
      say('Device details filled in. Enter the pairing code shown on your device.');
    }
  };
  if (details && form) fillDevice(details);
  const linkInput = byId('pairing-link');
  const usePairingLink = () => {
    if (!linkInput.value.trim()) return;
    const device = detailsFromPairingLink(linkInput.value);
    if (!device) throw new Error('Paste the pairing link copied from DeckyHub on your device.');
    fillDevice(device);
    linkInput.value = '';
    return device;
  };
  let pairing = false;
  const pairDevice = async (link) => {
    if (idempotencyKey || pairing) return;
    pairing = true;
    setState('connecting');
    // The device took the code and token: both fields are emptied once the pairing is over, not before, so
    // a request that never reached the device can be tried again from them.
    let consumed = false;
    if (pairButton) pairButton.disabled = true;
    picker.disabled = true;
    disconnect();
    try {
      const pairingToken = (link || usePairingLink())?.pairingToken;
      if (link) {
        byId('address').value = link.address;
        byId('fingerprint').value = link.fingerprint;
      }
      if (!byId('address').value.trim()) throw new Error('Paste a pairing link or enter the address under connection details.');
      const url = deviceUrl(byId('address').value);
      const fingerprint = fingerprintBytes(byId('fingerprint').value);
      const pin = Array.from(fingerprint, byte => byte.toString(16).padStart(2, '0')).join('');
      const previous = devices.find(device => device.fingerprint === pin);
      if (previous?.pending) throw new Error('Select the existing pairing to check its pending request first.');
      if (!previous && devices.length >= 16) throw new Error('This tab can pair with up to 16 devices.');
      const code = byId('code').value.trim(), name = byId('name').value.trim();
      if ((!pairingToken && !/^\d{6}$/.test(code)) || !name || name.length > 64) throw new Error('Enter the six-digit pairing code and a browser name.');
      endpoint = { url, hashes: [{ algorithm: 'sha-256', value: fingerprint }] };
      say('Connecting to your device. Allow local network access if your browser asks.');
      const secret = crypto.getRandomValues(new Uint8Array(32));
      const pairingSecret = btoa(String.fromCharCode(...secret)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const credential = pairingToken ? { pairingToken } : { code };
      const result = await send({ op: 'pair', ...credential, name, pairingSecret });
      if (typeof result.pairingId !== 'string' || !result.pairingId) throw new Error('Invalid pairing response.');
      consumed = true;
      setState('approve');
      say('Approve this browser on your device: press Approve under Pairing requests.');
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        await sleep(2000);
        const approval = await send({ op: 'pair_status', pairingId: result.pairingId, pairingSecret });
        if (approval.status === 'approved' && /^[A-Za-z0-9_-]{43}$/.test(approval.token || '')) {
          token = approval.token;
          const address = new URL(url).host;
          const deviceName = byId('device-name').value.trim().slice(0, 64) || address;
          const next = /^[a-f0-9]{64}$/.test(approval.nextFingerprint || '') ? approval.nextFingerprint : undefined;
          const paired = { name: deviceName, address, fingerprint: pin, nextFingerprint: next, token, lastUsed: Date.now() };
          devices = [...devices.filter(device => device.fingerprint !== pin), paired];
          endpoint = { url, hashes: pinnedHashes(paired) };
          saveDevices();
          rememberDevice(activeDevice());
          try { sessionStorage.removeItem(PAIRING_DETAILS_KEY); } catch { /* Pairing is already complete. */ }
          renderPicker(devices.length - 1);
          if (reconnectButton) reconnectButton.hidden = false;
          setState('paired');
          say('Paired. You can now manage this device.');
          updateActions();
          if (!pluginId) void inventory?.load();
          return;
        }
        if (approval.status === 'rejected' || approval.status === 'expired') throw new Error(`Pairing ${approval.status}.`);
        if (approval.status !== 'pending') throw new Error('Invalid pairing status.');
      }
      throw new Error('Pairing timed out.');
    } catch (error) {
      disconnect();
      renderPicker();
      setState(error.unreachable ? 'unreachable' : consumed ? 'declined' : 'error');
      if (link?.pairingToken && error.message === 'The device rejected the request.')
        say('This pairing link was rejected. Generate a new QR code or pairing link on your device.');
      else showError(error);
    }
    finally {
      pairing = false; updateActions(); picker.disabled = false;
      if (consumed) { byId('code').value = ''; linkInput.value = ''; }
    }
  };
  linkInput?.addEventListener('change', () => {
    try {
      const link = usePairingLink();
      if (link?.pairingToken) void pairDevice(link);
    } catch (error) { showError(error); }
  });
  form?.addEventListener('submit', event => {
    event.preventDefault();
    void pairDevice();
  });
  forgetButton?.addEventListener('click', () => {
    const device = activeDevice();
    if (!device || idempotencyKey) return;
    devices = devices.filter(other => other !== device);
    saveDevices();
    disconnect();
    rememberDevice(undefined);
    renderPicker();
    setState('new');
    say(`${device.name} forgotten in this browser. Remove it from Paired devices in DeckyHub too.`);
  });
  reconnectButton?.addEventListener('click', () => {
    if (!endpoint || !token) return;
    try {
      const url = deviceUrl(byId('address').value);
      if (url !== endpoint.url) {
        closeTransport();
        // The next request authenticates the new address with the original pinned fingerprint.
        endpoint = { ...endpoint, url };
        const device = activeDevice();
        if (device) {
          device.address = new URL(url).host;
          saveDevices();
          if (!picker.disabled) renderPicker(devices.indexOf(device));
        }
      }
      say('Address updated. Send to device or retry the pending request to reconnect.');
      if (!pluginId) void inventory?.load();
    } catch (error) { showError(error); }
  });
  // A plugin DeckyHub cannot match to the registry has no id; it is identified by its name.
  // enable / disable pass the Decky Loader names of the plugins to switch (a whole pack at once) as an array.
  const runRequest = async (selectedPluginId = pluginId, action = 'install', pluginName) => {
    const names = Array.isArray(pluginName) ? pluginName : undefined;
    let reloadInventory = false;
    if (names) pluginName = undefined;
    const target = selectedPluginId || pluginName || (names && names.join('\n'));
    if (!endpoint || !token || busy || !target) return;
    if (idempotencyKey && (target !== requestPluginId || action !== requestAction)) return;
    busy = true;
    flow('waiting');
    requestButton.disabled = true;
    if (pairButton) pairButton.disabled = true;
    picker.disabled = true;
    cancelled = false;
    idempotencyKey ||= crypto.randomUUID();
    requestPluginId = target;
    requestName = selectedPluginId ? undefined : pluginName;
    requestNames = names;
    requestAction = action;
    saveRequest();
    inventory?.setEnabled(false);
    try {
      const result = requestId
        ? await send({ op: 'status', token, requestId })
        : await send({ op: 'request', token, idempotencyKey, action: requestAction, ...(requestNames ? { pluginNames: requestNames } : requestName ? { pluginName: requestName } : { pluginId: requestPluginId, ...(releaseTag && requestAction === 'install' ? { releaseTag } : {}) }) });
      if (typeof result.requestId !== 'string' || !result.requestId ||
          (requestId && result.requestId !== requestId) || !REQUEST_STATES.has(result.status)) throw new Error('Invalid request response.');
      requestId = result.requestId;
      saveRequest();
      let state = result.status;
      let delay = 3000;
      const deadline = Date.now() + 120000;
      while (!TERMINAL.has(state) && !cancelled && Date.now() < deadline) {
        if (cancelButton) cancelButton.disabled = state !== 'pending_confirmation';
        flow(state === 'pending_confirmation' ? 'waiting' : 'installing');
        say(state === 'pending_confirmation' ? 'Waiting for approval on your device.' : state === 'approved' ? 'Approved; waiting for your device.' : requestAction === 'uninstall' ? 'Uninstalling…' : requestAction === 'enable' ? 'Enabling…' : requestAction === 'disable' ? 'Disabling…' : 'Installing…');
        await sleep(delay);
        if (cancelled) return;
        try {
          const next = await send({ op: 'status', token, requestId });
          if (next.requestId !== requestId || !REQUEST_STATES.has(next.status)) throw new Error('Invalid request status.');
          state = next.status;
          delay = 3000;
        } catch (error) {
          if (error?.code === 'request_not_found') throw error;
          delay = Math.min(delay * 2, 15000);
          say('Connection interrupted. Retrying status…');
        }
      }
      if (cancelled) return;
      if (!TERMINAL.has(state)) throw new Error('Status unknown. Retry request status before starting another change.');
      flow(state === 'installed' || state === 'uninstalled' || state === 'enabled' || state === 'disabled' ? 'done' : 'failed');
      say(state === 'installed' ? 'Installed on your device. If Decky Loader still shows its install window, it may be downloading extra files; this can take a few minutes, then you can close the window.' : state === 'uninstalled' ? 'Uninstalled from your device.' : state === 'enabled' ? 'Enabled on your device.' : state === 'disabled' ? 'Disabled on your device.' : state === 'unknown' ? 'Outcome unknown. Check your device before trying again.' : `Request ${state}.`);
      idempotencyKey = undefined;
      requestId = undefined;
      requestPluginId = requestName = requestNames = undefined;
      saveRequest();
      // What the device has installed changed (or may have): the list is read again once the buttons are back.
      reloadInventory = ['installed', 'uninstalled', 'enabled', 'disabled', 'unknown'].includes(state);
      if (cancelButton) cancelButton.disabled = true;
    } catch (error) {
      // The device no longer has this request (it restarted, say): nothing is left to wait for or retry.
      if (error?.code === 'request_not_found') {
        idempotencyKey = undefined;
        requestId = undefined;
        requestPluginId = requestName = requestNames = undefined;
        saveRequest();
        flow('failed');
        say('Your device no longer has this request, probably because it restarted. Send it again.', true);
      } else {
        flow('failed');
        say('Status unknown. The request may still be active; retry request status before starting another change.');
      }
    } finally {
      busy = false;
      updateActions();
      renderPicker(devices.indexOf(activeDevice()));
      if (reloadInventory) void inventory?.load();
    }
  };
  // A new request from a plugin's page first shows its warnings and virus scans in a window, and is only sent once
  // the person agrees to the risks again. Asking about a request that is already sent needs no second agreement.
  const agreeToRisks = () => new Promise(resolve => {
    const dialog = byId('risk-dialog');
    if (!dialog || idempotencyKey) return resolve(true);
    let answer = false;
    const finish = () => { dialog.removeEventListener('close', finish); resolve(answer); };
    dialog.addEventListener('close', finish);
    const end = agreed => () => { answer = agreed; if (typeof dialog.close === 'function') dialog.close(); else { dialog.removeAttribute('open'); finish(); } };
    byId('risk-send').onclick = end(true);
    byId('risk-cancel').onclick = end(false);
    byId('risk-close').onclick = end(false);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  requestButton.addEventListener('click', async () => {
    if (busy || !(await agreeToRisks())) return;
    await runRequest(requestName || requestNames ? null : requestPluginId || pluginId, idempotencyKey ? requestAction : 'install', requestNames || requestName);
  });
  inventory = createPluginList(root, {
    loadPage: offset => send({ op: 'plugins', token, offset }),
    request: (id, action, name) => {
      status.scrollIntoView({ block: 'nearest' });
      return runRequest(id, action, name);
    },
  });
  // Update notices and the installed app (docs/remote-updates.js): the Paired devices page only.
  if (!compact && !pluginId) {
    updates = createUpdates(root, { summary: () => send({ op: 'summary', token }), device: () => (token ? activeDevice() : undefined) });
  }
  updateActions();
  if (!pluginId && token) { void inventory.load(); void updates?.check(); }
  cancelButton?.addEventListener('click', async () => {
    if (!endpoint || !token || !requestId) return;
    if (cancelButton) cancelButton.disabled = true;
    try {
      const result = await send({ op: 'cancel', token, requestId });
      if (result.requestId !== requestId || result.status !== 'cancelled') throw new Error('The request could not be cancelled.');
      cancelled = true; requestId = undefined; idempotencyKey = undefined; requestPluginId = requestName = requestNames = undefined;
      saveRequest();
      flow('ready');
      say('Request cancelled.');
    } catch (error) { showError(error); }
  });
  updateActions();
  if (form && details) openAdd();
  if (form && details?.pairingToken) void pairDevice(details);
  addEventListener('pagehide', disconnect, { once: true });
}
if (typeof document !== 'undefined') {
  const fromLink = pairingDetails(location.hash);
  let details = fromLink;
  try {
    if (fromLink) sessionStorage.setItem(PAIRING_DETAILS_KEY, new URLSearchParams({
      device: fromLink.address, fingerprint: fromLink.fingerprint,
    }).toString());
    else details = pairingDetails(sessionStorage.getItem(PAIRING_DETAILS_KEY) || '');
  } catch { /* Manual pairing is still available when browser storage is disabled. */ }
  if (fromLink) {
    fromLink.link = location.href;
    history.replaceState(history.state, '', location.pathname + location.search);
  }
  const root = document.querySelector('#remote-install');
  if (root) init(root, details);
  else if (fromLink) {
    const prompt = document.querySelector('#remote-device-ready');
    if (prompt) prompt.hidden = false;
  }
}
