import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deviceUrl, exchange, fingerprintBytes } from '../docs/remote-install.js';

test('accepts only private IPv4 literals and valid ports', () => {
  assert.equal(deviceUrl('192.168.1.20:8765'), 'https://192.168.1.20:8765/remote-install');
  assert.equal(deviceUrl('172.31.0.1:1'), 'https://172.31.0.1:1/remote-install');
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
