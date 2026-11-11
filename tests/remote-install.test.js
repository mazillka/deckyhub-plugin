import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detailsFromPairingLink, deviceUrl, exchange, fingerprintBytes, init, pairingDetails } from '../docs/remote-install.js';

test('pairing links accept only a private device address and a complete fingerprint', () => {
  const fingerprint = 'ab'.repeat(32);
  const fragment = (device, hash = fingerprint) => `#${new URLSearchParams({ device, fingerprint: hash })}`;
  assert.deepEqual(pairingDetails(fragment('192.168.1.20:8765')), { address: '192.168.1.20:8765', fingerprint });
  assert.equal(pairingDetails(fragment('example.com:8765')), null);
  assert.equal(pairingDetails(fragment('192.168.1.20:8765', 'short')), null);
  assert.equal(pairingDetails('#remote-install'), null);
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
      value: '', handlers: {}, replaceChildren() {}, add() {},
      addEventListener(event, handler) { this.handlers[event] = handler; },
    });
    return elements.get(id);
  };
  init({ querySelector, dataset: { pluginId: 'example-plugin' } });
  const picker = querySelector('#remote-device-picker');
  picker.value = '1';
  picker.handlers.change();
  assert.equal(connections.length, 0);
  await querySelector('#remote-request').handlers.click();
  assert.deepEqual(connections, [{ url: 'https://192.168.1.21:8765/remote-install', pin: [new Uint8Array(32).fill(0xbb), new Uint8Array(32).fill(0xcc)] }]);
  assert.deepEqual(JSON.parse(sent[0]).token, devices[1].token);
  assert.equal(JSON.parse(sent[0]).pluginId, 'example-plugin');
  assert.equal(querySelector('#remote-status').textContent, 'Installed on your device.');
});

test('sends one JSON request and accepts a successful response', async () => {
  const sent = [];
  const result = await exchange(transportReturning('{"ok":true,"status":"pending"}', sent), { op: 'pair_status', pairingId: 'abc' });
  assert.equal(result.status, 'pending');
  assert.deepEqual(JSON.parse(sent.join('')), { op: 'pair_status', pairingId: 'abc' });
});

test('rejects malformed, rejected and oversized device responses', async () => {
  for (const body of ['oops', '{"ok":false}', 'x'.repeat(16385)]) {
    await assert.rejects(exchange(transportReturning(body, []), { op: 'status' }));
  }
});
