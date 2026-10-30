import { useQuickAccessVisible } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { useSyncExternalStore, type ReactNode } from "react";
import { getApps, getSettings } from "../api";
import { getUpdateCount, setUpdateCount, subscribeUpdateCount } from "../notify";
import { hydrate } from "../releases";
import { DeckyHubIcon } from "./DeckyHubIcon";

// DeckyHub's own icon in Steam's Quick Access tab strip (beside notifications,
// friends, settings, Decky...), added through Decky's tabs hook the way Decky adds
// its own tab. Older or newer Decky without the hook just keeps the plugin entry.
const TAB_ID = 0x444855; // "DHU"; clear of Steam's tabs and Decky's 999.

type TabsHook = { add(tab: { id: number; title: ReactNode; content: ReactNode; icon: ReactNode }): void; removeById(id: number): void };
const tabsHook = () => (window as { __TABS_HOOK_INSTANCE?: Partial<TabsHook> }).__TABS_HOOK_INSTANCE;

// Like Decky's own panel: the title stays at the top, the content renders only while shown.
function TabPanel({ children }: { children: ReactNode }) {
  const visible = useQuickAccessVisible();
  return (
    <>
      <div className={staticClasses.Title} style={{ position: "sticky", top: 0, paddingRight: 16 }}>DeckyHub</div>
      <div style={{ paddingTop: 16 }}>{visible && children}</div>
    </>
  );
}

// DeckyHub's icon, with a dot while any plugin has an update.
function TabIcon() {
  const updates = useSyncExternalStore(subscribeUpdateCount, getUpdateCount);
  return (
    <span className="deckyhub-tab-icon" style={{ position: "relative", display: "inline-flex", alignSelf: "center", lineHeight: 0 }}>
      <DeckyHubIcon />
      {updates > 0 && <span className="deckyhub-tab-dot" style={{ position: "absolute", top: -4, right: -6, width: 8, height: 8, borderRadius: "50%", background: "#ff8c1a", boxShadow: "0 0 0 2px #0e141b" }} />}
    </span>
  );
}

// The panel only checks releases while it's open, so check installed plugins once
// at startup too, for the dot to show before DeckyHub is first opened.
async function checkUpdates() {
  try {
    const [{ apps }, settings] = await Promise.all([getApps(), getSettings()]);
    const preferences = settings.repoSettings || {};
    const checked = await Promise.all(apps.filter((app) => app.installedVersion).map((app) => hydrate(app, false, preferences[app.repo])));
    setUpdateCount(checked.filter((app) => app.updateAvailable).length);
  } catch {
    // Offline or rate-limited: the panel's own check sets the dot later.
  }
}

export function addQuickAccessTab(content: ReactNode) {
  const hook = tabsHook();
  if (typeof hook?.add !== "function" || typeof hook.removeById !== "function") return;
  hook.removeById(TAB_ID); // a reload of DeckyHub shouldn't leave two
  hook.add({ id: TAB_ID, title: null, content: <TabPanel>{content}</TabPanel>, icon: <TabIcon /> });
  void checkUpdates();
}

export function removeQuickAccessTab() {
  tabsHook()?.removeById?.(TAB_ID);
}
