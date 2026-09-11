import { callable, definePlugin, fetchNoCors, FileSelectionType, openFilePicker, routerHook, toaster } from "@decky/api";
import { ButtonItem, DropdownItem, Navigation, PanelSection, PanelSectionRow, ScrollPanel, staticClasses, TextField, ToggleField } from "@decky/ui";
import { useEffect, useState } from "react";
import { FaDownload, FaGithub, FaSync } from "react-icons/fa";

type Asset = { name: string; url: string; size: number; sha256?: string };
type App = { id: string; name: string; repo: string; category: string; source: "releases" | "tags"; versionStrategy: "semver" | "release-date" | "custom"; versionPattern?: string; releaseTagInclude?: string; asset: { include: string[]; exclude: string[] }; installedVersion?: string | null; latestVersion?: string | null; publishedAt?: string | null; releaseUrl?: string | null; assets: Asset[]; updateAvailable?: boolean | null; error?: string | null };
type UpdateChannel = "stable" | "prerelease";
type Settings = { verifySha256: boolean; overwriteExisting: boolean; downloadLocation: "plugins" | "downloads"; updateChannel: UpdateChannel };
type Download = { state: string; filename?: string; received?: number; total?: number; path?: string; error?: string };
type DeckyHubInfo = { version: string };
type DeckyHubRelease = { version?: string; asset?: Asset; url?: string; error?: string };
type View = "updates" | "installed" | "discover";
type SearchRepo = { full_name: string; description?: string; stargazers_count?: number };
type ManagedRepo = { repo: string };
const viewInfo: Record<View, { title: string; description: string; empty: string }> = {
  updates: { title: "Updates", description: "Updates available for your installed tools.", empty: "Everything installed is up to date." },
  installed: { title: "Installed", description: "Supported tools detected on this Steam Deck.", empty: "No supported tools are installed yet." },
  discover: { title: "Discover", description: "Browse supported GitHub projects and their ZIP releases.", empty: "No repositories are available." },
};

const getApps = callable<[], { apps: App[] }>("get_apps");
const getSettings = callable<[], Settings>("get_settings");
const saveSettings = callable<[settings: Settings], Settings>("save_settings");
const downloadAsset = callable<[asset: Asset], { jobId?: string }>("download_asset");
const getDownload = callable<[jobId: string], Download>("get_download");
const cancelDownload = callable<[jobId: string], { ok: boolean }>("cancel_download");
const getDeckyHubInfo = callable<[], DeckyHubInfo>("get_deckyhub_info");
const installDeckyHubUpdate = callable<[asset: Asset], { jobId?: string }>("install_deckyhub_update");
const addCustomRepo = callable<[repo: string], { added: boolean; repo: string }>("add_custom_repo");
const getCustomRepos = callable<[], { repos: ManagedRepo[] }>("get_custom_repos");
const removeCustomRepo = callable<[repo: string], { removed: boolean; repo: string }>("remove_custom_repo");
const exportCustomRepos = callable<[], { path: string }>("export_custom_repos");
const importCustomRepos = callable<[path: string], { added: string[] }>("import_custom_repos");
const CACHE_TTL = 15 * 60 * 1000;
const REGISTRY_UPDATED = "deckyhub-registry-updated";
const readableBytes = (bytes = 0) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const status = (app: App) => !app.installedVersion ? "Not installed" : app.updateAvailable ? "Update available" : app.updateAvailable === false ? "Up to date" : "Installed";
const keyFor = (app: App) => `deckyhub-release:${app.repo}:${app.source}`;

function cached(app: App, force: boolean): any | null {
  if (force) return null;
  try { const value = JSON.parse(localStorage.getItem(keyFor(app)) || "null"); return value && Date.now() - value.at < CACHE_TTL ? value.data : null; } catch { return null; }
}

function versionNumbers(value: string, pattern?: string) {
  const match = pattern ? value.match(new RegExp(pattern, "i")) : value.match(/v?(\d+(?:\.\d+)+)/i);
  return match ? (match[1] || match[0]).replace(/^v/i, "").split(".").map(Number) : null;
}

function isUpdate(app: App, latest: string | null, publishedAt: string | null) {
  if (!app.installedVersion || (!latest && !publishedAt)) return null;
  if (app.versionStrategy === "release-date") return publishedAt && !Number.isNaN(Date.parse(app.installedVersion)) ? Date.parse(app.installedVersion) < Date.parse(publishedAt) : null;
  const installed = versionNumbers(app.installedVersion, app.versionStrategy === "custom" ? app.versionPattern : undefined);
  const target = latest ? versionNumbers(latest, app.versionStrategy === "custom" ? app.versionPattern : undefined) : null;
  if (!installed || !target) return null;
  for (let i = 0; i < Math.max(installed.length, target.length); i++) if ((installed[i] || 0) !== (target[i] || 0)) return (installed[i] || 0) < (target[i] || 0);
  return false;
}

function matchingAssets(app: App, assets: any[]): Asset[] {
  const include = app.asset.include.map((word) => word.toLowerCase()), exclude = app.asset.exclude.map((word) => word.toLowerCase());
  return assets.filter((asset) => { const name = String(asset.name || "").toLowerCase(); return name.endsWith(".zip") && !exclude.some((word) => name.includes(word)) && (!include.length || include.every((word) => name.includes(word))); }).map((asset) => ({ name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256: String(asset.digest || "").replace(/^sha256:/, "") || undefined }));
}

async function latestDeckyHubRelease(channel: UpdateChannel): Promise<DeckyHubRelease> {
  try {
    const endpoint = channel === "prerelease" ? "releases?per_page=20" : "releases/latest";
    const response = await fetchNoCors(`https://api.github.com/repos/mazillka/deckyhub-plugin/${endpoint}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    const body = await response.json(), release = Array.isArray(body) ? body.find((item) => item.prerelease && !item.draft) : body, asset = (release?.assets || []).find((item: any) => /^DeckyHub-.*\.zip$/i.test(String(item.name))), sha256 = String(asset?.digest || "").replace(/^sha256:/, "");
    if (!asset || !String(asset.name).startsWith("DeckyHub-") || !/^[0-9a-f]{64}$/i.test(sha256)) throw new Error("DeckyHub release ZIP with SHA-256 checksum not found");
    return { version: release.tag_name || release.name, url: release.html_url, asset: { name: asset.name, url: asset.browser_download_url, size: asset.size || 0, sha256 } };
  } catch (error) { return { error: String(error) }; }
}

async function hydrate(app: App, force: boolean): Promise<App> {
  try {
    let release = cached(app, force);
    if (!release) {
      const endpoint = app.source === "tags" ? `/repos/${app.repo}/tags?per_page=1` : app.releaseTagInclude ? `/repos/${app.repo}/releases?per_page=20` : `/repos/${app.repo}/releases/latest`;
      const response = await fetchNoCors(`https://api.github.com${endpoint}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
      const body = await response.json();
      release = Array.isArray(body) ? app.releaseTagInclude ? body.find((item) => String(item.tag_name || "").toLowerCase().includes(app.releaseTagInclude!.toLowerCase())) : { tag_name: body[0]?.name, html_url: `https://github.com/${app.repo}/releases`, assets: [] } : body;
      if (!release) throw new Error("No matching release found");
      localStorage.setItem(keyFor(app), JSON.stringify({ at: Date.now(), data: release }));
    }
    const latestVersion = release.tag_name || release.name || null, publishedAt = release.published_at || null;
    return { ...app, latestVersion, publishedAt, releaseUrl: release.html_url || `https://github.com/${app.repo}/releases`, assets: matchingAssets(app, release.assets || []), updateAvailable: isUpdate(app, latestVersion, publishedAt) };
  } catch (error) { return { ...app, error: String(error) }; }
}

function AppCard({ app, job, onDownload, onCancel }: { app: App; job?: { id: string; state: Download } | null; onDownload: (asset: Asset) => void; onCancel: (jobId: string) => void }) {
  const active = job && app.assets.some((asset) => asset.name === job.state.filename) ? job : null;
  return <PanelSection title={`${app.name} · ${app.category}`}><PanelSectionRow><div>{status(app)}<br /><small>Installed: {app.installedVersion ?? "—"} · Latest: {app.latestVersion ?? "—"}</small>{app.error && <><br /><small>{app.error}</small></>}</div></PanelSectionRow>
    {active && <PanelSectionRow><div><strong>{active.state.state === "complete" ? "Download complete" : active.state.state === "error" ? "Download failed" : "Downloading…"}</strong><br /><small>{readableBytes(active.state.received)} / {active.state.total ? readableBytes(active.state.total) : "unknown size"}{active.state.total ? ` · ${Math.round((100 * (active.state.received ?? 0)) / active.state.total)}%` : ""}</small>{active.state.error && <><br /><small>{active.state.error}</small></>}{active.state.state === "downloading" && <ButtonItem layout="below" onClick={() => onCancel(active.id)}>Cancel download</ButtonItem>}</div></PanelSectionRow>}
    {app.assets[0] && <PanelSectionRow><ButtonItem layout="below" onClick={() => onDownload(app.assets[0])}><FaDownload /> Download latest ({app.assets[0].name})</ButtonItem></PanelSectionRow>}
    {app.assets.slice(1, 4).map((asset) => <PanelSectionRow key={asset.name}><ButtonItem layout="below" onClick={() => onDownload(asset)}>{`${asset.name} (${readableBytes(asset.size)})`}</ButtonItem></PanelSectionRow>)}
    {app.releaseUrl && <PanelSectionRow><ButtonItem layout="below" onClick={() => Navigation.NavigateToExternalWeb(app.releaseUrl!)}>Open release page</ButtonItem></PanelSectionRow>}</PanelSection>;
}

function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({ verifySha256: true, overwriteExisting: true, downloadLocation: "plugins", updateChannel: "stable" });
  const [deckyHubInfo, setDeckyHubInfo] = useState<DeckyHubInfo>({ version: "unknown" }), [deckyHubRelease, setDeckyHubRelease] = useState<DeckyHubRelease>({});
  const [updateJob, setUpdateJob] = useState<{ id: string; state: Download } | null>(null);
  const [query, setQuery] = useState(""), [results, setResults] = useState<SearchRepo[]>([]), [searchError, setSearchError] = useState<string | null>(null), [customRepos, setCustomRepos] = useState<ManagedRepo[]>([]);
  const refreshRepos = () => void getCustomRepos().then((result) => setCustomRepos(result.repos));
  useEffect(() => { void getSettings().then(setSettings); void getDeckyHubInfo().then(setDeckyHubInfo); refreshRepos(); }, []);
  useEffect(() => { if (!updateJob || !["queued", "downloading"].includes(updateJob.state.state)) return; const timer = window.setInterval(() => void getDownload(updateJob.id).then((state) => setUpdateJob({ id: updateJob.id, state })), 500); return () => window.clearInterval(timer); }, [updateJob]);
  useEffect(() => { if (updateJob?.state.state === "complete") toaster.toast({ title: "DeckyHub update downloaded", body: "Decky → Developer → Install Plugin from ZIP" }); }, [updateJob?.id, updateJob?.state.state]);
  const search = async () => { try { setSearchError(null); const response = await fetchNoCors(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10`, { headers: { Accept: "application/vnd.github+json" } }); if (!response.ok) throw new Error(`GitHub API returned ${response.status}`); setResults((await response.json()).items || []); } catch (error) { setSearchError(String(error)); } };
  const add = async (repo: string) => { const result = await addCustomRepo(repo); if (result.added) { refreshRepos(); window.dispatchEvent(new Event(REGISTRY_UPDATED)); } toaster.toast({ title: "DeckyHub", body: result.added ? `${repo} added to Discover.` : `${repo} is already in DeckyHub.` }); };
  const remove = async (repo: string) => { await removeCustomRepo(repo); refreshRepos(); window.dispatchEvent(new Event(REGISTRY_UPDATED)); };
  const exportList = async () => { const result = await exportCustomRepos(); toaster.toast({ title: "DeckyHub", body: `Exported to ${result.path}` }); };
  const importList = async () => { const file = await openFilePicker(FileSelectionType.FILE, "/home/deck/Downloads", true, false, undefined, ["json"]); const result = await importCustomRepos(file.realpath); refreshRepos(); if (result.added.length) window.dispatchEvent(new Event(REGISTRY_UPDATED)); toaster.toast({ title: "DeckyHub", body: result.added.length ? `Imported: ${result.added.join(", ")}` : "No new repositories to import." }); };
  const installUpdate = async (asset: Asset) => { const result = await installDeckyHubUpdate(asset); if (result.jobId) setUpdateJob({ id: result.jobId, state: { state: "queued", filename: asset.name, total: asset.size } }); };
return <><PanelSection title="DeckyHub update"><PanelSectionRow>Installed: {deckyHubInfo.version}{deckyHubRelease.version && ` · Latest: ${deckyHubRelease.version}`}{deckyHubRelease.error && <><br /><small>{deckyHubRelease.error}</small></>}</PanelSectionRow><PanelSectionRow><DropdownItem label="Update channel" rgOptions={[{ label: "Stable releases", data: "stable" }, { label: "Pre-releases", data: "prerelease" }]} selectedOption={settings.updateChannel} onChange={({ data }) => setSettings({ ...settings, updateChannel: data })} /></PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => void latestDeckyHubRelease(settings.updateChannel).then(setDeckyHubRelease)}>Check DeckyHub update</ButtonItem></PanelSectionRow>{deckyHubRelease.asset && <PanelSectionRow><ButtonItem layout="below" onClick={() => void installUpdate(deckyHubRelease.asset!)}>Download {deckyHubRelease.version} update</ButtonItem></PanelSectionRow>}{updateJob && <PanelSectionRow>{updateJob.state.filename}: {updateJob.state.state} {updateJob.state.total ? `(${Math.round((100 * (updateJob.state.received ?? 0)) / updateJob.state.total)}%)` : ""}{updateJob.state.state === "complete" && <><br /><small>Downloaded to /home/deck/Downloads. Install it from Decky → Developer → Install Plugin from ZIP.</small></>}{updateJob.state.error && <><br /><small>{updateJob.state.error}</small></>}{["queued", "downloading"].includes(updateJob.state.state) && <ButtonItem layout="below" onClick={() => void cancelDownload(updateJob.id)}>Cancel update</ButtonItem>}</PanelSectionRow>}{deckyHubRelease.url && <PanelSectionRow><ButtonItem layout="below" onClick={() => Navigation.NavigateToExternalWeb(deckyHubRelease.url!)}>Open release page</ButtonItem></PanelSectionRow>}</PanelSection><PanelSection title="Add GitHub repository"><PanelSectionRow><TextField label="Search GitHub" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => void search()} disabled={!query.trim()}>Search repositories</ButtonItem></PanelSectionRow>{searchError && <PanelSectionRow>{searchError}</PanelSectionRow>}{results.map((repo) => <PanelSectionRow key={repo.full_name}><ButtonItem layout="below" onClick={() => void add(repo.full_name)}>{repo.full_name}<br /><small>{repo.description || "No description"} · ★ {repo.stargazers_count ?? 0}</small></ButtonItem></PanelSectionRow>)}</PanelSection><PanelSection title="Managed repositories"><PanelSectionRow><ButtonItem layout="below" onClick={() => void exportList()}>Export repository list</ButtonItem></PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => void importList()}>Import repository list</ButtonItem></PanelSectionRow>{customRepos.map((item) => <PanelSectionRow key={item.repo}><ButtonItem layout="below" onClick={() => void remove(item.repo)}>Remove {item.repo}</ButtonItem></PanelSectionRow>)}{!customRepos.length && <PanelSectionRow>No custom repositories yet.</PanelSectionRow>}</PanelSection><PanelSection title="Download settings"><PanelSectionRow>Choose where release ZIP files are saved.</PanelSectionRow><PanelSectionRow><DropdownItem label="Download folder" rgOptions={[{ label: "/home/deck/Downloads/plugins (default)", data: "plugins" }, { label: "/home/deck/Downloads", data: "downloads" }]} selectedOption={settings.downloadLocation} onChange={({ data }) => setSettings({ ...settings, downloadLocation: data })} /></PanelSectionRow><PanelSectionRow><ToggleField label="Verify SHA256 when available" checked={settings.verifySha256} onChange={(checked) => setSettings({ ...settings, verifySha256: checked })} /></PanelSectionRow><PanelSectionRow><ToggleField label="Overwrite existing files" checked={settings.overwriteExisting} onChange={(checked) => setSettings({ ...settings, overwriteExisting: checked })} /></PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={async () => { setSettings(await saveSettings(settings)); toaster.toast({ title: "DeckyHub", body: "Settings saved." }); }}>Save settings</ButtonItem></PanelSectionRow></PanelSection></>;
}

function Content({ fullPage }: { fullPage?: View }) {
  const [apps, setApps] = useState<App[]>([]), [view] = useState<View>(fullPage ?? "updates"), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState<string | null>(null);
  const [job, setJob] = useState<{ id: string; state: Download } | null>(null);
  const load = async (force = false) => { setLoading(true); try { const local = (await getApps()).apps; setApps(local); setLoadError(null); setLoading(false); setApps(await Promise.all(local.map((app) => hydrate(app, force)))); } catch (error) { setLoadError(String(error)); setLoading(false); } };
  useEffect(() => { const refresh = () => void load(true); void load(); window.addEventListener(REGISTRY_UPDATED, refresh); return () => window.removeEventListener(REGISTRY_UPDATED, refresh); }, []);
  useEffect(() => { if (!job || !["queued", "downloading"].includes(job.state.state)) return; const timer = window.setInterval(() => void getDownload(job.id).then((state) => setJob({ id: job.id, state })), 500); return () => window.clearInterval(timer); }, [job]);
  const startDownload = async (asset: Asset) => { const result = await downloadAsset(asset); if (result.jobId) setJob({ id: result.jobId, state: { state: "queued" } }); };
const list = (filter: (app: App) => boolean, info: typeof viewInfo[View]) => <>{loading && <PanelSection title="Loading DeckyHub…" ><PanelSectionRow>Reading installed tools and release information.</PanelSectionRow></PanelSection>}{loadError && <PanelSection title="Could not load DeckyHub"><PanelSectionRow>{loadError}</PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => void load(true)}>Try again</ButtonItem></PanelSectionRow></PanelSection>}{!loading && !loadError && <><PanelSection title={info.title}><PanelSectionRow>{info.description}</PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => void load(true)}><FaSync /> Refresh releases</ButtonItem></PanelSectionRow>{job && <PanelSectionRow><div><strong>{job.state.filename ?? "Download"}</strong><br /><small>{job.state.state} {job.state.total ? `· ${Math.round((100 * (job.state.received ?? 0)) / job.state.total)}%` : ""}</small>{job.state.state === "downloading" && <ButtonItem layout="below" onClick={() => void cancelDownload(job.id)}>Cancel download</ButtonItem>}</div></PanelSectionRow>}</PanelSection>{apps.filter(filter).map((app) => <AppCard key={app.id} app={app} job={job} onDownload={(asset) => void startDownload(asset)} onCancel={(jobId) => void cancelDownload(jobId)} />)}{!apps.filter(filter).length && <PanelSection title={info.empty}><PanelSectionRow>Use Discover to browse the registry.</PanelSectionRow></PanelSection>}</>}</>;
  const navigation = <PanelSection title="DeckyHub"><PanelSectionRow><ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/updates")}>Updates</ButtonItem></PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/installed")}>Installed</ButtonItem></PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/discover")}>Discover</ButtonItem></PanelSectionRow><PanelSectionRow><ButtonItem layout="below" onClick={() => Navigation.Navigate("/deckyhub/settings")}>Settings</ButtonItem></PanelSectionRow></PanelSection>;
  const page = view === "updates" ? list((app) => app.updateAvailable === true, viewInfo.updates) : view === "installed" ? list((app) => Boolean(app.installedVersion), viewInfo.installed) : list(() => true, viewInfo.discover);
  return fullPage ? page : navigation;
}

export default definePlugin(() => { const fullscreen = (view: View) => <ScrollPanel><div style={{ paddingTop: 48 }}><Content fullPage={view} /></div></ScrollPanel>; routerHook.addRoute("/deckyhub/updates", () => fullscreen("updates")); routerHook.addRoute("/deckyhub/installed", () => fullscreen("installed")); routerHook.addRoute("/deckyhub/discover", () => fullscreen("discover")); routerHook.addRoute("/deckyhub/settings", () => <ScrollPanel><div style={{ paddingTop: 48 }}><SettingsPage /></div></ScrollPanel>); return { name: "DeckyHub", titleView: <div className={staticClasses.Title}>DeckyHub</div>, content: <Content />, icon: <FaGithub />, onDismount() { ["/deckyhub/updates", "/deckyhub/installed", "/deckyhub/discover", "/deckyhub/settings"].forEach((path) => routerHook.removeRoute(path)); } }; });
