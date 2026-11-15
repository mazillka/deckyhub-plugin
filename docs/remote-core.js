// What the Paired devices page and the plugin pages share and that needs no page: pairing links, the device's
// address and certificate pin, one request over WebTransport, the browser's name and id. remote-install.js
// re-exports all of it.
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

// What the device's list of paired browsers shows for this one, e.g. "Chrome · Android".
export function defaultBrowserName(userAgent = '') {
  const text = String(userAgent);
  const browser = /\bEdg(?:e|A|iOS)?\//.test(text) ? 'Edge' : /\bOPR\//.test(text) ? 'Opera' : /\bSamsungBrowser\//.test(text) ? 'Samsung Internet'
    : /\bFirefox\//.test(text) ? 'Firefox' : /\b(?:Chrome|CriOS)\//.test(text) ? 'Chrome' : /\bSafari\//.test(text) ? 'Safari' : 'Browser';
  const system = /Android/.test(text) ? 'Android' : /\b(?:iPhone|iPad|iPod)\b/.test(text) ? 'iOS' : /Windows/.test(text) ? 'Windows'
    : /\bCrOS\b/.test(text) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(text) ? 'macOS' : /Linux|X11/.test(text) ? 'Linux' : '';
  return system ? `${browser} · ${system}` : browser;
}

export const toBase64Url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const BROWSER_IDS_KEY = 'deckyhub.remoteInstall.browserIds';

// A random id this browser keeps for each device it pairs with, and sends only to that device: pairing again from the
// same browser replaces its old entry on the device instead of adding another. Different devices get different ids.
export function browserIdFor(pin, storage = globalThis.localStorage, random = () => crypto.getRandomValues(new Uint8Array(32))) {
  let ids = {};
  try { ids = JSON.parse(storage.getItem(BROWSER_IDS_KEY)) || {}; } catch { /* none saved yet */ }
  if (!/^[A-Za-z0-9_-]{43}$/.test(ids[pin] || '')) {
    ids = { ...ids, [pin]: toBase64Url(random()) };
    try { storage.setItem(BROWSER_IDS_KEY, JSON.stringify(ids)); } catch { /* pairing still works; it just cannot replace an older entry */ }
  }
  return ids[pin];
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

export const PAIRING_DETAILS_KEY = 'deckyhub.remoteInstall.device';
export const PAIRED_DEVICES_KEY = 'deckyhub.remoteInstall.pairedDevices';
export const SELECTED_DEVICE_KEY = 'deckyhub.remoteInstall.selectedDevice';

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

export function timeout(promise, ms) {
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

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const REQUEST_STATES = new Set(['pending_confirmation', 'approved', 'installing', 'installed', 'uninstalled', 'enabled', 'disabled', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);
export const TERMINAL = new Set(['installed', 'uninstalled', 'enabled', 'disabled', 'rejected', 'expired', 'cancelled', 'failed', 'unknown']);
