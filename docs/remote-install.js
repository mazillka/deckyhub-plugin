// Remote requests use WebTransport with the certificate fingerprint displayed on the device.
// The user must enter the fingerprint through this trusted HTTPS page, not a network response.
export function deviceUrl(address) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/.exec(address.trim());
  if (!match) throw new Error('Enter a private IPv4 address and port, for example 192.168.1.50:8765.');
  const [a, b, c, d, port] = match.slice(1).map(Number);
  if ([a, b, c, d].some(n => n > 255) || port < 1 || port > 65535 ||
      !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) {
    throw new Error('Enter a private IPv4 address and valid port.');
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
  if (!address || !fingerprint) return null;
  try {
    deviceUrl(address);
    fingerprintBytes(fingerprint);
    return { address, fingerprint };
  } catch {
    return null;
  }
}

export function detailsFromPairingLink(value) {
  try {
    const url = new URL(value.trim());
    if (url.origin !== 'https://deckyhub.com' || url.pathname !== '/develop/plugins/' || url.username || url.password) return null;
    return pairingDetails(url.hash);
  } catch {
    return null;
  }
}

const PAIRING_DETAILS_KEY = 'deckyhub.remoteInstall.device';

function timeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The device did not respond.')), ms);
  })]).finally(() => clearTimeout(timer));
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
const REQUEST_STATES = new Set(['pending_confirmation', 'approved', 'installing', 'installed', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);
const TERMINAL = new Set(['installed', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);

function init(root, details) {
  const byId = id => root.querySelector(`#remote-${id}`);
  const form = byId('pair-form'), status = byId('status'), pairButton = byId('pair');
  const requestButton = byId('request'), cancelButton = byId('cancel');
  const reconnectButton = byId('reconnect');
  const pluginId = root.dataset.pluginId;
  let transport, endpoint, token, requestId, idempotencyKey, cancelled = false;
  const say = message => { status.textContent = message; };
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
    cancelButton.disabled = true;
    reconnectButton.hidden = true;
  };
  const send = async message => {
    if (!endpoint) throw new Error('Pair with your device first.');
    if (!transport) {
      const current = new WebTransport(endpoint.url, {
        serverCertificateHashes: [{ algorithm: 'sha-256', value: endpoint.fingerprint }],
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
        throw new Error('Could not connect. Allow local network access in your browser and check the device address and fingerprint.');
      }
      return await exchange(current, message);
    } catch (error) {
      if (transport === current) closeTransport();
      throw error;
    }
  };
  const showError = error => say(error instanceof Error ? error.message : 'Unable to contact the device.');
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(pluginId || '')) { say('Invalid plugin identifier.'); pairButton.disabled = true; return; }
  if (typeof WebTransport === 'undefined' || !globalThis.isSecureContext) { say('This browser does not support secure remote installation.'); pairButton.disabled = true; return; }
  const fillDevice = ({ address, fingerprint }) => {
    byId('address').value = address;
    if (token) {
      say('Address filled in. Select Use new device address to reconnect to the paired device.');
    } else {
      byId('fingerprint').value = fingerprint;
      say('Device details filled in. Enter the pairing code shown on your device.');
    }
  };
  if (details) fillDevice(details);
  const linkInput = byId('pairing-link');
  linkInput.addEventListener('change', () => {
    if (!linkInput.value.trim()) return;
    const device = detailsFromPairingLink(linkInput.value);
    if (!device) { say('Paste the pairing link copied from DeckyHub on your device.'); return; }
    fillDevice(device);
    linkInput.value = '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    pairButton.disabled = true;
    disconnect();
    try {
      const url = deviceUrl(byId('address').value);
      const fingerprint = fingerprintBytes(byId('fingerprint').value);
      const code = byId('code').value.trim(), name = byId('name').value.trim();
      if (!/^\d{6}$/.test(code) || !name || name.length > 64) throw new Error('Enter the six-digit pairing code and a browser name.');
      endpoint = { url, fingerprint };
      say('Connecting. Allow local network access if your browser asks.');
      const secret = crypto.getRandomValues(new Uint8Array(32));
      const pairingSecret = btoa(String.fromCharCode(...secret)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const pairing = await send({ op: 'pair', code, name, pairingSecret });
      if (typeof pairing.pairingId !== 'string' || !pairing.pairingId) throw new Error('Invalid pairing response.');
      byId('code').value = '';
      say('Approve this browser on your device.');
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        await sleep(2000);
        const result = await send({ op: 'pair_status', pairingId: pairing.pairingId, pairingSecret });
        if (result.status === 'approved' && typeof result.token === 'string' && result.token) {
          token = result.token;
          reconnectButton.hidden = false;
          say('Paired. Request installation, then approve it on your device.');
          requestButton.disabled = false;
          return;
        }
        if (result.status === 'rejected' || result.status === 'expired') throw new Error(`Pairing ${result.status}.`);
        if (result.status !== 'pending') throw new Error('Invalid pairing status.');
      }
      throw new Error('Pairing timed out.');
    } catch (error) { disconnect(); showError(error); }
    finally { pairButton.disabled = false; }
  });
  reconnectButton.addEventListener('click', () => {
    if (!endpoint || !token) return;
    try {
      const url = deviceUrl(byId('address').value);
      if (url !== endpoint.url) {
        closeTransport();
        // The next request authenticates the new address with the original pinned fingerprint.
        endpoint = { ...endpoint, url };
      }
      say('Address updated. Send to device or retry the pending request to reconnect.');
    } catch (error) { showError(error); }
  });
  requestButton.addEventListener('click', async () => {
    if (!endpoint || !token) return;
    requestButton.disabled = true;
    pairButton.disabled = true;
    cancelled = false;
    idempotencyKey ||= crypto.randomUUID();
    try {
      const result = requestId
        ? await send({ op: 'status', token, requestId })
        : await send({ op: 'request', token, idempotencyKey, pluginId });
      if (typeof result.requestId !== 'string' || !result.requestId ||
          (requestId && result.requestId !== requestId) || !REQUEST_STATES.has(result.status)) throw new Error('Invalid request response.');
      requestId = result.requestId;
      let state = result.status;
      let delay = 3000;
      const deadline = Date.now() + 120000;
      while (!TERMINAL.has(state) && !cancelled && Date.now() < deadline) {
        cancelButton.disabled = state !== 'pending_confirmation';
        say(state === 'pending_confirmation' ? 'Waiting for approval on your device.' : state === 'approved' ? 'Approved; waiting to install.' : 'Installing…');
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
      if (!TERMINAL.has(state)) throw new Error('Status unknown. The request may still be active; retry status before requesting another install.');
      say(state === 'installed' ? 'Installed on your device.' : state === 'unknown' ? 'Installation outcome unknown. Check your device before trying again.' : `Installation ${state}.`);
      idempotencyKey = undefined;
      requestId = undefined;
      cancelButton.disabled = true;
    } catch (_) {
      say('Status unknown. The request may still be active; retry status before requesting another install.');
    } finally {
      requestButton.disabled = !token;
      requestButton.textContent = idempotencyKey ? 'Retry request status' : 'Send to device';
      pairButton.disabled = !!idempotencyKey;
    }
  });
  cancelButton.addEventListener('click', async () => {
    if (!endpoint || !token || !requestId) return;
    cancelButton.disabled = true;
    try {
      const result = await send({ op: 'cancel', token, requestId });
      if (result.requestId !== requestId || result.status !== 'cancelled') throw new Error('The request could not be cancelled.');
      cancelled = true; requestId = undefined; idempotencyKey = undefined; pairButton.disabled = false; say('Request cancelled.');
    } catch (error) { showError(error); }
  });
  pairButton.disabled = false;
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
