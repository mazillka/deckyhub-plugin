import { useQuickAccessVisible } from "@decky/api";
import { Focusable, NavEntryPositionPreferences, staticClasses } from "@decky/ui";
import { useSyncExternalStore, type ReactNode } from "react";
import { getApps, getSettings } from "../api";
import { getUpdateCount, notifyUpdates, subscribeUpdateCount } from "../notify";
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
      {/* Right from the tab strip enters at the top. Without this Steam picks whatever is
          level with DeckyHub's icon, low in the strip: the Manage button (seen on a Deck). */}
      <Focusable navEntryPreferPosition={NavEntryPositionPreferences.FIRST} style={{ paddingTop: 16 }}>{visible && children}</Focusable>
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

// The panel only checks releases while it's open, so check installed plugins at
// startup and every few hours too: the dot (and the "Updates available" toast, once
// per new set of updates) then shows without opening DeckyHub. Through the release
// cache, so this costs no GitHub requests for the official list.
const CHECK_EVERY = 3 * 60 * 60 * 1000;
let checkTimer = 0;
async function checkUpdates() {
  try {
    const [{ apps }, settings] = await Promise.all([getApps(), getSettings()]);
    const preferences = settings.repoSettings || {};
    notifyUpdates(await Promise.all(apps.filter((app) => app.installedVersion).map((app) => hydrate(app, false, preferences[app.repo]))));
  } catch {
    // Offline or rate-limited: the next check, or the panel's own, sets the dot.
  }
}

let tabContent: ReactNode = null;

// The background checks run whenever Decky has the tabs hook, shown or not: the
// "Updates available" toast still comes with the tab hidden.
export function addQuickAccessTab(content: ReactNode) {
  const hook = tabsHook();
  if (typeof hook?.add !== "function" || typeof hook.removeById !== "function") return;
  tabContent = content;
  // Settings' "DeckyHub tab in Quick Access": on unless turned off, and on if they can't be read.
  void getSettings().then((settings) => setQuickAccessTab(settings.quickAccessTab !== false), () => setQuickAccessTab(true));
  void checkUpdates();
  window.clearInterval(checkTimer);
  checkTimer = window.setInterval(() => void checkUpdates(), CHECK_EVERY);
}

// Shows or hides the tab; DeckyHub stays in Decky's plugin list either way.
export function setQuickAccessTab(shown: boolean) {
  const hook = tabsHook();
  if (typeof hook?.add !== "function" || typeof hook.removeById !== "function" || !tabContent) return;
  hook.removeById(TAB_ID); // a reload of DeckyHub shouldn't leave two
  if (shown) hook.add({ id: TAB_ID, title: null, content: <TabPanel>{tabContent}</TabPanel>, icon: <TabIcon /> });
}

export function removeQuickAccessTab() {
  window.clearInterval(checkTimer);
  tabsHook()?.removeById?.(TAB_ID);
  tabContent = null;
}
