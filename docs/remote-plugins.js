import { translate } from "./remote-i18n.js";

// Installed versions come from the selected paired device. What DeckyHub knows about each plugin (downloads, audit
// warnings, virus scans) comes from plugins/info.json, built with the site; a plugin it can't match shows no extra line.
const compact = (number) => {
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`.replace(".0", "");
  if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`.replace(".0", "");
  return String(number).replace(".0", "");
};
const SCAN_WORDS = {
  clean: "no threats found",
  infected: "threat found",
  incomplete: "only partly scanned",
  error: "couldn't be scanned",
};
let infoRequest;
function loadInfo() {
  infoRequest ||= fetch(new URL("plugins/info.json", import.meta.url))
    .then((response) => (response.ok ? response.json() : null))
    .then((info) =>
      info && typeof info === "object" && info.plugins && typeof info.plugins === "object" ? info : null,
    )
    .catch(() => null);
  return infoRequest;
}
function badge(document, text, kind, title) {
  const item = document.createElement("span");
  item.className = `remote-badge remote-badge-${kind}`;
  item.textContent = translate(text);
  if (title) item.title = translate(title);
  return item;
}
const VALID_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const pluginCount = (count) => `${count} installed ${count === 1 ? "plugin" : "plugins"}`;
const SCAN_BADGES = {
  clean: ["Nothing flagged", "ok"],
  infected: ["Threat found", "bad"],
  partial: ["Not fully scanned", "warn"],
};

function warningBadges(document, record, labels) {
  const found = [];
  if (record.root)
    found.push(badge(document, "Runs as root", "warn", "Its backend runs as root, with full access to the device."));
  for (const [field, prefix] of [
    ["warnings", ""],
    ["prereleaseWarnings", "Pre-release: "],
  ]) {
    for (const code of record[field] || []) {
      if (field === "prereleaseWarnings" && (record.warnings || []).includes(code)) continue;
      const [label, hint] = labels[code] || [code, "The registry reported this audit finding."];
      found.push(badge(document, prefix + label, code === "blocked" ? "bad" : "warn", hint));
    }
  }
  return found;
}

function noteBadges(document, record) {
  const found = [];
  if (record.ai)
    found.push(
      badge(document, "AI", "info", "Likely developed with AI help. That says nothing about its quality or safety."),
    );
  if (record.rust)
    found.push(
      badge(document, "Rust", "info", "Part of the plugin is written in Rust. That says nothing about its quality or safety."),
    );
  if (record.fork) found.push(badge(document, "Fork", "info", `A fork of ${record.fork}`));
  return found;
}

function scanBadge(document, scan) {
  const [text, kind] = SCAN_BADGES[scan.kind] || ["Scanned", "warn"];
  return badge(document, (scan.prerelease ? "Pre-release: " : "") + text, kind);
}

const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

// The download numbers: GitHub's, the Decky store's (activity when known, else plain downloads), and their sum.
function downloadCounts(record) {
  const activity = record.storeActivity;
  const hasActivity =
    activity &&
    validCount(activity.downloads) &&
    validCount(activity.updates) &&
    validCount(activity.downloads + activity.updates);
  const activityTotal = hasActivity ? activity.downloads + activity.updates : undefined;
  const storeCount = activityTotal ?? (validCount(record.storeDownloads) ? record.storeDownloads : undefined);
  const githubCount = validCount(record.downloads) ? record.downloads : undefined;
  const none = githubCount === undefined && storeCount === undefined;
  return { activityTotal, storeCount, githubCount, total: none ? undefined : (githubCount ?? 0) + (storeCount ?? 0) };
}

function storeFact({ activityTotal, storeCount }) {
  if (activityTotal !== undefined)
    return `${compact(activityTotal)} Decky store activity (downloads + updates; matched by name)`;
  if (storeCount !== undefined) return `${compact(storeCount)} Decky store downloads`;
  return undefined;
}

function factsOf(record) {
  const counts = downloadCounts(record);
  const facts = [];
  if (counts.total !== undefined && validCount(counts.total))
    facts.push(`${compact(counts.total)} approximate activity (repeat downloads included; not unique installs)`);
  if (counts.githubCount !== undefined) facts.push(`${compact(counts.githubCount)} GitHub downloads`);
  facts.push(storeFact(counts));
  if (Number.isFinite(record.stars)) facts.push(`${compact(record.stars)} stars`);
  if (record.latest) facts.push(`latest release ${record.latest}`);
  if (typeof record.updated === "string" && record.updated.length >= 10)
    facts.push(`updated ${record.updated.slice(0, 10)}`);
  return facts.filter(Boolean);
}

function textLine(document, text) {
  const line = document.createElement("span");
  line.textContent = text;
  return line;
}

function scanLine(document, scan) {
  const results = [];
  if (scan.clamav) results.push(`ClamAV: ${SCAN_WORDS[scan.clamav] || scan.clamav}`);
  if (scan.yara) results.push(`YARA: ${SCAN_WORDS[scan.yara] || scan.yara}`);
  if (Array.isArray(scan.virusTotal))
    results.push(`VirusTotal: ${scan.virusTotal[0]} of ${scan.virusTotal[1]} engines flagged it`);
  if (Array.isArray(scan.metaDefender))
    results.push(`MetaDefender: ${scan.metaDefender[0]} of ${scan.metaDefender[1]} engines flagged it`);
  return textLine(
    document,
    translate(
      `Virus scan of ${scan.tag || "the latest release"}: ${results.map((result) => translate(result)).join("; ")}. A clean scan isn't proof of safety.`,
    ),
  );
}

function detailsLink(document, id) {
  const link = document.createElement("a");
  link.href = new URL(`plugins/${id}.html`, import.meta.url).href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = translate("All details on DeckyHub");
  return link;
}

export function describe(document, record, labels) {
  const parts = [];
  const scan = record.scan;
  const badges = document.createElement("span");
  badges.className = "remote-badges";
  badges.append(...warningBadges(document, record, labels), ...noteBadges(document, record));
  if (scan) badges.append(scanBadge(document, scan));
  if (badges.childElementCount) parts.push(badges);
  const facts = factsOf(record);
  if (facts.length) parts.push(textLine(document, facts.map((fact) => translate(fact)).join(" · ")));
  if (scan) parts.push(scanLine(document, scan));
  if (typeof record.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(record.id)) parts.push(detailsLink(document, record.id));
  return parts;
}

// A DeckyHub pack file: { kind: 'deckyhub-pack', name, plugins: [{ repo }] }, or a repositories list { repos: [...] }.
const packItems = (data) => {
  if (Array.isArray(data?.plugins)) return data.plugins.map((item) => item?.repo);
  return Array.isArray(data?.repos) ? data.repos : null;
};

export function readPack(text) {
  const data = JSON.parse(text);
  const items = packItems(data);
  if (!items) throw new Error("This is not a DeckyHub plugin pack.");
  const repos = [
    ...new Set(
      items
        .filter((repo) => typeof repo === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
        .map((repo) => repo.toLowerCase()),
    ),
  ].slice(0, 200);
  if (!repos.length) throw new Error("This plugin pack has no plugins in it.");
  return { name: typeof data.name === "string" && data.name.trim() ? data.name.trim().slice(0, 60) : "Pack", repos };
}

// The pack's plugins that are installed on the device (never DeckyHub), and which of them are off or on.
export function packTargets(pack, installed) {
  const repos = new Set(pack?.repos || []);
  const match = installed.filter(
    (plugin) =>
      plugin.repo &&
      repos.has(plugin.repo.toLowerCase()) &&
      typeof plugin.pluginName === "string" &&
      plugin.pluginName.toLowerCase() !== "deckyhub",
  );
  return {
    found: match.length,
    enable: match.filter((plugin) => plugin.disabled).map((plugin) => plugin.pluginName),
    disable: match.filter((plugin) => !plugin.disabled).map((plugin) => plugin.pluginName),
  };
}

const validId = (id) => typeof id === "string" && VALID_ID.test(id);

// A button on a plugin's row: "Request enable for Name", which asks the device for the action.
function requestButton(document, label, plugin, onClick, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = translate(label);
  button.setAttribute("aria-label", translate(`${label} for ${plugin.name}`));
  if (className) button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

const notDeckyHub = (plugin) => typeof plugin.pluginName === "string" && plugin.pluginName.toLowerCase() !== "deckyhub";

// A plugin DeckyHub lists has a page here; the page is English only, and a preview site keeps its prefix.
const pageIdOf = (plugin) => [plugin.id, plugin.pageId].find(validId) ?? null;

function titleOf(document, plugin, pageId) {
  const title = document.createElement("strong");
  const label = plugin.disabled ? translate(`${plugin.name} (disabled)`) : plugin.name;
  if (!pageId) {
    title.textContent = label;
    return title;
  }
  const link = document.createElement("a");
  link.href = `${location.pathname.replace(/\/(?:uk\/)?paired-devices\/?(?:index\.html)?$/, "")}/plugins/${pageId}.html`;
  link.textContent = label;
  title.append(link);
  return title;
}

function repositoryOf(document, plugin, pageId) {
  const repository = document.createElement("span");
  if (typeof plugin.repo === "string" && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(plugin.repo)) {
    const link = document.createElement("a");
    link.href = `https://github.com/${plugin.repo}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = plugin.repo;
    repository.append(link);
  } else repository.textContent = translate(pageId ? "Repository unavailable" : "Not matched to the DeckyHub list");
  return repository;
}

// Builds the rows of the installed list. Each action button is added to actionButtons (the list enables and
// disables them together); the Request update buttons also go to updateRows.
function createRowBuilder({ document, request, actionButtons, updateRows }) {
  const actionsBox = () => {
    const actions = document.createElement("div");
    actions.className = "remote-actions";
    return actions;
  };
  const add = (actions, button) => {
    actions.append(button);
    actionButtons.push(button);
    return button;
  };
  const toggleButton = (plugin) => {
    const action = plugin.disabled ? "enable" : "disable";
    const label = plugin.disabled ? "Request enable" : "Request disable";
    return requestButton(document, label, plugin, () => request(null, action, [plugin.pluginName]));
  };
  // The device says the plugin came from the registry: it can be updated and uninstalled by its id.
  const identifiedActions = (plugin) => {
    const actions = actionsBox();
    add(actions, toggleButton(plugin));
    const update = add(actions, requestButton(document, "Request update", plugin, () => request(plugin.id, "update")));
    updateRows.push({ button: update, plugin });
    add(
      actions,
      requestButton(document, "Request uninstall", plugin, () => request(plugin.id, "uninstall"), "remote-danger"),
    );
    return [actions];
  };
  // DeckyHub cannot tell which repository this plugin came from, so it cannot install or
  // update it from here. Removing it only needs the name Decky Loader uses.
  const unmatchedActions = (plugin) => {
    const actions = actionsBox();
    add(actions, toggleButton(plugin));
    add(
      actions,
      requestButton(
        document,
        "Request uninstall",
        plugin,
        () => request(null, "uninstall", plugin.pluginName),
        "remote-danger",
      ),
    );
    return [actions, textLine(document, translate("Updates for this plugin come from its own page or your device."))];
  };
  return (plugin) => {
    const row = document.createElement("li");
    const pageId = pageIdOf(plugin);
    const version = textLine(document, translate(`Installed version · ${plugin.version}`));
    row.append(titleOf(document, plugin, pageId), version, repositoryOf(document, plugin, pageId));
    const verified = plugin.identityUnverified === false && validId(plugin.id) && notDeckyHub(plugin);
    if (verified) row.append(...identifiedActions(plugin));
    else if (plugin.pluginName && notDeckyHub(plugin)) row.append(...unmatchedActions(plugin));
    else row.append(textLine(document, translate("Manage DeckyHub on your device.")));
    return row;
  };
}

const validPlugin = (plugin) =>
  Boolean(plugin) &&
  typeof plugin.name === "string" &&
  typeof plugin.version === "string" &&
  (plugin.pluginName === null || typeof plugin.pluginName === "string") &&
  (plugin.disabled === undefined || typeof plugin.disabled === "boolean");

// Reads the device's installed plugins page by page; undefined when a newer load took over meanwhile.
async function fetchInstalled(loadPage, isStale) {
  const plugins = [];
  let offset = 0;
  for (;;) {
    const result = await loadPage(offset);
    if (isStale()) return undefined;
    if (!Array.isArray(result.plugins) || result.plugins.length > 20 || !result.plugins.every(validPlugin))
      throw new Error("Invalid plugin list from the device.");
    plugins.push(...result.plugins);
    if (plugins.length > 1000) throw new Error("Too many plugins to display.");
    if (result.nextOffset === null) return plugins;
    if (!result.plugins.length || !Number.isInteger(result.nextOffset) || result.nextOffset <= offset)
      throw new Error("Invalid plugin list page.");
    offset = result.nextOffset;
  }
}

export function createPluginList(root, { loadPage, request }) {
  const list = root.querySelector("#remote-plugins");
  const status = root.querySelector("#remote-plugins-status");
  const refresh = root.querySelector("#remote-plugins-refresh");
  const filter = root.querySelector("#remote-plugins-filter");
  const packFile = root.querySelector("#remote-pack");
  const packInfo = root.querySelector("#remote-pack-info");
  const packEnable = root.querySelector("#remote-pack-enable");
  const packDisable = root.querySelector("#remote-pack-disable");
  const document = root.ownerDocument;
  if (!list || !status || !refresh || !document) return { reset() {}, setEnabled() {}, load() {} };
  let generation = 0;
  let enabled = false;
  let loading = false;
  let installed = [];
  let pack; // { name, repos } from the picked pack file
  const actionButtons = [];
  // Request update is offered only for a plugin the device says has an update (docs/remote-updates.js);
  // until the device has said so, none is.
  const updateRows = [];
  let waiting = null; // lowercase names of the plugins with an update, or null when not known
  const buildRow = createRowBuilder({ document, request, actionButtons, updateRows });
  const showUpdates = () =>
    updateRows.forEach(({ button, plugin }) => {
      button.hidden = !waiting?.has(String(plugin.name).toLowerCase());
    });
  const clearList = () => {
    list.replaceChildren();
    actionButtons.length = 0;
    installed = [];
  };
  const updateButtons = () => {
    refresh.disabled = !enabled || loading;
    actionButtons.forEach((button) => {
      button.disabled = !enabled || loading;
    });
    if (packFile) packFile.disabled = !enabled || loading;
    const targets = packTargets(pack, installed);
    if (packEnable) packEnable.disabled = !enabled || loading || !targets.enable.length;
    if (packDisable) packDisable.disabled = !enabled || loading || !targets.disable.length;
    if (packInfo && pack) {
      packInfo.textContent = translate(
        `${pack.name}: ${targets.found} of ${pack.repos.length} plugins are installed on this device (${targets.enable.length} off, ${targets.disable.length} on).`,
      );
    }
  };
  packFile?.addEventListener("change", async () => {
    const file = packFile.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error("This file is too large to be a plugin pack.");
      pack = readPack(await file.text());
      updateButtons();
    } catch (error) {
      pack = undefined;
      if (packInfo)
        packInfo.textContent = translate(
          error instanceof SyntaxError ? "This is not a DeckyHub plugin pack." : error.message,
        );
      updateButtons();
    }
  });
  for (const [button, action] of [
    [packEnable, "enable"],
    [packDisable, "disable"],
  ]) {
    button?.addEventListener("click", () => {
      const names = packTargets(pack, installed)[action];
      if (names.length) request(null, action, names.slice(0, 50));
    });
  }
  const filterStatus = (words, shown) =>
    words.length ? `${shown} of ${list.children.length} plugins` : pluginCount(list.children.length);
  const applyFilter = () => {
    const words = (filter?.value || "").toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const row of list.children) {
      row.hidden = !words.every((word) => row.textContent.toLowerCase().includes(word));
      if (!row.hidden) shown++;
    }
    if (filter) {
      filter.hidden = list.children.length < 6;
      status.textContent = translate(filterStatus(words, shown));
    }
  };
  filter?.addEventListener("input", applyFilter);
  const decorate = async (rows, current) => {
    const info = await loadInfo();
    if (!info || current !== generation) return;
    for (const { row, plugin } of rows) {
      const record = typeof plugin.repo === "string" ? info.plugins[plugin.repo.toLowerCase()] : null;
      if (!record || !row.isConnected) continue;
      const note = document.createElement("div");
      note.className = "remote-info";
      note.append(...describe(document, record, info.warnings || {}));
      row.insertBefore(note, row.querySelector(".remote-actions"));
    }
    applyFilter();
  };
  const render = (plugins) => {
    clearList();
    updateRows.length = 0;
    installed = plugins;
    const pending = plugins.map((plugin) => ({ row: buildRow(plugin), plugin }));
    list.append(...pending.map(({ row }) => row));
    showUpdates();
    status.textContent = translate(plugins.length ? pluginCount(plugins.length) : "No installed plugins found.");
    updateButtons();
    applyFilter();
    decorate(pending, generation);
  };
  const load = async () => {
    if (!enabled || loading) return;
    const current = ++generation;
    loading = true;
    updateButtons();
    status.textContent = translate("Loading installed plugins…");
    try {
      const plugins = await fetchInstalled(loadPage, () => current !== generation);
      if (plugins) render(plugins);
    } catch (error) {
      if (current !== generation) return;
      clearList();
      status.textContent = translate(error instanceof Error ? error.message : "Unable to load installed plugins.");
    } finally {
      if (current === generation) {
        loading = false;
        updateButtons();
      }
    }
  };
  refresh.addEventListener("click", load);
  return {
    reset() {
      generation++;
      loading = false;
      clearList();
      status.textContent = translate("Pair a device to see its installed plugins.");
      updateButtons();
    },
    setEnabled(value) {
      enabled = value;
      updateButtons();
    },
    // The device's update summary (undefined when it could not be read).
    setUpdates(summary) {
      waiting =
        summary && summary.checkedAt !== null ? new Set(summary.updates.map((item) => item.name.toLowerCase())) : null;
      showUpdates();
    },
    load,
  };
}

