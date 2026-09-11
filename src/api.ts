import { callable } from "@decky/api";
import type { Asset, App, Settings, Download, DeckyHubInfo, ManagedRepo, RepoPreference } from "./types";

export const getApps = callable<[], { apps: App[] }>("get_apps");
export const getSettings = callable<[], Settings>("get_settings");
export const saveSettings = callable<[settings: Settings], Settings>("save_settings");
export const downloadAsset = callable<[asset: Asset, repo?: string], { jobId?: string }>("download_asset");
export const getDownload = callable<[jobId: string], Download>("get_download");
export const cancelDownload = callable<[jobId: string], { ok: boolean }>("cancel_download");
export const getDeckyHubInfo = callable<[], DeckyHubInfo>("get_deckyhub_info");
export const installDeckyHubUpdate = callable<[asset: Asset], { jobId?: string }>("install_deckyhub_update");
export const addCustomRepo = callable<[repo: string], { added: boolean; repo: string }>("add_custom_repo");
export const getCustomRepos = callable<[], { repos: ManagedRepo[] }>("get_custom_repos");
export const removeCustomRepo = callable<[repo: string], { removed: boolean; repo: string }>("remove_custom_repo");
export const exportCustomRepos = callable<[], { path: string }>("export_custom_repos");
export const importCustomRepos = callable<[path: string], { added: string[] }>("import_custom_repos");
export const queueDownloads = callable<[items: { asset: Asset; repo?: string }[]], { jobIds: string[] }>("queue_downloads");
export const refreshRegistry = callable<[], { count: number }>("refresh_registry");
export const saveRepoSettings = callable<[repo: string, values: RepoPreference], RepoPreference>("save_repo_settings");

export const REGISTRY_UPDATED = "deckyhub-registry-updated";
