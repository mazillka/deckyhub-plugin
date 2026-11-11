// Installed versions come from the selected paired device.
export function createPluginList(root, { loadPage, request }) {
  const list = root.querySelector('#remote-plugins');
  const status = root.querySelector('#remote-plugins-status');
  const refresh = root.querySelector('#remote-plugins-refresh');
  const filter = root.querySelector('#remote-plugins-filter');
  const document = root.ownerDocument;
  if (!list || !status || !refresh || !document) return { reset() {}, setEnabled() {}, load() {} };
  let generation = 0;
  let enabled = false;
  let loading = false;
  const actionButtons = [];
  const updateButtons = () => {
    refresh.disabled = !enabled || loading;
    actionButtons.forEach(button => { button.disabled = !enabled || loading; });
  };
  const applyFilter = () => {
    const words = (filter?.value || '').toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of list.children) {
      row.hidden = !words.every(word => row.textContent.toLowerCase().includes(word));
      if (!row.hidden) shown++;
    }
    if (filter) {
      filter.hidden = list.children.length < 6;
      status.textContent = words.length ? `${shown} of ${list.children.length} plugins` : `${list.children.length} installed ${list.children.length === 1 ? 'plugin' : 'plugins'}`;
    }
  };
  filter?.addEventListener('input', applyFilter);
  const render = plugins => {
    list.replaceChildren();
    actionButtons.length = 0;
    for (const plugin of plugins) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = plugin.name;
      const version = document.createElement('span');
      version.textContent = `Installed version · ${plugin.version}`;
      const repository = document.createElement('span');
      repository.textContent = plugin.repo || 'Repository unavailable';
      row.append(title, version, repository);
      const verified = plugin.identityUnverified === false &&
        typeof plugin.id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(plugin.id) &&
        typeof plugin.pluginName === 'string' && plugin.pluginName.toLowerCase() !== 'deckyhub';
      if (verified) {
        const actions = document.createElement('div');
        actions.className = 'remote-actions';
        for (const [action, label] of [['update', 'Request update'], ['uninstall', 'Request uninstall']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.setAttribute('aria-label', `${label} for ${plugin.name}`);
          if (action === 'uninstall') button.className = 'remote-danger';
          button.addEventListener('click', () => request(plugin.id, action));
          actions.append(button);
          actionButtons.push(button);
        }
        row.append(actions);
      } else {
        const note = document.createElement('span');
        note.textContent = plugin.pluginName?.toLowerCase() === 'deckyhub'
          ? 'Manage DeckyHub on your device.'
          : 'Can’t be changed from here. Manage it on your device.';
        row.append(note);
      }
      list.append(row);
    }
    status.textContent = plugins.length ? `${plugins.length} installed ${plugins.length === 1 ? 'plugin' : 'plugins'}` : 'No installed plugins found.';
    updateButtons();
    applyFilter();
  };
  const load = async () => {
    if (!enabled || loading) return;
    const current = ++generation;
    loading = true;
    updateButtons();
    status.textContent = 'Loading installed plugins…';
    const plugins = [];
    let offset = 0;
    try {
      do {
        const result = await loadPage(offset);
        if (current !== generation) return;
        if (!Array.isArray(result.plugins) || result.plugins.length > 20 ||
            result.plugins.some(plugin => !plugin || typeof plugin.name !== 'string' || typeof plugin.version !== 'string' ||
              (plugin.pluginName !== null && typeof plugin.pluginName !== 'string'))) {
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
      status.textContent = error instanceof Error ? error.message : 'Unable to load installed plugins.';
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
      status.textContent = 'Pair a device to see its installed plugins.';
      updateButtons();
    },
    setEnabled(value) { enabled = value; updateButtons(); },
    load,
  };
}
