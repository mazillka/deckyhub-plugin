// Decky Loader's tabs hook (window.__TABS_HOOK_INSTANCE) fills Steam's Quick Access tab strip in render(): when the
// number of Decky tabs already in the strip differs from the number it knows, it adds ALL of them again. A tab added
// once the strip has rendered (DeckyHub's own, after its settings load) therefore repeats every Decky tab's icon, and
// since the strip keeps the extra ones, again on every opening of the menu (decky-loader#1014, closed as unsupported).
//
// This wraps whatever render() the hook has now (Decky's, or another plugin's wrapper such as Panel de Control's),
// lets it run as it always did, then removes only exact repeats: a second tab with the same key. It never removes or
// rebuilds a tab that appears once, so tabs other plugins add stay untouched. DeckyHub's own tab, if it was built from an
// earlier load of DeckyHub, is dropped and built again by Decky itself. Another plugin wrapping render()
// later calls through this one; taking it off then just turns it into a pass-through.
type StripTab = { key?: number; decky?: boolean; title?: unknown; tab?: unknown; panel?: unknown };
type HookTab = { id: number; title?: unknown; icon?: unknown; content?: unknown };
type TabsHook = { tabs?: HookTab[]; render?: (strip: StripTab[], visible: boolean) => unknown };

export function installTabsFix(hook: TabsHook | undefined, ownId: number): () => void {
  if (!hook || typeof hook.render !== "function") return () => undefined;
  const previous = hook.render;
  const hadOwn = Object.prototype.hasOwnProperty.call(hook, "render");
  let active = true;

  // The content our tab had when it was last built into the strip: a different one means DeckyHub put its tab back
  // (reloaded, or switched off and on), and the copy in the strip is out of date.
  let built: unknown;
  const fixed = function (this: TabsHook, strip: StripTab[], visible: boolean) {
    if (!active || !Array.isArray(strip)) return previous.call(this, strip, visible);
    const mine = this.tabs?.find((candidate) => candidate.id === ownId);
    const content = mine?.content;
    if (!mine || content !== built) {
      for (let i = strip.length - 1; i >= 0; i--) if (strip[i]?.decky && strip[i].key === ownId) strip.splice(i, 1);
      built = content;
    }
    const result = previous.call(this, strip, visible);
    const seen = new Set<number>();
    for (let i = 0; i < strip.length; i++) {
      const tab = strip[i];
      if (!tab?.decky || typeof tab.key !== "number") continue;
      if (seen.has(tab.key)) strip.splice(i--, 1);
      else seen.add(tab.key);
    }
    if (mine && !seen.has(ownId)) {
      // Decky counted another plugin's tab as one of its own and skipped ours: have Decky build just ours.
      const own: StripTab[] = [];
      const all = this.tabs;
      this.tabs = [mine];
      try {
        previous.call(this, own, visible);
      } finally {
        this.tabs = all;
      }
      strip.push(...own.filter((tab) => tab?.decky && tab.key === ownId));
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
