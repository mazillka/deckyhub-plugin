import { useState } from "react";
import { saveRepoSettings } from "../api";
import type { App, RepoPreference } from "../types";

// One plugin's saved preferences as its window changes them: update channel, skipped version,
// pinned version and trusted identity. Each change is saved and reported to the card behind the window.
export function useRepoPreference(
  app: App,
  initial: RepoPreference,
  onPreferenceChange: (preference: RepoPreference) => void,
) {
  const [preference, setPreference] = useState<RepoPreference>(initial);
  const channel = app.prereleaseOnly ? "prerelease" : preference.channel;
  const change = (next: RepoPreference) => {
    setPreference(next);
    onPreferenceChange(next);
    void saveRepoSettings(app.repo, next);
  };
  // Skip this version: the card's newest release stops counting as an update (a plugin
  // whose release never changes its own version, say) until a newer one comes out.
  const latest = app.channel === channel ? app.latestVersion : null;
  const skipped = Boolean(latest && preference.skipVersion === latest);
  const canSkip = Boolean(latest && (skipped || app.updateAvailable || initial.skipVersion === latest));
  const toggleSkip = () => {
    const { skipVersion: _, ...rest } = preference;
    change(skipped ? rest : { ...rest, skipVersion: latest! });
  };
  // Pin: keep the installed version; no update is offered until it is unpinned.
  const pinned = Boolean(preference.pinVersion);
  const togglePin = () => {
    const { pinVersion: _, ...rest } = preference;
    change(pinned ? rest : { ...rest, pinVersion: app.installedVersion! });
  };
  const trust = (name: string) => change({ ...preference, trustedIdentity: name });
  const stopTrusting = () => {
    const { trustedIdentity: _, ...rest } = preference;
    change(rest);
  };
  return { preference, channel, change, latest, skipped, canSkip, toggleSkip, pinned, togglePin, trust, stopTrusting };
}
