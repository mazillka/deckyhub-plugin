import { callable } from "@decky/api";
import type { Asset, App, Settings, Download, DeckyHubInfo, RepoPreference, RemoteInstallStatus } from "./types";

export const getApps = callable<[], { apps: App[] }>("get_apps");
export const getSettings = callable<[], Settings>("get_settings");
// Plugins picked in the Desktop Mode installer, waiting for DeckyHub to install them.
export const getPendingInstalls = callable<[], string[]>("get_pending_installs");
export const clearPendingInstalls = callable<[], { cleared: boolean }>("clear_pending_installs");
export const saveSettings = callable<[settings: Settings], Settings>("save_settings");
export const downloadAsset = callable<[asset: Asset, repo?: string], { jobId?: string; error?: string }>(
  "download_asset",
);
export const stageInstall = callable<[asset: Asset, repo: string, jobId: string], { path?: string; error?: string }>(
  "stage_install",
);
export const getDownload = callable<[jobId: string], Download>("get_download");
export const cancelDownload = callable<[jobId: string], { ok: boolean }>("cancel_download");
export const getDeckyHubInfo = callable<[], DeckyHubInfo>("get_deckyhub_info");

// GitHub sign-in by device code (github_auth.py).
export const startGithubSignIn = callable<
  [],
  { userCode: string; verificationUri: string; expiresIn: number; interval: number }
>("start_github_sign_in");
export const pollGithubSignIn = callable<
  [],
  { status: "none" | "pending" | "signed-in" | "expired" | "denied"; interval?: number; token?: string }
>("poll_github_sign_in");
export const cancelGithubSignIn = callable<[], { cancelled: boolean }>("cancel_github_sign_in");
export const addCustomRepo = callable<[repo: string], { added: boolean; repo: string }>("add_custom_repo");
export const removeCustomRepo = callable<[repo: string], { removed: boolean; repo: string }>("remove_custom_repo");
export const exportCustomRepos = callable<[], { path: string }>("export_custom_repos");
export const importCustomRepos = callable<[path: string], { added: string[] }>("import_custom_repos");
export const readTokenFile = callable<[path: string], { token: string | null }>("read_token_file");
export const addCustomRegistry = callable<
  [url: string],
  { added: boolean; url: string; apps?: number; reason?: string; detail?: string }
>("add_custom_registry");
export const removeCustomRegistry = callable<[url: string], { removed: boolean; url: string }>(
  "remove_custom_registry",
);
export const refreshRegistry = callable<[], { apps: number }>("refresh_registry");
export const exportLogs = callable<[], { path: string }>("export_logs");
export const logFrontend = callable<[message: string], void>("log_frontend");
export const clearDownloads = callable<[], { removed: number }>("clear_downloads");
export const listDownloads = callable<[], { items: { name: string; directory: boolean }[] }>("list_downloads");
export const saveRepoSettings = callable<[repo: string, values: RepoPreference], RepoPreference>("save_repo_settings");

export const getRemoteInstallStatus = callable<[], RemoteInstallStatus>("get_remote_install_status");
export const setRemoteInstallEnabled = callable<[enabled: boolean], RemoteInstallStatus>("set_remote_install_enabled");
export const beginRemotePairing = callable<[], { code: string; pairingToken: string; expiresInSeconds: number }>(
  "begin_remote_pairing",
);
export const decideRemotePairing = callable<[pairId: string, approve: boolean], { status: string }>(
  "decide_remote_pairing",
);
export const setRemoteDeviceTrusted = callable<[deviceId: string, trusted: boolean], { id: string; trusted: boolean }>(
  "set_remote_device_trusted",
);
export const revokeRemoteDevice = callable<[deviceId: string], { revoked: boolean }>("revoke_remote_device");
export const decideRemoteRequest = callable<[requestId: string, approve: boolean], { id: string; status: string }>(
  "decide_remote_request",
);
export const claimRemoteRequest = callable<
  [requestId: string],
  {
    id: string;
    pluginId: string | null;
    releaseTag?: string | null;
    status: string;
    action?: "install" | "update" | "uninstall";
    repo?: string | null;
    pluginName?: string | null;
    installedVersion?: string | null;
  }
>("claim_remote_request");
export const finishRemoteRequest = callable<[requestId: string, success: boolean], { id: string; status: string }>(
  "finish_remote_request",
);

export const getRemoteInstalledVersion = callable<[pluginName: string], { version: string | null }>(
  "get_remote_installed_version",
);

export const REGISTRY_UPDATED = "deckyhub-registry-updated";

export const finishRemoteRequestUnknown = callable<[requestId: string], { id: string; status: string }>(
  "finish_remote_request_unknown",
);
