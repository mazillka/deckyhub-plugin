import { PAIRING_DETAILS_KEY, browserIdFor, detailsFromPairingLink, deviceUrl, exchange, fingerprintBytes, isPin, pinnedHashes, probeDevice, sleep, toBase64Url } from './remote-core.js';
import { MAX_DEVICES } from './remote-devices.js';

// Pairing this browser with a device: the form, a pasted or opened link, the camera, and the approval on the device.

const APPROVAL_WAIT = 120000;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const forgetPairingDetails = () => {
  try { sessionStorage.removeItem(PAIRING_DETAILS_KEY); } catch { /* nothing kept */ }
};

export function setupPairing(ctx) {
  const { byId, s, buttons, picker, form } = ctx;
  const linkInput = byId('pairing-link');
  ctx.fillDevice = ({ address, fingerprint, name }) => {
    byId('address').value = address;
    if (name && !byId('device-name').value.trim()) byId('device-name').value = name;
    if (s.token) {
      ctx.say('Address filled in. Select Use new device address to reconnect to the paired device.');
    } else {
      byId('fingerprint').value = fingerprint;
      ctx.say('Device details filled in. Enter the pairing code shown on your device.');
    }
  };
  const usePairingLink = () => {
    if (!linkInput.value.trim()) return;
    const device = detailsFromPairingLink(linkInput.value);
    if (!device) throw new Error('Paste the pairing link copied from DeckyHub on your device.');
    ctx.fillDevice(device);
    linkInput.value = '';
    return device;
  };
  const pairedAlready = device => probeDevice(device, connection => exchange(connection, { op: 'summary', token: device.token }));

  // Waits (up to two minutes) for the person to approve this browser on the device.
  const awaitApproval = async (pairingId, pairingSecret) => {
    const deadline = Date.now() + APPROVAL_WAIT;
    while (Date.now() < deadline) {
      await sleep(2000);
      const approval = await ctx.send({ op: 'pair_status', pairingId, pairingSecret });
      if (approval.status === 'approved' && /^[A-Za-z0-9_-]{43}$/.test(approval.token || '')) return approval;
      if (approval.status === 'rejected' || approval.status === 'expired') throw new Error(`Pairing ${approval.status}.`);
      if (approval.status !== 'pending') throw new Error('Invalid pairing status.');
    }
    throw new Error('Pairing timed out.');
  };
  const savePairing = (url, pin, approval) => {
    s.token = approval.token;
    const address = new URL(url).host;
    const deviceName = byId('device-name').value.trim().slice(0, 64) || address;
    const nextFingerprint = isPin(approval.nextFingerprint) ? approval.nextFingerprint : undefined;
    const paired = { name: deviceName, address, fingerprint: pin, nextFingerprint, token: s.token, lastUsed: Date.now() };
    s.devices = [...s.devices.filter(device => device.fingerprint !== pin), paired];
    s.endpoint = { url, hashes: pinnedHashes(paired) };
    ctx.saveDevices();
    ctx.rememberDevice(ctx.activeDevice());
    forgetPairingDetails();
    ctx.renderPicker(s.devices.length - 1);
    if (buttons.reconnect) buttons.reconnect.hidden = false;
    ctx.setState('paired');
    ctx.say('Paired. You can now manage this device.');
    ctx.updateActions();
    if (!ctx.pluginId) ctx.loadDeviceLists();
  };
  // The address and pin to pair with, from the link or the form.
  const targetOf = link => {
    if (link) {
      byId('address').value = link.address;
      byId('fingerprint').value = link.fingerprint;
    }
    if (!byId('address').value.trim()) throw new Error('Paste a pairing link or enter the address under connection details.');
    const url = deviceUrl(byId('address').value);
    const fingerprint = fingerprintBytes(byId('fingerprint').value);
    return { url, fingerprint, pin: hex(fingerprint) };
  };
  const credentialFor = pairingToken => {
    const code = byId('code').value.trim(), name = byId('name').value.trim();
    if ((!pairingToken && !/^\d{6}$/.test(code)) || !name || name.length > 64) throw new Error('Enter the six-digit pairing code and a browser name.');
    return { credential: pairingToken ? { pairingToken } : { code }, name };
  };
  // The device took the code and token once outcome.consumed: both fields are emptied when the pairing is over,
  // not before, so a request that never reached the device can be tried again from them.
  const pair = async (link, outcome) => {
    const pairingToken = (link || usePairingLink())?.pairingToken;
    const { url, fingerprint, pin } = targetOf(link);
    const previous = s.devices.find(device => device.fingerprint === pin);
    if (previous?.pending) throw new Error('Select the existing pairing to check its pending request first.');
    // A pairing link opened in a browser that is already paired with this device: if the device still knows this
    // browser there is nothing to pair (Add device is the way to pair again on purpose).
    if (link?.pairingToken && previous?.token && await pairedAlready(previous)) {
      forgetPairingDetails();
      ctx.selectDevice(s.devices.indexOf(previous));
      ctx.say('Already paired with this device.');
      return;
    }
    if (!previous && s.devices.length >= MAX_DEVICES) throw new Error('This tab can pair with up to 16 devices.');
    const { credential, name } = credentialFor(pairingToken);
    s.endpoint = { url, hashes: [{ algorithm: 'sha-256', value: fingerprint }] };
    ctx.say('Connecting to your device. Allow local network access if your browser asks.');
    const pairingSecret = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const result = await ctx.send({ op: 'pair', ...credential, name, pairingSecret, browserId: browserIdFor(pin) });
    if (typeof result.pairingId !== 'string' || !result.pairingId) throw new Error('Invalid pairing response.');
    outcome.consumed = true;
    ctx.setState('approve');
    ctx.say('Approve this browser on your device: press Approve under Pairing requests.');
    savePairing(url, pin, await awaitApproval(result.pairingId, pairingSecret));
  };
  const failedPairing = (error, link, consumed) => {
    ctx.disconnect();
    ctx.renderPicker();
    ctx.setState(error.unreachable ? 'unreachable' : consumed ? 'declined' : 'error');
    if (link?.pairingToken && error.message === 'The device rejected the request.')
      ctx.say('This pairing link was rejected. Generate a new QR code or pairing link on your device.');
    else ctx.showError(error);
  };
  ctx.pairDevice = async link => {
    if (s.idempotencyKey || s.pairing) return;
    s.pairing = true;
    ctx.setState('connecting');
    const outcome = { consumed: false };
    if (buttons.pair) buttons.pair.disabled = true;
    picker.disabled = true;
    ctx.disconnect();
    try {
      await pair(link, outcome);
    } catch (error) {
      failedPairing(error, link, outcome.consumed);
    } finally {
      s.pairing = false; ctx.updateActions(); picker.disabled = false;
      if (outcome.consumed) { byId('code').value = ''; linkInput.value = ''; }
    }
  };
  // Pointing the open connection at another address for the same device (the pin stays).
  const useNewAddress = url => {
    ctx.closeTransport();
    // The next request authenticates the new address with the original pinned fingerprint.
    s.endpoint = { ...s.endpoint, url };
    const device = ctx.activeDevice();
    if (!device) return;
    device.address = new URL(url).host;
    ctx.saveDevices();
    if (!picker.disabled) ctx.renderPicker(s.devices.indexOf(device));
  };

  linkInput?.addEventListener('change', () => {
    try {
      const link = usePairingLink();
      if (link?.pairingToken) void ctx.pairDevice(link);
    } catch (error) { ctx.showError(error); }
  });
  form?.addEventListener('submit', event => {
    event.preventDefault();
    void ctx.pairDevice();
  });
  byId('pair-another')?.addEventListener('click', () => {
    if (s.pairing) return ctx.openAdd();
    ctx.disconnect();
    ctx.renderPicker();
    ctx.setState('new');
    ctx.openAdd();
    ctx.say('Turn on Remote access on your device, then scan its QR code or paste the pairing link.');
  });
  buttons.reconnect?.addEventListener('click', () => {
    if (!s.endpoint || !s.token) return;
    try {
      const url = deviceUrl(byId('address').value);
      if (url !== s.endpoint.url) useNewAddress(url);
      ctx.say('Address updated. Send to device or retry the pending request to reconnect.');
      if (!ctx.pluginId) ctx.loadDeviceLists();
    } catch (error) { ctx.showError(error); }
  });
}
