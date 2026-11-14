import { translate } from './remote-i18n.js';

// A paired browser hands out a one-time link for another browser (a laptop): from the Share link button or by copy.
export function setupShare({ byId, say, send, activeDevice }) {
  // A paired browser hands out a one-time link: the other browser opens it, pairs by itself, and the device asks for approval.
  const shareBox = byId('share-box'), shareLink = byId('share-link'), shareStatus = byId('share-status'), shareButton = byId('share-button');
  let shareTimer;
  // Said beside the button, where the person is looking, not only in the status line further up the page.
  const shareSay = (message, isError = false) => {
    shareStatus.textContent = translate(message);
    shareStatus.hidden = !message;
    shareStatus.dataset.kind = isError ? 'error' : '';
    say(message, isError);
  };
  shareButton?.addEventListener('click', async () => {
    shareButton.disabled = true;
    shareSay('Making a link…');
    try {
      const device = activeDevice();
      if (!device) throw new Error('Pair with your device first.');
      const ticket = await send({ op: 'pair_link' });
      if (!/^[A-Za-z0-9_-]{43}$/.test(ticket.pairingToken || '') || !/^[a-f0-9]{64}$/.test(ticket.fingerprint || '')) throw new Error('Invalid pairing response.');
      const params = new URLSearchParams({ device: device.address, fingerprint: ticket.fingerprint, pair: ticket.pairingToken });
      if (/^[\w .-]{1,40}$/.test(device.name || '')) params.set('name', device.name);
      shareLink.value = `https://deckyhub.com/develop/paired-devices/#${params}`;
      shareBox.hidden = false;
      clearTimeout(shareTimer);
      shareTimer = setTimeout(() => { shareBox.hidden = true; shareLink.value = ''; }, Math.min(ticket.expiresInSeconds || 300, 300) * 1000);
      shareSay('Link ready. Open it in the other browser.');
    } catch (error) {
      // A device on an older DeckyHub answers any message it doesn't know with a plain rejection.
      shareSay(error.message === 'The device rejected the request.'
        ? 'Your device could not make a link. Update DeckyHub on it to the newest version, then try again.'
        : error.message, true);
    } finally { shareButton.disabled = false; }
  });
  // Where the browser has a share sheet (a phone), the link goes to the other browser in one tap: Quick Share, a messenger, mail.
  const shareSend = byId('share-send');
  if (shareSend && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    shareSend.hidden = false;
    shareSend.addEventListener('click', async () => {
      try { await navigator.share({ title: 'DeckyHub', url: shareLink.value }); }
      catch (error) { if (error?.name !== 'AbortError') say('Could not open the share sheet. Copy the link instead.', true); }
    });
  }
  byId('share-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareLink.value); say('Link copied. Paste it into Chrome or Edge.'); }
    catch { shareLink.select(); say('Select the link, copy it, then paste it into Chrome or Edge.'); }
  });
}
