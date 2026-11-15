import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toBase64Url } from '../docs/remote-core.js';

// A name that moved to another module without an import (toBase64Url once did, and pairing from the website broke)
// is now found by `pnpm run typecheck`, which type-checks docs/remote-*.js with tsconfig.docs.json.
test('toBase64Url writes bytes the way the pairing secret is sent', () => {
  assert.equal(toBase64Url(new Uint8Array([251, 255, 254])), '-__-');
  assert.equal(toBase64Url(new Uint8Array([1, 2])), 'AQI');
});
