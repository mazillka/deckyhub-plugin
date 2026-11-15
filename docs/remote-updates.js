// Paired devices as an installed app: registers the service worker, offers to add the page to the home screen or
// desktop, and tells the user when the selected device has plugin updates waiting (a line on the page).
// The device reports its updates over the same pinned connection as everything else (op "summary").
import { translate } from './remote-i18n.js';

const EVERY = 5 * 60 * 1000;

// Only a well-formed answer from the device is shown.
export function validSummary(summary) {
  return Boolean(summary) && Array.isArray(summary.updates) && summary.updates.length <= 50 &&
    summary.updates.every(item => item && typeof item.name === 'string' && typeof item.version === 'string') &&
    (summary.checkedAt === null || Number.isFinite(summary.checkedAt));
}

export function updateLine(summary, name) {
  if (summary.checkedAt === null) return `${name} has not checked for updates yet. Open DeckyHub on it.`;
  const count = summary.updates.length;
  if (!count) return `${name} is up to date.`;
  const shown = summary.updates.slice(0, 3).map(item => `${item.name} ${item.version}`).join(', ');
  return `${name} has ${count} plugin ${count === 1 ? 'update' : 'updates'} waiting: ${shown}${count > 3 ? ` and ${count - 3} more` : ''}.`;
}

export function createUpdates(root, { summary, device, onResult = () => {} }) {
  const doc = root.ownerDocument;
  const anchor = root.querySelector('.remote-inventory');
  if (!doc || typeof anchor?.before !== 'function' || !globalThis.navigator) return { check() {} };
  const section = doc.createElement('section');
  section.className = 'rd-updates';
  section.hidden = true;
  const line = doc.createElement('p');
  line.setAttribute('role', 'status');
  section.append(line);
  anchor.before(section);
  // The button is in the page's header (devtools/plugin_pages.py), where a visitor looks first; it shows only
  // while the browser offers to install the page.
  const app = root.querySelector('#remote-app');
  const installButton = root.querySelector('#remote-app-install');

  if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
  let deferredInstall;
  let last;
  const paint = () => {
    const current = device();
    section.hidden = !current;
    line.hidden = !current || !last;
    if (current && last) line.textContent = translate(updateLine(last, current.name));
    if (app) app.hidden = !deferredInstall;
  };
  let checking = false;
  const check = async () => {
    const current = device();
    if (!current || checking) return paint();
    checking = true;
    try {
      const result = await summary();
      if (!validSummary(result)) throw new Error('Invalid summary from the device.');
      last = result;
      onResult(result);
      paint();
    } catch {
      last = undefined; // an old device without update notices, or out of reach: say nothing
      onResult(undefined);
      paint();
    } finally { checking = false; }
  };
  installButton.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice.catch(() => null);
    deferredInstall = undefined;
    paint();
  });
  addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; paint(); });
  addEventListener('appinstalled', () => { deferredInstall = undefined; paint(); });
  setInterval(() => void check(), EVERY);
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') void check(); });
  paint();
  return { check };
}
