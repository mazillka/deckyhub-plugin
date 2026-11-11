import { createPluginList } from './remote-plugins.js';

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
  if (!address || !fingerprint) return null;
  if (pairingToken !== null && !/^[A-Za-z0-9_-]{43}$/.test(pairingToken)) return null;
  try {
    deviceUrl(address);
    fingerprintBytes(fingerprint);
    return pairingToken ? { address, fingerprint, pairingToken } : { address, fingerprint };
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
    if (!result || typeof result !== 'object' || result.ok !== true) throw new Error('The device rejected the request.');
    return result;
  } finally {
    try { await reader.cancel(); } catch (_) { /* stream already closed */ }
    writer.releaseLock();
    reader.releaseLock();
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const REQUEST_STATES = new Set(['pending_confirmation', 'approved', 'installing', 'installed', 'uninstalled', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);
const TERMINAL = new Set(['installed', 'uninstalled', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);

export function init(root, details) {
  const byId = id => root.querySelector(`#remote-${id}`);
  const form = byId('pair-form'), status = byId('status'), pairButton = byId('pair');
  const requestButton = byId('request'), cancelButton = byId('cancel');
  const reconnectButton = byId('reconnect');
  const forgetButton = byId('forget');
  const picker = byId('device-picker');
  const pluginId = root.dataset.pluginId;
  const compact = Boolean(pluginId && !form);
  const pairNew = compact ? byId('pair-new') : null;
  let reachable = null;
  let transport, endpoint, token, requestId, idempotencyKey, requestPluginId, cancelled = false;
  let requestAction = 'install', busy = false;
  let inventory;
  let devices = [];
  let selectedFingerprint;
  try {
    const saved = JSON.parse(localStorage.getItem(PAIRED_DEVICES_KEY) || '[]');
    if (Array.isArray(saved)) devices = saved.filter(device =>
      device && typeof device.name === 'string' && typeof device.address === 'string' &&
      /^[a-f0-9]{64}$/.test(device.fingerprint) && /^[A-Za-z0-9_-]{43}$/.test(device.token),
    ).slice(0, 16).map(device => /^[a-f0-9]{64}$/.test(device.nextFingerprint) ? device : { ...device, nextFingerprint: undefined });
    selectedFingerprint = localStorage.getItem(SELECTED_DEVICE_KEY);
  } catch { /* Pairing remains available without browser storage. */ }
  const say = message => { status.textContent = message; if (compact) status.hidden = !message; };
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
      } catch {
        throw new Error('Could not connect. Allow local network access in your browser, make sure Pair mode is on, and check the device address; it can change when your router hands out a new one. Open DeckyHub on your device and pair again if it did.');
      }
      const result = await exchange(current, message);
      learnPins(result);
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
  const showError = error => say(error instanceof Error ? error.message : 'Unable to contact the device.');
  if (pluginId && !/^[a-z0-9][a-z0-9-]{0,127}$/.test(pluginId)) { say('Invalid plugin identifier.'); if (pairButton) pairButton.disabled = true; return; }
  if (typeof WebTransport === 'undefined' || !globalThis.isSecureContext) { say('Remote install needs Chrome, Edge or another Chromium-based browser. Open this page there.'); if (pairButton) pairButton.disabled = true; return; }
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
    device.pending = idempotencyKey ? { key: idempotencyKey, id: requestId, pluginId: requestPluginId, action: requestAction } : undefined;
    saveDevices();
  };
  const updateActions = () => {
    requestButton.disabled = !token || busy;
    if (!compact) requestButton.hidden = !pluginId && !idempotencyKey;
    requestButton.textContent = idempotencyKey ? 'Retry request status' : compact ? 'Send' : 'Send install request';
    if (pairButton) pairButton.disabled = Boolean(idempotencyKey);
    inventory?.setEnabled(Boolean(token) && !busy && !idempotencyKey);
  };
  const renderPicker = selected => {
    picker.replaceChildren(new Option(compact ? 'Select a device' : devices.length ? 'Pair another device' : 'Pair a device', ''));
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
  };
  const selectDevice = index => {
    disconnect();
    requestId = idempotencyKey = requestPluginId = undefined;
    const device = devices[index];
    rememberDevice(device);
    if (!device) { updateActions(); say('Enter the details for the device you want to pair.'); return; }
    try {
      endpoint = { url: deviceUrl(device.address), hashes: pinnedHashes(device) };
      token = device.token;
      ({ id: requestId, key: idempotencyKey, pluginId: requestPluginId } = device.pending || {});
      requestAction = device.pending?.action || 'install';
      if (form) {
        byId('address').value = device.address;
        byId('fingerprint').value = device.fingerprint;
        byId('device-name').value = device.name;
        if (reconnectButton) reconnectButton.hidden = false;
      }
      if (forgetButton) forgetButton.hidden = false;
      updateActions();
      if (!pluginId) void inventory?.load();
      say(requestPluginId
        ? 'This device has a pending request. Retry its status before starting another change.'
        : compact ? '' : `${device.name} selected.`);
    } catch (error) { showError(error); }
  };
  picker.addEventListener('change', () => selectDevice(picker.value));
  const selectedIndex = Math.max(0, devices.findIndex(device => device.fingerprint === selectedFingerprint));
  if (!compact) {
    renderPicker(devices.length && !details ? selectedIndex : undefined);
    if (devices.length && !details) selectDevice(selectedIndex);
  } else {
    renderPicker();
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
        else say('No paired devices are reachable.');
      });
    }
  }
  const fillDevice = ({ address, fingerprint }) => {
    byId('address').value = address;
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
      say('Connecting. Allow local network access if your browser asks.');
      const secret = crypto.getRandomValues(new Uint8Array(32));
      const pairingSecret = btoa(String.fromCharCode(...secret)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const credential = pairingToken ? { pairingToken } : { code };
      const result = await send({ op: 'pair', ...credential, name, pairingSecret });
      if (typeof result.pairingId !== 'string' || !result.pairingId) throw new Error('Invalid pairing response.');
      byId('code').value = '';
      say('Approve this browser on your device.');
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        await sleep(2000);
        const approval = await send({ op: 'pair_status', pairingId: result.pairingId, pairingSecret });
        if (approval.status === 'approved' && /^[A-Za-z0-9_-]{43}$/.test(approval.token || '')) {
          token = approval.token;
          const address = new URL(url).host;
          const deviceName = byId('device-name').value.trim().slice(0, 64) || address;
          const next = /^[a-f0-9]{64}$/.test(approval.nextFingerprint || '') ? approval.nextFingerprint : undefined;
          const paired = { name: deviceName, address, fingerprint: pin, nextFingerprint: next, token };
          devices = [...devices.filter(device => device.fingerprint !== pin), paired];
          endpoint = { url, hashes: pinnedHashes(paired) };
          saveDevices();
          rememberDevice(activeDevice());
          try { sessionStorage.removeItem(PAIRING_DETAILS_KEY); } catch { /* Pairing is already complete. */ }
          renderPicker(devices.length - 1);
          if (reconnectButton) reconnectButton.hidden = false;
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
      if (link?.pairingToken && error.message === 'The device rejected the request.')
        say('This pairing link was rejected. Generate a new QR code or pairing link on your device.');
      else showError(error);
    }
    finally { pairing = false; updateActions(); picker.disabled = false; }
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
  const runRequest = async (selectedPluginId = pluginId, action = 'install') => {
    if (!endpoint || !token || busy || !selectedPluginId) return;
    if (idempotencyKey && (selectedPluginId !== requestPluginId || action !== requestAction)) return;
    busy = true;
    requestButton.disabled = true;
    if (pairButton) pairButton.disabled = true;
    picker.disabled = true;
    cancelled = false;
    idempotencyKey ||= crypto.randomUUID();
    requestPluginId = selectedPluginId;
    requestAction = action;
    saveRequest();
    inventory?.setEnabled(false);
    try {
      const result = requestId
        ? await send({ op: 'status', token, requestId })
        : await send({ op: 'request', token, idempotencyKey, pluginId: requestPluginId, action: requestAction });
      if (typeof result.requestId !== 'string' || !result.requestId ||
          (requestId && result.requestId !== requestId) || !REQUEST_STATES.has(result.status)) throw new Error('Invalid request response.');
      requestId = result.requestId;
      saveRequest();
      let state = result.status;
      let delay = 3000;
      const deadline = Date.now() + 120000;
      while (!TERMINAL.has(state) && !cancelled && Date.now() < deadline) {
        if (cancelButton) cancelButton.disabled = state !== 'pending_confirmation';
        say(state === 'pending_confirmation' ? 'Waiting for approval on your device.' : state === 'approved' ? 'Approved; waiting for your device.' : requestAction === 'uninstall' ? 'Uninstalling…' : 'Installing…');
        await sleep(delay);
        if (cancelled) return;
        try {
          const next = await send({ op: 'status', token, requestId });
          if (next.requestId !== requestId || !REQUEST_STATES.has(next.status)) throw new Error('Invalid request status.');
          state = next.status;
          delay = 3000;
        } catch (_) {
          delay = Math.min(delay * 2, 15000);
          say('Connection interrupted. Retrying status…');
        }
      }
      if (cancelled) return;
      if (!TERMINAL.has(state)) throw new Error('Status unknown. Retry request status before starting another change.');
      say(state === 'installed' ? 'Installed on your device.' : state === 'uninstalled' ? 'Uninstalled from your device.' : state === 'unknown' ? 'Outcome unknown. Check your device before trying again.' : `Request ${state}.`);
      idempotencyKey = undefined;
      requestId = undefined;
      requestPluginId = undefined;
      saveRequest();
      if (state === 'installed' || state === 'uninstalled' || state === 'unknown') inventory?.reset();
      if (cancelButton) cancelButton.disabled = true;
    } catch (_) {
      say('Status unknown. The request may still be active; retry request status before starting another change.');
    } finally {
      busy = false;
      updateActions();
      renderPicker(devices.indexOf(activeDevice()));
    }
  };
  requestButton.addEventListener('click', () => runRequest(requestPluginId || pluginId, idempotencyKey ? requestAction : 'install'));
  inventory = createPluginList(root, {
    loadPage: offset => send({ op: 'plugins', token, offset }),
    request: (id, action) => {
      status.scrollIntoView({ block: 'nearest' });
      return runRequest(id, action);
    },
  });
  updateActions();
  if (!pluginId && token) void inventory.load();
  cancelButton?.addEventListener('click', async () => {
    if (!endpoint || !token || !requestId) return;
    if (cancelButton) cancelButton.disabled = true;
    try {
      const result = await send({ op: 'cancel', token, requestId });
      if (result.requestId !== requestId || result.status !== 'cancelled') throw new Error('The request could not be cancelled.');
      cancelled = true; requestId = undefined; idempotencyKey = undefined; requestPluginId = undefined;
      saveRequest();
      say('Request cancelled.');
    } catch (error) { showError(error); }
  });
  updateActions();
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
  if (fromLink) history.replaceState(history.state, '', location.pathname + location.search);
  const root = document.querySelector('#remote-install');
  if (root) init(root, details);
  else if (fromLink) {
    const prompt = document.querySelector('#remote-device-ready');
    if (prompt) prompt.hidden = false;
  }
}
