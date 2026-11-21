import { REQUEST_STATES, TERMINAL, sleep } from './remote-core.js';
import { translate } from './remote-i18n.js';

// One request to the device (install, uninstall, enable, disable): sending it, following it until it ends,
// and what the page says along the way.

const ACTION_PROGRESS = { uninstall: 'Uninstalling…', enable: 'Enabling…', disable: 'Disabling…' };
const OUTCOMES = {
  installed: 'Installed on your device. If Decky Loader still shows its install window, it may be downloading extra files; this can take a few minutes, then you can close the window.',
  uninstalled: 'Uninstalled from your device.',
  enabled: 'Enabled on your device.',
  disabled: 'Disabled on your device.',
  unknown: 'Outcome unknown. Check your device before trying again.',
};
const SUCCEEDED = new Set(['installed', 'uninstalled', 'enabled', 'disabled']);

export const progressMessage = (state, action) => {
  if (state === 'pending_confirmation') return 'Waiting for approval on your device.';
  if (state === 'approved') return 'Approved; waiting for your device.';
  return ACTION_PROGRESS[action] || 'Installing…';
};
export const outcomeMessage = state => OUTCOMES[state] || `Request ${state}.`;

// The request as the device receives it: a pack (names), one plugin Decky knows only by name, or a registry plugin.
export const requestBody = (s, releaseTag) => {
  const base = { op: 'request', token: s.token, idempotencyKey: s.idempotencyKey, action: s.requestAction };
  if (s.requestNames) return { ...base, pluginNames: s.requestNames };
  if (s.requestName) return { ...base, pluginName: s.requestName };
  return { ...base, pluginId: s.requestPluginId, ...(releaseTag && s.requestAction === 'install' ? { releaseTag } : {}) };
};

const showDialog = dialog => {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
};

export function setupRequests(ctx) {
  const { byId, s, buttons, picker, compact, pluginId } = ctx;
  ctx.clearRequest = () => {
    s.idempotencyKey = s.requestId = s.requestPluginId = s.requestName = s.requestNames = undefined;
  };
  ctx.saveRequest = () => {
    const device = ctx.activeDevice();
    if (!device) return;
    device.pending = s.idempotencyKey ? { key: s.idempotencyKey, id: s.requestId, pluginId: s.requestPluginId, name: s.requestName, names: s.requestNames, action: s.requestAction } : undefined;
    ctx.saveDevices();
  };
  ctx.updateActions = () => {
    buttons.request.disabled = !s.token || s.busy;
    if (!compact) buttons.request.hidden = !pluginId && !s.idempotencyKey;
    buttons.request.textContent = translate(s.idempotencyKey ? 'Retry request status' : compact ? 'Send to device' : 'Send install request');
    if (buttons.pair) buttons.pair.disabled = Boolean(s.idempotencyKey);
    s.inventory?.setEnabled(Boolean(s.token) && !s.busy && !s.idempotencyKey);
  };
  // The request is over (or the device lost it): nothing is left to wait for or retry.
  const endRequest = () => {
    ctx.clearRequest();
    ctx.saveRequest();
  };
  const validStatus = (reply, expectedId) =>
    typeof reply.requestId === 'string' && Boolean(reply.requestId) && !(expectedId && reply.requestId !== expectedId) && REQUEST_STATES.has(reply.status);
  // Sends the request (or asks about the one already sent) and follows it until it ends. The final state, or
  // undefined when the person cancelled.
  const followRequest = async () => {
    const first = s.requestId
      ? await ctx.send({ op: 'status', token: s.token, requestId: s.requestId })
      : await ctx.send(requestBody(s, ctx.releaseTag));
    if (!validStatus(first, s.requestId)) throw new Error('Invalid request response.');
    s.requestId = first.requestId;
    ctx.saveRequest();
    let state = first.status;
    let delay = 3000;
    const deadline = Date.now() + 120000;
    while (!TERMINAL.has(state) && !s.cancelled && Date.now() < deadline) {
      if (buttons.cancel) buttons.cancel.disabled = state !== 'pending_confirmation';
      ctx.flow(state === 'pending_confirmation' ? 'waiting' : 'installing');
      ctx.say(progressMessage(state, s.requestAction));
      await sleep(delay);
      if (s.cancelled) return undefined;
      try {
        const next = await ctx.send({ op: 'status', token: s.token, requestId: s.requestId });
        if (next.requestId !== s.requestId || !REQUEST_STATES.has(next.status)) throw new Error('Invalid request status.');
        state = next.status;
        delay = 3000;
      } catch (error) {
        if (error?.code === 'request_not_found') throw error;
        delay = Math.min(delay * 2, 15000);
        ctx.say('Connection interrupted. Retrying status…');
      }
    }
    if (s.cancelled) return undefined;
    if (!TERMINAL.has(state)) throw new Error('Status unknown. Retry request status before starting another change.');
    return state;
  };
  // Says how it ended; true when what the device has installed changed (or may have).
  const finishRequest = state => {
    ctx.flow(SUCCEEDED.has(state) ? 'done' : 'failed');
    ctx.say(outcomeMessage(state));
    endRequest();
    if (buttons.cancel) buttons.cancel.disabled = true;
    return SUCCEEDED.has(state) || state === 'unknown';
  };
  const failRequest = error => {
    ctx.flow('failed');
    if (error?.code === 'request_not_found') {
      // The device no longer has this request (it restarted, say).
      endRequest();
      ctx.say('Your device no longer has this request, probably because it restarted. Send it again.', true);
    } else {
      ctx.say('Status unknown. The request may still be active; retry request status before starting another change.');
    }
  };
  const beginRequest = (target, selectedPluginId, pluginName, names, action) => {
    s.busy = true;
    ctx.flow('waiting');
    buttons.request.disabled = true;
    if (buttons.pair) buttons.pair.disabled = true;
    picker.disabled = true;
    s.cancelled = false;
    s.idempotencyKey ||= crypto.randomUUID();
    s.requestPluginId = target;
    s.requestName = selectedPluginId ? undefined : pluginName;
    s.requestNames = names;
    s.requestAction = action;
    ctx.saveRequest();
    s.inventory?.setEnabled(false);
  };
  // A plugin DeckyHub cannot match to the registry has no id; it is identified by its name.
  // enable / disable pass the Decky Loader names of the plugins to switch (a whole pack at once) as an array.
  ctx.runRequest = async (selectedPluginId = pluginId, action = 'install', pluginName) => {
    const names = Array.isArray(pluginName) ? pluginName : undefined;
    if (names) pluginName = undefined;
    const target = selectedPluginId || pluginName || (names && names.join('\n'));
    if (!s.endpoint || !s.token || s.busy || !target) return;
    if (s.idempotencyKey && (target !== s.requestPluginId || action !== s.requestAction)) return;
    beginRequest(target, selectedPluginId, pluginName, names, action);
    let reloadInventory = false;
    try {
      const state = await followRequest();
      if (state === undefined) return;
      reloadInventory = finishRequest(state);
    } catch (error) {
      failRequest(error);
    } finally {
      s.busy = false;
      ctx.updateActions();
      ctx.renderPicker(s.devices.indexOf(ctx.activeDevice()));
      if (reloadInventory) void s.inventory?.load();
    }
  };

  // A new request from a plugin's page first shows its warnings and virus scans in a window, and is only sent once
  // the person agrees to the risks again. Asking about a request that is already sent needs no second agreement.
  const agreeToRisks = () => new Promise(resolve => {
    const dialog = byId('risk-dialog');
    if (!dialog || s.idempotencyKey) return resolve(true);
    let answer = false;
    const finish = () => { dialog.removeEventListener('close', finish); resolve(answer); };
    dialog.addEventListener('close', finish);
    const end = agreed => () => { answer = agreed; if (typeof dialog.close === 'function') dialog.close(); else { dialog.removeAttribute('open'); finish(); } };
    byId('risk-send').onclick = end(true);
    byId('risk-cancel').onclick = end(false);
    byId('risk-close').onclick = end(false);
    showDialog(dialog);
  });
  buttons.request.addEventListener('click', async () => {
    if (s.busy || !(await agreeToRisks())) return;
    await ctx.runRequest(s.requestName || s.requestNames ? null : s.requestPluginId || pluginId, s.idempotencyKey ? s.requestAction : 'install', s.requestNames || s.requestName);
  });
  buttons.cancel?.addEventListener('click', async () => {
    if (!s.endpoint || !s.token || !s.requestId) return;
    buttons.cancel.disabled = true;
    try {
      const result = await ctx.send({ op: 'cancel', token: s.token, requestId: s.requestId });
      if (result.requestId !== s.requestId || result.status !== 'cancelled') throw new Error('The request could not be cancelled.');
      s.cancelled = true;
      endRequest();
      ctx.flow('ready');
      ctx.say('Request cancelled.');
    } catch (error) { ctx.showError(error); }
  });
}
