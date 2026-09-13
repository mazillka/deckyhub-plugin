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
            <header className="steam-topbar">
              <span className="steam-brand">STEAM</span>
              <span>☁ Online &nbsp; ◉ 100% &nbsp; 12:34 PM</span>
            </header>
            <div className="steam-page-content">
              <ActivePage />
            </div>
            <footer className="steam-bottombar"><span>Ⓐ Select</span><span>Ⓑ Back</span></footer>
          </div>
        ) : (
          <div className="game-backdrop">
            <aside className="qam-panel">
              <header className="qam-header"><span className="qam-title">⋯ <span>Quick Access</span></span><span>⚙</span></header>
              <p className="qam-app-name">{descriptor.name}</p>
              <div className="qam-content">{descriptor.content}</div>
              <footer className="steam-bottombar"><span>Ⓐ Select</span><span>Ⓑ Back</span></footer>
            </aside>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
