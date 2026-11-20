import { toaster } from "@decky/api";
import { useState } from "react";
import { downloadAsset, getSettings, saveSettings } from "../api";
import { showDownloadModal } from "../components/DownloadProgress";
import { useReleasePicker } from "../components/VersionPickerPanel";
import type { TFunc } from "../i18n/en";
import type { Asset, DeckyHubInfo, DeckyHubReleaseOption, UpdateChannel } from "../types";
import {
  getDeckyBackend,
  installDeckyPlugin,
  listDeckyHubReleases,
  resolveDeckyHubInstallType,
  setRegistryChannel,
} from "../utils";

const PLUGIN_NAME = "DeckyHub";

// Queues a DeckyHub release ZIP into the shared download window; shared by
// the update window's Download ZIP and X on either Update button.
export async function downloadDeckyHubZip(t: TFunc, asset: Asset, onSettled?: () => void): Promise<void> {
  const result = await downloadAsset(asset, "mazillka/deckyhub-plugin");
  if (result.error) throw new Error(result.error);
  if (result.jobId)
    showDownloadModal(t, result.jobId, { state: "queued", filename: asset.name, total: asset.size }, onSettled);
}

// DeckyHub's own update window: the plugin channel and release list, the registry's channel,
// and what Update, Download ZIP and Check for Updates do.
export function useDeckyHubUpdate(o: {
  t: TFunc;
  info: DeckyHubInfo;
  channel: UpdateChannel;
  registryChannel: UpdateChannel;
  onCheckUpdate: (channel: UpdateChannel) => void;
  onChannelChange: (channel: UpdateChannel) => void;
  closeModal?: () => void;
}) {
  const { t, info, closeModal } = o;
  const [channel, setChannel] = useState(o.channel);
  const [registryChannel, setRegistryChannelState] = useState(o.registryChannel);
  const picker = useReleasePicker(listDeckyHubReleases, channel);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selfUpdateError, setSelfUpdateError] = useState<string | null>(null);

  const refresh = async () => {
    setChecking(true);
    try {
      await picker.load(true);
    } finally {
      setChecking(false);
    }
    // Reads the release list load(true) just cached, to update the panel button.
    o.onCheckUpdate(channel);
  };

  const changeChannel = (next: UpdateChannel) => {
    setChannel(next);
    o.onChannelChange(next);
    picker.setSelectedTag("");
    void getSettings().then((settings) => saveSettings({ ...settings, updateChannel: next }));
  };

  // Which branch of the official registry DeckyHub reads: main, or develop for changes
  // that are still being tested (main's is used whenever develop's can't be read).
  // The backend reloads the list and tells open pages to reload (registry_updated);
  // they then read the matching release index.
  const changeRegistryChannel = (next: UpdateChannel) => {
    setRegistryChannelState(next);
    void getSettings()
      .then((settings) => saveSettings({ ...settings, registryChannel: next }))
      .then((saved) => setRegistryChannel(saved.registryChannel));
  };

  // Every action but Check for Updates and Download ZIP closes this window;
  // Decky's own confirm/progress dialog takes over the install.
  const selfUpdate = (release: DeckyHubReleaseOption) => {
    if (!release.asset) return;
    if (!getDeckyBackend()) {
      setSelfUpdateError(t("settings.selfUpdateUnavailable"));
      return;
    }
    closeModal?.();
    installDeckyPlugin(
      release.asset,
      "mazillka/deckyhub-plugin",
      PLUGIN_NAME,
      release.tag,
      resolveDeckyHubInstallType(release.tag, info.version),
    ).catch((error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }));
  };

  const downloadZip = async (asset: Asset) => {
    try {
      setDownloading(true);
      await downloadDeckyHubZip(t, asset, () => setDownloading(false));
    } catch (error) {
      setDownloading(false);
      setSelfUpdateError(String(error));
    }
  };

  return {
    picker,
    channel,
    registryChannel,
    checking,
    selfUpdateError,
    busy: checking || downloading || picker.loading,
    refresh,
    changeChannel,
    changeRegistryChannel,
    selfUpdate,
    downloadZip,
  };
}
