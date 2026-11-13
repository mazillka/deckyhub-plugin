import { translate } from './remote-i18n.js';

// Installed versions come from the selected paired device. What DeckyHub knows about each plugin (downloads, audit
// warnings, virus scans) comes from plugins/info.json, built with the site; a plugin it can't match shows no extra line.
const compact = number => (number >= 1e6 ? `${(number / 1e6).toFixed(1)}M` : number >= 1e3 ? `${(number / 1e3).toFixed(1)}K` : String(number)).replace('.0', '');
const SCAN_WORDS = { clean: 'no threats found', infected: 'threat found', incomplete: 'only partly scanned', error: "couldn't be scanned" };
let infoRequest;
function loadInfo() {
  infoRequest ||= fetch(new URL('plugins/info.json', import.meta.url))
    .then(response => (response.ok ? response.json() : null))
    .then(info => (info && typeof info === 'object' && info.plugins && typeof info.plugins === 'object' ? info : null))
    .catch(() => null);
  return infoRequest;
}
function badge(document, text, kind, title) {
  const item = document.createElement('span');
  item.className = `remote-badge remote-badge-${kind}`;
  item.textContent = translate(text);
  if (title) item.title = translate(title);
  return item;
}
export function describe(document, record, labels) {
  const parts = [];
  const badges = document.createElement('span');
  badges.className = 'remote-badges';
  if (record.root) badges.append(badge(document, 'Runs as root', 'warn', 'Its backend runs as root, with full access to the device.'));
  for (const [field, prefix] of [['warnings', ''], ['prereleaseWarnings', 'Pre-release: ']]) {
    for (const code of record[field] || []) {
      if (field === 'prereleaseWarnings' && (record.warnings || []).includes(code)) continue;
      const [label, hint] = labels[code] || [code, 'The registry reported this audit finding.'];
      badges.append(badge(document, prefix + label, code === 'blocked' ? 'bad' : 'warn', hint));
    }
  }
  if (record.ai) badges.append(badge(document, 'AI', 'info', 'Likely developed with AI help. That says nothing about its quality or safety.'));
  if (record.fork) badges.append(badge(document, 'Fork', 'info', `A fork of ${record.fork}`));
  const scan = record.scan;
  if (scan) {
    const text = { clean: 'No threats', infected: 'Threat found', partial: 'Not fully scanned' }[scan.kind] || 'Scanned';
    badges.append(badge(document, (scan.prerelease ? 'Pre-release: ' : '') + text, scan.kind === 'clean' ? 'ok' : scan.kind === 'infected' ? 'bad' : 'warn'));
  }
  if (badges.childElementCount) parts.push(badges);
  const facts = [];
  if (Number.isFinite(record.downloads)) facts.push(`${compact(record.downloads)} GitHub downloads`);
  if (Number.isFinite(record.storeDownloads)) facts.push(`${compact(record.storeDownloads)} Decky store downloads`);
  if (Number.isFinite(record.stars)) facts.push(`${compact(record.stars)} stars`);
  if (record.latest) facts.push(`latest release ${record.latest}`);
  if (typeof record.updated === 'string' && record.updated.length >= 10) facts.push(`updated ${record.updated.slice(0, 10)}`);
  if (facts.length) {
    const line = document.createElement('span');
    line.textContent = facts.map(fact => translate(fact)).join(' · ');
    parts.push(line);
  }
  if (scan) {
    const results = [];
    if (scan.clamav) results.push(`ClamAV: ${SCAN_WORDS[scan.clamav] || scan.clamav}`);
    if (scan.yara) results.push(`YARA: ${SCAN_WORDS[scan.yara] || scan.yara}`);
    if (Array.isArray(scan.virusTotal)) results.push(`VirusTotal: ${scan.virusTotal[0]} of ${scan.virusTotal[1]} engines flagged it`);
    if (Array.isArray(scan.metaDefender)) results.push(`MetaDefender: ${scan.metaDefender[0]} of ${scan.metaDefender[1]} engines flagged it`);
    const line = document.createElement('span');
    line.textContent = translate(`Virus scan of ${scan.tag || 'the latest release'}: ${results.map(result => translate(result)).join('; ')}. A clean scan isn't proof of safety.`);
    parts.push(line);
  }
  if (typeof record.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(record.id)) {
    const link = document.createElement('a');
    link.href = new URL(`plugins/${record.id}.html`, import.meta.url).href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = translate('All details on DeckyHub');
    parts.push(link);
  }
  return parts;
}

// A DeckyHub pack file: { kind: 'deckyhub-pack', name, plugins: [{ repo }] }, or a repositories list { repos: [...] }.
export function readPack(text) {
  const data = JSON.parse(text);
  const items = Array.isArray(data?.plugins) ? data.plugins.map(item => item?.repo) : Array.isArray(data?.repos) ? data.repos : null;
  if (!items) throw new Error('This is not a DeckyHub plugin pack.');
  const repos = [...new Set(items.filter(repo => typeof repo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)).map(repo => repo.toLowerCase()))].slice(0, 200);
  if (!repos.length) throw new Error('This plugin pack has no plugins in it.');
  return { name: typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 60) : 'Pack', repos };
}

// The pack's plugins that are installed on the device (never DeckyHub), and which of them are off or on.
export function packTargets(pack, installed) {
  const repos = new Set(pack?.repos || []);
  const match = installed.filter(plugin => plugin.repo && repos.has(plugin.repo.toLowerCase()) &&
    typeof plugin.pluginName === 'string' && plugin.pluginName.toLowerCase() !== 'deckyhub');
  return {
    found: match.length,
    enable: match.filter(plugin => plugin.disabled).map(plugin => plugin.pluginName),
    disable: match.filter(plugin => !plugin.disabled).map(plugin => plugin.pluginName),
  };
}

export function createPluginList(root, { loadPage, request }) {
  const list = root.querySelector('#remote-plugins');
  const status = root.querySelector('#remote-plugins-status');
  const refresh = root.querySelector('#remote-plugins-refresh');
  const filter = root.querySelector('#remote-plugins-filter');
  const packFile = root.querySelector('#remote-pack');
  const packInfo = root.querySelector('#remote-pack-info');
  const packEnable = root.querySelector('#remote-pack-enable');
  const packDisable = root.querySelector('#remote-pack-disable');
  const document = root.ownerDocument;
  if (!list || !status || !refresh || !document) return { reset() {}, setEnabled() {}, load() {} };
  let generation = 0;
  let enabled = false;
  let loading = false;
  let installed = [];
  let pack; // { name, repos } from the picked pack file
  const actionButtons = [];
  const updateButtons = () => {
    refresh.disabled = !enabled || loading;
    actionButtons.forEach(button => { button.disabled = !enabled || loading; });
    if (packFile) packFile.disabled = !enabled || loading;
    const targets = packTargets(pack, installed);
    if (packEnable) packEnable.disabled = !enabled || loading || !targets.enable.length;
    if (packDisable) packDisable.disabled = !enabled || loading || !targets.disable.length;
    if (packInfo && pack) {
      packInfo.textContent = translate(`${pack.name}: ${targets.found} of ${pack.repos.length} plugins are installed on this device (${targets.enable.length} off, ${targets.disable.length} on).`);
    }
  };
  packFile?.addEventListener('change', async () => {
    const file = packFile.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('This file is too large to be a plugin pack.');
      pack = readPack(await file.text());
      updateButtons();
    } catch (error) {
      pack = undefined;
      if (packInfo) packInfo.textContent = translate(error instanceof SyntaxError ? 'This is not a DeckyHub plugin pack.' : error.message);
      updateButtons();
    }
  });
  for (const [button, action] of [[packEnable, 'enable'], [packDisable, 'disable']]) {
    button?.addEventListener('click', () => {
      const names = packTargets(pack, installed)[action];
      if (names.length) request(null, action, names.slice(0, 50));
    });
  }
  const applyFilter = () => {
    const words = (filter?.value || '').toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of list.children) {
      row.hidden = !words.every(word => row.textContent.toLowerCase().includes(word));
      if (!row.hidden) shown++;
    }
    if (filter) {
      filter.hidden = list.children.length < 6;
      status.textContent = translate(words.length ? `${shown} of ${list.children.length} plugins` : `${list.children.length} installed ${list.children.length === 1 ? 'plugin' : 'plugins'}`);
    }
  };
  filter?.addEventListener('input', applyFilter);
  const decorate = async (rows, current) => {
    const info = await loadInfo();
    if (!info || current !== generation) return;
    for (const { row, plugin } of rows) {
      const record = typeof plugin.repo === 'string' ? info.plugins[plugin.repo.toLowerCase()] : null;
      if (!record || !row.isConnected) continue;
      const note = document.createElement('div');
      note.className = 'remote-info';
      note.append(...describe(document, record, info.warnings || {}));
      row.insertBefore(note, row.querySelector('.remote-actions'));
    }
    applyFilter();
  };
  const toggleButton = plugin => {
    const action = plugin.disabled ? 'enable' : 'disable';
    const button = document.createElement('button');
    button.type = 'button';
    const label = plugin.disabled ? 'Request enable' : 'Request disable';
    button.textContent = translate(label);
    button.setAttribute('aria-label', translate(`${label} for ${plugin.name}`));
    button.addEventListener('click', () => request(null, action, [plugin.pluginName]));
    actionButtons.push(button);
    return button;
  };
  const render = plugins => {
    list.replaceChildren();
    actionButtons.length = 0;
    const pending = [];
    installed = plugins;
    for (const plugin of plugins) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = plugin.disabled ? translate(`${plugin.name} (disabled)`) : plugin.name;
      const version = document.createElement('span');
      version.textContent = translate(`Installed version · ${plugin.version}`);
      const repository = document.createElement('span');
      repository.textContent = plugin.repo || translate('Repository unavailable');
      row.append(title, version, repository);
      const verified = plugin.identityUnverified === false &&
        typeof plugin.id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(plugin.id) &&
        typeof plugin.pluginName === 'string' && plugin.pluginName.toLowerCase() !== 'deckyhub';
      if (verified) {
        const actions = document.createElement('div');
        actions.className = 'remote-actions';
        actions.append(toggleButton(plugin));
        for (const [action, label] of [['update', 'Request update'], ['uninstall', 'Request uninstall']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = translate(label);
          button.setAttribute('aria-label', translate(`${label} for ${plugin.name}`));
          if (action === 'uninstall') button.className = 'remote-danger';
          button.addEventListener('click', () => request(plugin.id, action));
          actions.append(button);
          actionButtons.push(button);
        }
        row.append(actions);
      } else if (plugin.pluginName && plugin.pluginName.toLowerCase() !== 'deckyhub') {
        // DeckyHub cannot tell which repository this plugin came from, so it cannot install or
        // update it from here. Removing it only needs the name Decky Loader uses.
        const actions = document.createElement('div');
        actions.className = 'remote-actions';
        actions.append(toggleButton(plugin));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'remote-danger';
        button.textContent = translate('Request uninstall');
        button.setAttribute('aria-label', translate(`Request uninstall for ${plugin.name}`));
        button.addEventListener('click', () => request(null, 'uninstall', plugin.pluginName));
        actions.append(button);
        actionButtons.push(button);
        const note = document.createElement('span');
        note.textContent = translate('Updates for this plugin come from its own page or your device.');
        row.append(actions, note);
      } else {
        const note = document.createElement('span');
        note.textContent = translate('Manage DeckyHub on your device.');
        row.append(note);
      }
      list.append(row);
      pending.push({ row, plugin });
    }
    status.textContent = translate(plugins.length ? `${plugins.length} installed ${plugins.length === 1 ? 'plugin' : 'plugins'}` : 'No installed plugins found.');
    updateButtons();
    applyFilter();
    decorate(pending, generation);
  };
  const load = async () => {
    if (!enabled || loading) return;
    const current = ++generation;
    loading = true;
    updateButtons();
    status.textContent = translate('Loading installed plugins…');
    const plugins = [];
    let offset = 0;
    try {
      do {
        const result = await loadPage(offset);
        if (current !== generation) return;
        if (!Array.isArray(result.plugins) || result.plugins.length > 20 ||
            result.plugins.some(plugin => !plugin || typeof plugin.name !== 'string' || typeof plugin.version !== 'string' ||
              (plugin.pluginName !== null && typeof plugin.pluginName !== 'string') ||
              (plugin.disabled !== undefined && typeof plugin.disabled !== 'boolean'))) {
          throw new Error('Invalid plugin list from the device.');
        }
        plugins.push(...result.plugins);
        if (plugins.length > 1000) throw new Error('Too many plugins to display.');
        if (result.nextOffset === null) break;
        if (!result.plugins.length || !Number.isInteger(result.nextOffset) || result.nextOffset <= offset)
          throw new Error('Invalid plugin list page.');
        offset = result.nextOffset;
      } while (true);
      render(plugins);
    } catch (error) {
      if (current !== generation) return;
      list.replaceChildren();
      actionButtons.length = 0;
      installed = [];
      status.textContent = translate(error instanceof Error ? error.message : 'Unable to load installed plugins.');
    } finally {
      if (current === generation) { loading = false; updateButtons(); }
    }
  };
  refresh.addEventListener('click', load);
  return {
    reset() {
      generation++;
      loading = false;
      list.replaceChildren();
      actionButtons.length = 0;
      installed = [];
      status.textContent = translate('Pair a device to see its installed plugins.');
      updateButtons();
    },
    setEnabled(value) { enabled = value; updateButtons(); },
    load,
  };
}
