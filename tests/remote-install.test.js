import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserIdFor, connectionDiagnostics, defaultBrowserName, detailsFromPairingLink, deviceUrl, exchange, fingerprintBytes, init, pairingDetails } from '../docs/remote-install.js';

test('pairing links accept only a private device address and a complete fingerprint', () => {
  const fingerprint = 'ab'.repeat(32);
  const fragment = (device, hash = fingerprint) => `#${new URLSearchParams({ device, fingerprint: hash })}`;
  assert.deepEqual(pairingDetails(fragment('192.168.1.20:8765')), { address: '192.168.1.20:8765', fingerprint });
  assert.equal(pairingDetails(fragment('example.com:8765')), null);
  assert.equal(pairingDetails(fragment('192.168.1.20:8765', 'short')), null);
  assert.equal(pairingDetails('#remote-install'), null);
  assert.equal(pairingDetails(fragment('192.168.1.20:8765') + '&name=Steam%20Deck').name, 'Steam Deck');
  assert.equal('name' in pairingDetails(fragment('192.168.1.20:8765') + '&name=%3Cb%3E'), false);
  // The QR link's six-digit code is kept only when it is six digits.
  assert.equal(pairingDetails(fragment('192.168.1.20:8765') + '&code=123456').code, '123456');
  assert.equal('code' in pairingDetails(fragment('192.168.1.20:8765') + '&code=12345a'), false);
});

test('the browser is named by what it is, and an unknown one stays "Browser"', () => {
  const ua = {
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
    safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  };
  assert.equal(defaultBrowserName(ua.chromeAndroid), 'Chrome · Android');
  assert.equal(defaultBrowserName(ua.chromeWindows), 'Chrome · Windows');
  assert.equal(defaultBrowserName(ua.edgeWindows), 'Edge · Windows');
  assert.equal(defaultBrowserName(ua.firefoxLinux), 'Firefox · Linux');
  assert.equal(defaultBrowserName(ua.safariIos), 'Safari · iOS');
  assert.equal(defaultBrowserName(ua.samsung), 'Samsung Internet · Android');
  assert.equal(defaultBrowserName(''), 'Browser');
  assert.equal(defaultBrowserName(undefined), 'Browser');
});

test('a browser keeps one random id per device, different between devices, and works without storage', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  let counter = 0;
  const random = () => new Uint8Array(32).fill(++counter);
  const first = browserIdFor('aa'.repeat(32), storage, random);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(browserIdFor('aa'.repeat(32), storage, random), first, 'the same device gets the same id again');
  assert.notEqual(browserIdFor('bb'.repeat(32), storage, random), first, 'another device gets another id');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.match(browserIdFor('aa'.repeat(32), broken, random), /^[A-Za-z0-9_-]{43}$/);
});

test('pasted DeckyHub links fill device details without navigating away from the selected plugin', () => {
  const address = '192.168.1.20:8765', fingerprint = 'ab'.repeat(32);
  const path = `/develop/plugins/#${new URLSearchParams({ device: address, fingerprint })}`;
  assert.deepEqual(detailsFromPairingLink(`https://deckyhub.com${path}`), { address, fingerprint });
  assert.deepEqual(detailsFromPairingLink(`https://deckyhub.com${path.replace('/plugins/', '/paired-devices.html')}`), { address, fingerprint });
  assert.equal(detailsFromPairingLink(`https://example.com${path}`), null);
  const pairingToken = 'a'.repeat(43);
  const newLink = `https://deckyhub.com${path.replace('/plugins/', '/remote-install/')}&pair=${pairingToken}`;
  assert.deepEqual(detailsFromPairingLink(newLink), { address, fingerprint, pairingToken });
  assert.equal(detailsFromPairingLink(newLink.replace(pairingToken, 'short')), null);
});

test('accepts only private IPv4 literals on the DeckyHub port', () => {
  assert.equal(deviceUrl('192.168.1.20:8765'), 'https://192.168.1.20:8765/remote-install');
  assert.equal(deviceUrl('172.31.0.1:8765'), 'https://172.31.0.1:8765/remote-install');
  assert.throws(() => deviceUrl('172.31.0.1:1'));
  for (const address of ['example.com:8765', '8.8.8.8:8765', '172.32.1.1:8765', '192.168.1.999:2', '10.1.1.1:0', '10.1.1.1:99999', 'https://10.1.1.1:8765']) {
    assert.throws(() => deviceUrl(address));
  }
});

test('decodes and validates only a full SHA-256 fingerprint', () => {
  assert.deepEqual(fingerprintBytes('AB:'.repeat(31) + 'AB'), new Uint8Array(32).fill(0xab));
  for (const hash of ['', 'ab'.repeat(31), 'zz'.repeat(32), 'aa'.repeat(33)]) assert.throws(() => fingerprintBytes(hash));
});

function transportReturning(response, sent) {
  const data = new TextEncoder().encode(response);
  return { createBidirectionalStream: async () => ({
    writable: new WritableStream({ write(chunk) { sent.push(new TextDecoder().decode(chunk)); } }),
    readable: new ReadableStream({ start(controller) { controller.enqueue(data); controller.close(); } }),
  }) };
}

test('the device picker sends only to the selected device with its own pin and token', async (t) => {
  const devices = [
    { name: 'First', address: '192.168.1.20:8765', fingerprint: 'aa'.repeat(32), token: 'a'.repeat(43) },
    { name: 'Second', address: '192.168.1.21:8765', fingerprint: 'bb'.repeat(32), nextFingerprint: 'cc'.repeat(32), token: 'b'.repeat(43) },
  ];
  const sent = [], connections = [];
  const globals = {
    isSecureContext: true,
    localStorage: { getItem: key => key.endsWith('pairedDevices') ? JSON.stringify(devices) : null, setItem() {}, removeItem() {} },
    Option: class { constructor(text, value) { Object.assign(this, { text, value }); } },
    addEventListener() {},
    WebTransport: class {
      ready = Promise.resolve();
      closed = new Promise(() => {});
      constructor(url, options) { connections.push({ url, pin: options.serverCertificateHashes.map(hash => hash.value) }); }
      createBidirectionalStream = transportReturning('{"ok":true,"requestId":"example","status":"installed"}', sent).createBidirectionalStream;
      close() {}
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const elements = new Map();
  const querySelector = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', handlers: {}, dataset: {}, replaceChildren() {}, add() {}, setAttribute(name, value) { this[name] = value; }, scrollIntoView() { this.scrolled = true; },
      addEventListener(event, handler) { this.handlers[event] = handler; }, removeEventListener() {},
    });
    return elements.get(id);
  };
  // The window with the plugin's warnings: open() and close() as a <dialog> does them.
  const risks = querySelector('#remote-risk-dialog');
  risks.showModal = () => { risks.open = true; };
  risks.close = () => { risks.open = false; risks.handlers.close(); };
  init({ querySelector, dataset: { pluginId: 'example-plugin' } });
  const picker = querySelector('#remote-device-picker');
  picker.value = '1';
  picker.handlers.change();
  assert.equal(connections.length, 0);
  // Send opens the warnings first; Cancel sends nothing, and only agreeing to the risks sends the request.
  const declined = querySelector('#remote-request').handlers.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(risks.open, true);
  assert.equal(connections.length, 0);
  querySelector('#remote-risk-cancel').onclick();
  await declined;
  assert.equal(connections.length, 0);
  assert.equal(sent.length, 0);
  const agreed = querySelector('#remote-request').handlers.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(connections.length, 0);
  querySelector('#remote-risk-send').onclick();
  await agreed;
  assert.deepEqual(connections, [{ url: 'https://192.168.1.21:8765/remote-install', pin: [new Uint8Array(32).fill(0xbb), new Uint8Array(32).fill(0xcc)] }]);
  assert.deepEqual(JSON.parse(sent[0]).token, devices[1].token);
  assert.equal(JSON.parse(sent[0]).pluginId, 'example-plugin');
  assert.match(querySelector('#remote-status').textContent, /^Installed on your device\./);
});

test('the Paired devices page lists one card per paired device and forgets one', async (t) => {
  const devices = [
    // A request left over from before (the device restarted since): it must not stop the device from being forgotten.
    { name: 'Living room Deck', address: '192.168.1.20:8765', fingerprint: 'aa'.repeat(32), token: 'a'.repeat(43), lastUsed: Date.now(), pending: { id: 'req', key: 'key', pluginId: 'example', action: 'install' } },
    { name: 'Steam Deck OLED', address: '192.168.1.21:8765', fingerprint: 'bb'.repeat(32), token: 'b'.repeat(43), lastUsed: Date.now() },
  ];
  let saved = JSON.stringify(devices);
  const globals = {
    isSecureContext: true,
    localStorage: { getItem: key => key.endsWith('pairedDevices') ? saved : null, setItem: (key, value) => { if (key.endsWith('pairedDevices')) saved = value; }, removeItem() {} },
    Option: class { constructor(text, value) { Object.assign(this, { text, value }); } },
    addEventListener() {},
    WebTransport: class { ready = Promise.resolve(); closed = new Promise(() => {}); close() {} },
  };
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]);
  }
  const node = () => ({
    children: [], dataset: {}, handlers: {}, value: '', className: '', textContent: '', hidden: false,
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; }, add() {},
    setAttribute() {}, scrollIntoView() {}, focus() {}, select() {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
  });
  const document = { createElement: node };
  const elements = new Map();
  const querySelector = id => (elements.has(id) ? elements.get(id) : elements.set(id, node()).get(id));
  const root = { querySelector, ownerDocument: document, dataset: {} };
  init(root);
  const cards = querySelector('#remote-device-cards');
  const names = () => cards.children.map(card => card.children[0].children[0].textContent);
  assert.deepEqual(names(), ['Living room Deck', 'Steam Deck OLED']);
  assert.equal(cards.children[0].dataset.selected, 'true');
  assert.equal(cards.children[1].dataset.selected, 'false');
  // Forget the second device from its card: it leaves the list and the saved pairings, the first stays selected.
  cards.children[1].children[2].children[1].handlers.click();
  assert.deepEqual(names(), ['Living room Deck']);
  assert.deepEqual(JSON.parse(saved).map(device => device.name), ['Living room Deck']);
  assert.equal(cards.children[0].dataset.selected, 'true');
  // The selected device, with its leftover request, can be forgotten too.
  cards.children[0].children[2].children[1].handlers.click();
  assert.deepEqual(names(), []);
  assert.deepEqual(JSON.parse(saved), []);
});

test('sends one JSON request and accepts a successful response', async () => {
  const sent = [];
  const result = await exchange(transportReturning('{"ok":true,"status":"pending"}', sent), { op: 'pair_status', pairingId: 'abc' });
  assert.equal(result.status, 'pending');
  assert.deepEqual(JSON.parse(sent.join('')), { op: 'pair_status', pairingId: 'abc' });
});

test('a device that has forgotten a request says so, and any other rejection stays plain', async () => {
  await assert.rejects(
    exchange(transportReturning('{"ok":false,"error":"Request rejected","code":"request_not_found"}', []), { op: 'status' }),
    error => error.code === 'request_not_found',
  );
  await assert.rejects(
    exchange(transportReturning('{"ok":false,"error":"Request rejected","code":"anything else"}', []), { op: 'status' }),
    error => error.code === undefined,
  );
});

test('rejects malformed, rejected and oversized device responses', async () => {
  for (const body of ['oops', '{"ok":false}', 'x'.repeat(16385)]) {
    await assert.rejects(exchange(transportReturning(body, []), { op: 'status' }));
  }
});

test('the connection details name the browser, the network and the error, but never a token, code or whole pin', () => {
  const pin = 'ab'.repeat(32);
  const text = connectionDiagnostics({
    when: '2026-11-13T12:00:00Z', page: 'https://deckyhub.com/remote-install/', browser: 'Chrome/130 Android', secure: true,
    webTransport: true, online: true, network: 'wifi 4g', permission: 'granted', address: '192.168.1.213:8765', pin,
    error: 'WebTransportError: Opening handshake failed.',
  });
  for (const part of ['Chrome/130 Android', 'WebTransport: yes, secure page: yes, online: yes', 'wifi 4g', 'granted', '192.168.1.213:8765', 'abababab', 'Opening handshake failed.']) assert.ok(text.includes(part), part);
  assert.ok(!text.includes(pin), 'the whole pin is not part of a bug report');
  const empty = connectionDiagnostics({ when: 'now', page: '/', browser: '?', secure: false, webTransport: false, online: false });
  assert.match(empty, /Network the browser reports: unknown/);
  assert.match(empty, /Local network permission: unknown/);
  assert.match(empty, /Device address: none/);
});
