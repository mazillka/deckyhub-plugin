import { useEffect, useState } from "react";
import { showDownloadModal } from "../../src/components/DownloadProgress";
import { en, type MessageKey } from "../../src/i18n/en";
import pluginFactory from "../../src/index";
import { reportRateLimit, substitute } from "../../src/utils";
import { FaBatteryFull, FaBell, FaBolt, FaCog, FaPlug, FaSearch, FaUserFriends, FaWifi } from "react-icons/fa";
import { routerHook, tabsHook } from "./api";

const previewText = (key: MessageKey, vars?: Record<string, string | number>) => substitute(en[key], vars);

export default function DevShell() {
  const [, forceUpdate] = useState(0);
  const [descriptor, setDescriptor] = useState<{ name: string; content?: React.ReactElement; onDismount?: () => void } | null>(null);
  const [activePath, setActivePath] = useState<string | null>(() => new URLSearchParams(window.location.search).get("preview"));
  // Y/X/Menu-button descriptions of the focused control, as Steam's footer legend shows them.
  const [hints, setHints] = useState<DOMStringMap>({});
  // The Quick Access tab shown: Decky's (null) or one a plugin added, by id.
  const [qamTab, setQamTab] = useState<number | null>(null);

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
    const moveFocus = (direction: string) => {
      if (!(["Up", "Down", "Left", "Right"] as string[]).includes(direction)) return;
      const current = document.activeElement as HTMLElement;
      if (current instanceof HTMLInputElement || current instanceof HTMLSelectElement || current instanceof HTMLTextAreaElement) return;
      const targets = Array.from(document.querySelectorAll<HTMLElement>(
        ".steam-screen button:not(:disabled), .steam-screen a[href], .steam-screen input:not(:disabled):not([type=hidden]), .steam-screen select:not(:disabled), .steam-screen textarea:not(:disabled), .steam-screen [role=button]:not([aria-disabled=true]), .steam-screen [onclick], .steam-screen [tabindex]:not([tabindex='-1'])",
      )).filter((target) => target.getClientRects().length).map((target) => {
        if (target.tabIndex < 0) target.tabIndex = 0;
        return target;
      });
      if (!targets.length) return;
      if (!targets.includes(current)) {
        targets[0].focus();
        return true;
      }
      const origin = current.getBoundingClientRect();
      const center = (rect: DOMRect, axis: "x" | "y") => axis === "x" ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
      const axis = direction === "Left" || direction === "Right" ? "x" : "y";
      const sign = direction === "Left" || direction === "Up" ? -1 : 1;
      const candidates = targets
        .filter((target) => target !== current)
        .map((target) => {
          const rect = target.getBoundingClientRect();
          const primary = (center(rect, axis) - center(origin, axis)) * sign;
          const secondary = Math.abs(center(rect, axis === "x" ? "y" : "x") - center(origin, axis === "x" ? "y" : "x"));
          const overlap = axis === "x"
            ? Math.min(rect.bottom, origin.bottom) > Math.max(rect.top, origin.top)
            : Math.min(rect.right, origin.right) > Math.max(rect.left, origin.left);
          return { target, primary, secondary, overlap };
        })
        .filter(({ primary }) => primary > 1);
      const next = (candidates.some(({ overlap }) => overlap) ? candidates.filter(({ overlap }) => overlap) : candidates)
        .sort((a, b) => a.primary - b.primary || a.secondary - b.secondary)[0]?.target;
      if (next) {
        next.focus();
        return true;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const moved = moveFocus(event.key.replace("Arrow", ""));
      if (moved) event.preventDefault();
    };
    let lastDirection = "";
    let pollTimer = 0;
    const pollController = () => {
      const controller = navigator.getGamepads?.().find(Boolean);
      const buttons = controller?.buttons;
      const direction = buttons?.[12]?.pressed ? "Up" : buttons?.[13]?.pressed ? "Down" : buttons?.[14]?.pressed ? "Left" : buttons?.[15]?.pressed ? "Right" : Math.abs(controller?.axes[0] ?? 0) > Math.abs(controller?.axes[1] ?? 0) ? (controller!.axes[0] > .5 ? "Right" : controller!.axes[0] < -.5 ? "Left" : "") : controller?.axes[1] > .5 ? "Down" : controller?.axes[1] < -.5 ? "Up" : "";
      if (direction && direction !== lastDirection) moveFocus(direction);
      lastDirection = direction;
      pollTimer = window.setTimeout(pollController, 100);
    };
    const onFocus = () => setHints({ ...(document.activeElement as HTMLElement | null)?.dataset });
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onFocus);
    pollController();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
      window.clearTimeout(pollTimer);
    };
  }, []);

  if (!descriptor) return null;
  const routes = Array.from(routerHook._routes.entries());
  const ActivePage = activePath ? routerHook._routes.get(activePath) : null;
  const openTab = tabsHook.tabs.find((tab) => tab.id === qamTab);

  return (
    <div className="steam-mock">
      <div className={`steam-deck${ActivePage ? " steam-deck-full" : ""}`}>
        <nav className="preview-nav" aria-label="Developer preview routes">
          <p className="preview-title">Preview</p>
          <button className={`preview-route ${activePath === null ? "preview-route-active" : ""}`} onClick={() => setActivePath(null)}>
            Quick Access widget
          </button>
          <button className="preview-route" onClick={() => showDownloadModal(previewText, "preview-job", { state: "downloading", filename: "Decky-Framegen.zip", received: 57.3 * 1024 * 1024, total: 190.3 * 1024 * 1024 })}>
            Download progress modal
          </button>
          <button className="preview-route" onClick={() => showDownloadModal(previewText, "preview-job", { state: "complete", path: "/home/deck/Downloads/deckyhub/DeckyHub-v1.0.2-rc.4.zip" })}>
            Download complete modal
          </button>
          <button className="preview-route" onClick={() => showDownloadModal(previewText, "preview-job", { state: "error", filename: "Decky-Framegen.zip", error: "HTTP Error 404: Not Found" })}>
            Download failed modal
          </button>
          <button className="preview-route" onClick={() => reportRateLimit(12)}>
            Rate limit banner
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
            <header className="steam-topbar"><span /><span className="steam-status"><FaSearch /><FaBell /><FaWifi /><FaBatteryFull className="steam-battery" /><strong>12:34 PM</strong><span className="steam-avatar" /></span></header>
            <div className="steam-page-content">
              <ActivePage />
            </div>
            <BottomBar hints={hints} />
          </div>
        ) : (
          <div className="game-backdrop">
            <aside className="qam-panel">
              <header className="qam-header"><span className="qam-title">⋯ <span>Quick Access</span></span><span>⚙</span></header>
              <div className="qam-body">
                <div className="qam-main">
                  {openTab ? (
                    <div className="qam-content">{openTab.content}</div>
                  ) : (
                    <>
                      <p className="qam-app-name">{descriptor.name}</p>
                      <div className="qam-content">{descriptor.content}</div>
                    </>
                  )}
                </div>
                {/* Steam's tab rail; only Decky's tab and the ones plugins add do anything here. */}
                <nav className="qam-tabs" aria-label="Quick Access tabs">
                  <span aria-hidden><FaBell /></span>
                  <span aria-hidden><FaUserFriends /></span>
                  <span aria-hidden><FaCog /></span>
                  <span aria-hidden><FaBolt /></span>
                  <button aria-label="Decky" aria-pressed={!openTab} onClick={() => setQamTab(null)}><FaPlug /></button>
                  {tabsHook.tabs.map((tab) => (
                    <button key={tab.id} aria-label={`Quick Access tab ${tab.id}`} aria-pressed={openTab === tab} onClick={() => setQamTab(tab.id)}>{tab.icon}</button>
                  ))}
                </nav>
              </div>
              <BottomBar hints={hints} />
            </aside>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}

// Steam's face-button glyph: four dots in a diamond, the pressed one filled. The
// letter stays in the text (hidden) for the tests and screen readers.
const DOTS = { Y: [10, 3], X: [3, 10], B: [17, 10], A: [10, 17] } as const;
function FaceButton({ button }: { button: keyof typeof DOTS }) {
  return (
    <span className="steam-glyph">
      <svg viewBox="0 0 20 20" width="1.6em" height="1.6em" aria-hidden>
        {Object.entries(DOTS).map(([name, [cx, cy]]) => <circle key={name} cx={cx} cy={cy} r="2.6" fill={name === button ? "#fff" : "none"} stroke="#fff" strokeWidth="1.4" />)}
      </svg>
      <span className="steam-glyph-letter">{{ Y: "Ⓨ", X: "Ⓧ", B: "Ⓑ", A: "Ⓐ" }[button]}</span>
    </span>
  );
}

function BottomBar({ hints }: { hints: { secondaryHint?: string; optionsHint?: string; menuHint?: string } }) {
  return (
    <footer className="steam-bottombar">
      <span className="steam-menu"><span className="steam-pill">STEAM</span> MENU</span>
      <span className="steam-legend">
        {hints.secondaryHint && <span><FaceButton button="Y" /> {hints.secondaryHint}</span>}
        {hints.optionsHint && <span><FaceButton button="X" /> {hints.optionsHint}</span>}
        {hints.menuHint && <span>☰ {hints.menuHint}</span>}
        <span><FaceButton button="A" /> Select</span>
        <span><FaceButton button="B" /> Back</span>
      </span>
    </footer>
  );
}
