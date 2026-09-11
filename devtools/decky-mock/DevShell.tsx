import { useEffect, useState } from "react";
import pluginFactory from "../../src/index";
import { routerHook } from "./api";

export default function DevShell() {
  const [, forceUpdate] = useState(0);
  const [descriptor, setDescriptor] = useState<{ name: string; content?: React.ReactElement; onDismount?: () => void } | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);

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
    <div style={{ display: "flex", height: "100vh", background: "#15171c", color: "#e6ecf1", fontFamily: "sans-serif" }}>
      <nav style={{ width: 220, borderRight: "1px solid #262a31", padding: 12, flexShrink: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>{descriptor.name} (dev mock)</div>
        <button
          onClick={() => setActivePath(null)}
          style={{ display: "block", width: "100%", marginBottom: 6, padding: 8, textAlign: "left", background: activePath === null ? "#2a475e" : "transparent", color: "#e6ecf1", border: "1px solid #3d4450", borderRadius: 4, cursor: "pointer" }}
        >
          Quick Access widget
        </button>
        {routes.map(([path]) => (
          <button
            key={path}
            onClick={() => setActivePath(path)}
            style={{ display: "block", width: "100%", marginBottom: 6, padding: 8, textAlign: "left", background: activePath === path ? "#2a475e" : "transparent", color: "#e6ecf1", border: "1px solid #3d4450", borderRadius: 4, cursor: "pointer" }}
          >
            {path}
          </button>
        ))}
      </nav>
      <main style={{ flex: 1, overflow: "auto", padding: 16 }}>{ActivePage ? <ActivePage /> : descriptor.content}</main>
    </div>
  );
}
