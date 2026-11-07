import { addEventListener, definePlugin, removeEventListener, routerHook } from "@decky/api";
import { Router, staticClasses } from "@decky/ui";
import { type ReactNode, useEffect } from "react";
import { REGISTRY_UPDATED } from "./api";
import { DeckyHubIcon } from "./components/DeckyHubIcon";
import { addQuickAccessTab, removeQuickAccessTab } from "./components/QuickAccessTab";
import { I18nProvider } from "./i18n";
import { announcePendingInstalls } from "./components/PendingInstalls";
import { Content } from "./pages/Content";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MotionStyle } from "./motion";
import { ExpPageFrame } from "./components/experimental/ExpNavBar";
import { useUiStyle } from "./uiStyle";
import { hapticTick, markUnloaded, pageStyle, tr } from "./utils";

// Steam's history for its main window, which @decky/ui doesn't type.
type MainWindowHistory = { location: { pathname: string }; replace: (path: string) => void; push: (path: string) => void };

// B on a page with nothing behind it opens Steam's menu instead of leaving DeckyHub
// (after a Steam UI reload or a cut-short Deck test run, seen on a Deck). Put Library
// behind the page then, so B always leaves.
function BackToLibrary() {
  useEffect(() => {
    const history = (Router.WindowStore?.GamepadUIMainWindowInstance as unknown as { m_history?: MainWindowHistory } | undefined)?.m_history;
    if ((window as { navigation?: { canGoBack?: boolean } }).navigation?.canGoBack !== false || !history) return;
    const path = history.location.pathname;
    history.replace("/library/home");
    history.push(path);
  }, []);
  return null;
}

function Motion({ children }: { children: ReactNode }) {
  const experimental = useUiStyle() === "experimental";
  // onFocus bubbles (focusin), so every focus move within DeckyHub ticks.
  return (
    <div className={experimental ? "deckyhub-motion deckyhub-exp" : "deckyhub-motion"} style={{ height: "100%" }} onFocus={hapticTick}>
      <MotionStyle />
      {children}
    </div>
  );
}

// Experimental: every page under one tab bar, switched in place (Repositories is part of
// Settings, so it opens the Settings tab on its own section).
function PageFrame({ path }: { path: string }) {
  const page = path.split("/").pop() ?? "";
  const initial = page === "repositories" ? "settings" : page;
  if (useUiStyle() !== "experimental") return <>{ROUTES[path]()}</>;
  return <ExpPageFrame initial={initial} render={(tab) => (tab === initial ? ROUTES[path]() : ROUTES[`/deckyhub/${tab}`]())} />;
}

const ROUTES: Record<string, () => ReactNode> = {
  "/deckyhub/updates": () => <Content fullPage="updates" />,
  "/deckyhub/discover": () => <Content fullPage="discover" />,
  "/deckyhub/installed": () => <Content fullPage="installed" />,
  "/deckyhub/search": () => <SearchPage />,
  "/deckyhub/settings": () => <SettingsPage />,
  // Repositories is a Settings tab; its old route opens Settings there.
  "/deckyhub/repositories": () => <SettingsPage initialTab="repositories" />,
};

// The backend refreshes the registry in the background after startup; forward its
// event to the window one the pages already reload on.
const onRegistryUpdated = () => window.dispatchEvent(new Event(REGISTRY_UPDATED));

export default definePlugin(() => {
  addEventListener("registry_updated", onRegistryUpdated);
  // Plugins picked in the Desktop Mode installer: remind the user once the Steam UI is up.
  window.setTimeout(() => void announcePendingInstalls(tr), 8000);
  for (const path of Object.keys(ROUTES)) {
    routerHook.addRoute(path, () => (
      <Motion>
        <BackToLibrary />
        <div style={pageStyle}>
          <I18nProvider>
            <PageFrame path={path} />
          </I18nProvider>
        </div>
      </Motion>
    ));
  }
  const content = (
    <Motion>
      <I18nProvider>
        <Content />
      </I18nProvider>
    </Motion>
  );
  addQuickAccessTab(content);
  return {
    name: "DeckyHub",
    titleView: <div className={staticClasses.Title}>DeckyHub</div>,
    content,
    icon: <DeckyHubIcon />,
    onDismount() {
      removeQuickAccessTab();
      markUnloaded();
      Object.keys(ROUTES).forEach((path) => routerHook.removeRoute(path));
      removeEventListener("registry_updated", onRegistryUpdated);
    },
  };
});
