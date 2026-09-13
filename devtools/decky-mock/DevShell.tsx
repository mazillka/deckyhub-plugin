import { useEffect, useState } from "react";
import pluginFactory from "../../src/index";
import { routerHook } from "./api";

export default function DevShell() {
  const [, forceUpdate] = useState(0);
  const [descriptor, setDescriptor] = useState<{ name: string; content?: React.ReactElement; onDismount?: () => void } | null>(null);
  const [activePath, setActivePath] = useState<string | null>(() => new URLSearchParams(window.location.search).get("preview"));

  useEffect(() => {
    const onRoutesChanged = () => forceUpdate((value) => value + 1);
    const onNavigate = (event: Event) => setActivePath((event as CustomEvent<string>).detail);
    window.addEventListener("decky-mock-routes-changed", onRoutesChanged);
    window.addEventListener("decky-mock-navigate", onNavigate);
    const result = pluginFactory();
    setDescriptor(result);
    return () => {
      window.removeEventListener("decky-mock-routes-changed", onRoutesChanged);
      window.removeEventListener("decky-mock-navigate", onNavigate);
      result.onDismount?.();
    };
  }, []);

  useEffect(() => {
    const moveFocus = (event: KeyboardEvent) => {
      const direction = event.key.replace("Arrow", "");
      if (!(["Up", "Down", "Left", "Right"] as string[]).includes(direction)) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const targets = Array.from(document.querySelectorAll<HTMLElement>(".steam-screen button:not(:disabled), .steam-screen input:not(:disabled), .steam-screen select:not(:disabled)")).filter(
        (target) => target.getClientRects().length,
      );
      const current = document.activeElement as HTMLElement;
      if (!targets.length) return;
      if (!targets.includes(current)) {
        event.preventDefault();
        targets[0].focus();
        return;
      }
      const origin = current.getBoundingClientRect();
      const center = (rect: DOMRect, axis: "x" | "y") => axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      const axis = direction === "Left" || direction === "Right" ? "x" : "y";
      const sign = direction === "Left" || direction === "Up" ? -1 : 1;
      const next = targets
        .filter((target) => target !== current)
        .map((target) => {
          const rect = target.getBoundingClientRect();
          const primary = (center(rect, axis) - center(origin, axis)) * sign;
          const secondary = Math.abs(center(rect, axis === "x" ? "y" : "x") - center(origin, axis === "x" ? "y" : "x"));
          return { target, primary, secondary };
        })
        .filter(({ primary }) => primary > 1)
        .sort((a, b) => a.primary + a.secondary * 4 - (b.primary + b.secondary * 4))[0]?.target;
      if (next) {
        event.preventDefault();
        next.focus();
      }
    };
    document.addEventListener("keydown", moveFocus);
    return () => document.removeEventListener("keydown", moveFocus);
  }, []);

  if (!descriptor) return null;
  const routes = Array.from(routerHook._routes.entries());
  const ActivePage = activePath ? routerHook._routes.get(activePath) : null;

  return (
    <div className="steam-mock">
      <div className={`steam-deck${ActivePage ? " steam-deck-full" : ""}`}>
        <nav className="preview-nav" aria-label="Developer preview routes">
          <p className="preview-title">Preview</p>
          <button className={`preview-route ${activePath === null ? "preview-route-active" : ""}`} onClick={() => setActivePath(null)}>
            Quick Access widget
          </button>
          {routes.map(([path]) => (
            <button key={path} className={`preview-route ${activePath === path ? "preview-route-active" : ""}`} onClick={() => setActivePath(path)}>
              {path}
            </button>
          ))}
        </nav>
        <main className="steam-screen">
        {ActivePage ? (
          <div className="steam-page">
            <header className="steam-topbar"><span className="steam-brand">STEAM</span><span>⌕ &nbsp; ◉ &nbsp; ◔ &nbsp; ▰ &nbsp; 12:34 PM</span></header>
            <div className="steam-page-content">
              <ActivePage />
            </div>
            <footer className="steam-bottombar"><span className="steam-menu">STEAM &nbsp; MENU</span><span>Ⓐ Select &nbsp;&nbsp; Ⓑ Back</span></footer>
          </div>
        ) : (
          <div className="game-backdrop">
            <aside className="qam-panel">
              <header className="qam-header"><span className="qam-title">⋯ <span>Quick Access</span></span><span>⚙</span></header>
              <p className="qam-app-name">{descriptor.name}</p>
              <div className="qam-content">{descriptor.content}</div>
              <footer className="steam-bottombar"><span className="steam-menu">STEAM &nbsp; MENU</span><span>Ⓐ Select &nbsp;&nbsp; Ⓑ Back</span></footer>
            </aside>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
