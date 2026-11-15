import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { toBase64Url } from '../docs/remote-core.js';

// The site's remote-install scripts are plain browser modules that no test runs, so a name that moved to another module
// without an import (toBase64Url once did, and pairing from the website broke) only shows when a person pairs. The
// TypeScript compiler finds such names without running anything.
test('every name the remote install modules use is defined or imported', () => {
  const modules = ['install', 'core', 'scan', 'share', 'plugins', 'updates', 'i18n'].map((name) => `docs/remote-${name}.js`);
  let output = '';
  try {
    execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--allowJs', '--checkJs', '--noEmit', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--lib', 'es2022,dom,dom.iterable', '--skipLibCheck', '--types', '', ...modules], { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    output = String(error.stdout);
  }
  const missing = output.split(/\r?\n/).filter((line) => /TS2304|TS2552|TS2551|TS2305|TS2724/.test(line));
  assert.deepEqual(missing, []);
});

test('toBase64Url writes bytes the way the pairing secret is sent', () => {
  assert.equal(toBase64Url(new Uint8Array([251, 255, 254])), '-__-');
  assert.equal(toBase64Url(new Uint8Array([1, 2])), 'AQI');
});
