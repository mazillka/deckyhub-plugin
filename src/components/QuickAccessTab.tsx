import { useQuickAccessVisible } from "@decky/api";
import { staticClasses } from "@decky/ui";
import type { ReactNode } from "react";
import { FaGithub } from "react-icons/fa";

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

export function addQuickAccessTab(content: ReactNode) {
  const hook = tabsHook();
  if (typeof hook?.add !== "function" || typeof hook.removeById !== "function") return;
  hook.removeById(TAB_ID); // a reload of DeckyHub shouldn't leave two
  hook.add({ id: TAB_ID, title: null, content: <TabPanel>{content}</TabPanel>, icon: <FaGithub /> });
}

export function removeQuickAccessTab() {
  tabsHook()?.removeById?.(TAB_ID);
}
