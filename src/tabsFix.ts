// Decky Loader's tabs hook (window.__TABS_HOOK_INSTANCE) fills Steam's Quick Access tab strip in render(): when the
// number of Decky tabs already in the strip differs from the number it knows, it adds ALL of them again. A tab added
// once the strip has rendered (DeckyHub's own, after its settings load) therefore repeats every Decky tab's icon, and
// since the strip keeps the extra ones, again on every opening of the menu (decky-loader#1014, closed as unsupported).
//
// This wraps whatever render() the hook has now (Decky's, or another plugin's wrapper such as Panel de Control's),
// lets it run as it always did, then removes only exact repeats: a second tab with the same key. It never removes or
// rebuilds a tab that appears once, so tabs other plugins add stay untouched. A repeat of DeckyHub's own tab left by an
// earlier load of DeckyHub is kept as the single copy and gets the current panel. Another plugin wrapping render()
// later calls through this one; taking it off then just turns it into a pass-through.
type StripTab = { key?: number; decky?: boolean; title?: unknown; tab?: unknown; panel?: unknown };
type HookTab = { id: number; title?: unknown; icon?: unknown; content?: unknown };
type TabsHook = { tabs?: HookTab[]; render?: (strip: StripTab[], visible: boolean) => unknown };

export function installTabsFix(hook: TabsHook | undefined, ownId: number): () => void {
  if (!hook || typeof hook.render !== "function") return () => undefined;
  const previous = hook.render;
  const hadOwn = Object.prototype.hasOwnProperty.call(hook, "render");
  let active = true;

  const fixed = function (this: TabsHook, strip: StripTab[], visible: boolean) {
    const result = previous.call(this, strip, visible);
    if (!active || !Array.isArray(strip)) return result;
    const seen = new Set<number>();
    for (let i = 0; i < strip.length; i++) {
      const tab = strip[i];
      if (!tab?.decky || typeof tab.key !== "number") continue;
      if (seen.has(tab.key)) strip.splice(i--, 1);
      else seen.add(tab.key);
    }
    // DeckyHub reloaded: the single copy left in the strip still shows the old module's panel.
    const mine = this.tabs?.find((candidate) => candidate.id === ownId);
    const shown = strip.find((tab) => tab?.decky && tab.key === ownId);
    if (mine && !shown) {
      // Decky counts another plugin's tab as one of its own and can skip adding ours: build it as Decky does.
      strip.push({
        key: mine.id,
        title: mine.title,
        tab: mine.icon,
        decky: true,
        panel: mine.content,
        initialVisibility: visible,
      } as StripTab);
    } else if (mine && shown && "panel" in shown && shown.panel !== mine.content) {
      shown.panel = mine.content;
      shown.tab = mine.icon;
      shown.title = mine.title;
    }
    return result;
  };
  hook.render = fixed;
  return () => {
    active = false;
    if (hook.render !== fixed) return;
    if (hadOwn) hook.render = previous;
    else delete hook.render;
  };
}
