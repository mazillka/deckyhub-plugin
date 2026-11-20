import { Navigation } from "@decky/ui";
import type { SettingsTab } from "./components/settingsTabs";

// The tab Settings opens on next, for links into a particular one (the rate-limit
// banner's Open Settings goes to GitHub Access).
let nextTab: SettingsTab = "general";

export function openSettings(tab: SettingsTab = "general") {
  nextTab = tab;
  Navigation.Navigate("/deckyhub/settings");
}

// The tab Settings opens on now; the next opening starts on General again.
export function takeNextTab(): SettingsTab {
  const opening = nextTab;
  nextTab = "general";
  return opening;
}
