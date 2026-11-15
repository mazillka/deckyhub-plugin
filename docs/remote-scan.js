import { detailsFromPairingLink } from './remote-core.js';
import { translate } from './remote-i18n.js';

// Pairing a computer: the camera reads the QR code the device shows, so no link has to be copied across.
// pairDevice(details) is the page's own pairing, the same one a pasted or opened link starts.
export function setupScan({ root, byId, form, pairDevice }) {
  // A computer with a camera reads the QR code off the device's screen: no link to copy across. The reader
  // (jsQR, docs/vendor) is only loaded when the camera is first used.
  const scanBox = byId('scan'), scanButton = byId('scan-button'), scanStop = byId('scan-stop'), scanVideo = byId('scan-video'), scanStatus = byId('scan-status');
  if (scanBox && form && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) scanBox.hidden = false;
  let scanning = false;
  const scanSay = (message, isError = false) => {
    scanStatus.textContent = translate(message);
    scanStatus.hidden = !message;
    scanStatus.dataset.kind = isError ? 'error' : '';
  };
  const stopScan = () => {
    scanning = false;
    scanVideo.srcObject?.getTracks().forEach(track => track.stop());
    scanVideo.srcObject = null;
    scanVideo.hidden = true;
    scanStop.hidden = true;
    scanButton.disabled = false;
  };
  const qrReader = () => globalThis.jsQR ? Promise.resolve(globalThis.jsQR) : new Promise((resolve, reject) => {
    const script = root.ownerDocument.createElement('script');
    script.src = new URL('vendor/jsqr.js', import.meta.url).href;
    script.onload = () => resolve(globalThis.jsQR);
    script.onerror = () => reject(new Error('Could not load the QR reader.'));
    root.ownerDocument.head.append(script);
  });
  scanStop?.addEventListener('click', () => { stopScan(); scanSay(''); });
  scanButton?.addEventListener('click', async () => {
    scanButton.disabled = true;
    scanSay('Starting the camera…');
    try {
      const jsQR = await qrReader();
      scanVideo.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      scanVideo.hidden = false;
      scanStop.hidden = false;
      await scanVideo.play();
      scanning = true;
      scanSay('Point the camera at the QR code on your device, about 30 cm away, with its screen bright.');
      const canvas = root.ownerDocument.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
      const look = () => {
        if (!scanning) return;
        if (scanVideo.videoWidth) {
          canvas.width = Math.min(scanVideo.videoWidth, 1280);
          canvas.height = Math.round(scanVideo.videoHeight * canvas.width / scanVideo.videoWidth);
          context.drawImage(scanVideo, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (found?.data) {
            const device = detailsFromPairingLink(found.data);
            if (device) { stopScan(); scanSay(''); void pairDevice(device); return; }
            scanSay('That QR code is not a DeckyHub pairing code.', true);
          }
        }
        setTimeout(look, 150);
      };
      look();
    } catch (error) {
      stopScan();
      scanSay(error?.name === 'NotAllowedError' ? 'Allow camera access to scan the QR code.'
        : error?.name === 'NotFoundError' ? 'No camera was found. Paste the link instead.'
        : error.message, true);
    }
  });
}
