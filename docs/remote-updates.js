// Paired devices as an installed app: registers the service worker, offers "Install app", and tells the user when
// the selected device has plugin updates waiting (a line on the page and, once allowed, a notification).
// The device reports its updates over the same pinned connection as everything else (op "summary").
const NOTIFY_KEY = 'deckyhub.remoteInstall.notify';
const NOTIFIED_KEY = 'deckyhub.remoteInstall.notified';
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

// What was last announced for a device, so the same set of updates is announced once.
export const updateSignature = summary => summary.updates.map(item => `${item.name}@${item.version}`).sort().join('|');

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* the choice just isn't kept */ } };

export function createUpdates(root, { summary, device }) {
  const doc = root.ownerDocument;
  const anchor = root.querySelector('.remote-inventory');
  if (!doc || typeof anchor?.before !== 'function' || !globalThis.navigator) return { check() {} };
  const section = doc.createElement('section');
  section.className = 'rd-updates';
  section.hidden = true;
  const line = doc.createElement('p');
  line.setAttribute('role', 'status');
  const actions = doc.createElement('p');
  actions.className = 'remote-actions';
  const notifyButton = doc.createElement('button');
  notifyButton.type = 'button';
  const installButton = doc.createElement('button');
  installButton.type = 'button';
  installButton.textContent = 'Install app';
  installButton.hidden = true;
  actions.append(notifyButton, installButton);
  const hint = doc.createElement('p');
  hint.className = 'rd-hint';
  section.append(line, actions, hint);
  anchor.before(section);

  const registration = 'serviceWorker' in navigator && isSecureContext
    ? navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).catch(() => null)
    : Promise.resolve(null);
  let deferredInstall;
  let last;
  const notificationsOn = () => typeof Notification !== 'undefined' && Notification.permission === 'granted' && read(NOTIFY_KEY) === '1';
  const paint = () => {
    const current = device();
    section.hidden = !current && !deferredInstall;
    line.hidden = !current || !last;
    if (current && last) line.textContent = updateLine(last, current.name);
    notifyButton.hidden = typeof Notification === 'undefined' || !current;
    notifyButton.textContent = notificationsOn() ? 'Turn off update notices' : 'Notify me about updates';
    installButton.hidden = !deferredInstall;
    hint.textContent = !notifyButton.hidden && !notificationsOn()
      ? 'Notices appear while this page or app is open, or running in the background. Your device is only reached from your own network.'
      : '';
  };
  const announce = async (current, result) => {
    if (!notificationsOn() || !result.updates.length) return;
    const signature = updateSignature(result);
    let seen = {};
    try { seen = JSON.parse(read(NOTIFIED_KEY) || '{}'); } catch { /* start again */ }
    if (seen[current.fingerprint] === signature) return;
    seen[current.fingerprint] = signature;
    write(NOTIFIED_KEY, JSON.stringify(seen));
    const title = `${current.name}: ${result.updates.length} plugin ${result.updates.length === 1 ? 'update' : 'updates'}`;
    const options = { body: result.updates.slice(0, 5).map(item => `${item.name} ${item.version}`).join(', '), tag: 'deckyhub-updates', icon: new URL('../icon-192.png', location.href).href };
    const worker = await registration;
    try { if (worker) await worker.showNotification(title, options); else new Notification(title, options); } catch { /* blocked */ }
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
      paint();
      await announce(current, result);
    } catch {
      last = undefined; // an old device without update notices, or out of reach: say nothing
      paint();
    } finally { checking = false; }
  };
  notifyButton.addEventListener('click', async () => {
    if (notificationsOn()) { write(NOTIFY_KEY, '0'); return paint(); }
    const permission = await Notification.requestPermission();
    write(NOTIFY_KEY, permission === 'granted' ? '1' : '0');
    paint();
    if (permission === 'granted') void check();
    else hint.textContent = 'Notices are blocked. Allow them for this site in your browser settings.';
  });
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
