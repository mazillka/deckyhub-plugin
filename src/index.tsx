import { addEventListener, definePlugin, removeEventListener, routerHook } from "@decky/api";
import { staticClasses } from "@decky/ui";
import type { ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import { REGISTRY_UPDATED } from "./api";
import { I18nProvider } from "./i18n";
import { Content } from "./pages/Content";
import { ManageRepositoriesPage } from "./pages/ManageRepositoriesPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { hapticTick, markUnloaded, pageStyle } from "./utils";

const MOTION_CSS = `
  /* The card or row holding the D-pad's focus gets a ring, so it's easy to spot from the couch.
     Steam marks the focused element with .gpfocus; the browser (and the dev mock) with :focus. */
  .deckyhub-focus-ring { outline: 0 solid transparent; outline-offset: 2px; }
  .deckyhub-focus-ring:focus-within, .deckyhub-focus-ring:has(.gpfocus) { outline: 3px solid #1a9fff; box-shadow: 0 0 0 6px rgba(26, 159, 255, 0.25); }
  @media (prefers-reduced-motion: no-preference) {
    .deckyhub-focus-ring { transition: outline-color 140ms ease, box-shadow 140ms ease; }
  }
  @media (prefers-reduced-motion: no-preference) {
    @keyframes deckyhub-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .deckyhub-motion { animation: deckyhub-enter 220ms cubic-bezier(.2, .8, .2, 1) both; }
    .deckyhub-motion button { transition: transform 140ms ease, filter 140ms ease; }
    .deckyhub-motion button:hover, .deckyhub-motion button:focus-visible { transform: translateY(-1px); filter: brightness(1.08); }
  }
`;

function Motion({ children }: { children: ReactNode }) {
  // onFocus bubbles (focusin), so every focus move within DeckyHub ticks.
  return <div className="deckyhub-motion" style={{ height: "100%" }} onFocus={hapticTick}><style>{MOTION_CSS}</style>{children}</div>;
}

const ROUTES: Record<string, () => ReactNode> = {
  "/deckyhub/updates": () => <Content fullPage="updates" />,
  "/deckyhub/discover": () => <Content fullPage="discover" />,
  "/deckyhub/search": () => <SearchPage />,
  "/deckyhub/settings": () => <SettingsPage />,
  "/deckyhub/repositories": () => <ManageRepositoriesPage />,
};

// The backend refreshes the registry in the background after startup; forward its
// event to the window one the pages already reload on.
const onRegistryUpdated = () => window.dispatchEvent(new Event(REGISTRY_UPDATED));

export default definePlugin(() => {
  addEventListener("registry_updated", onRegistryUpdated);
  for (const [path, page] of Object.entries(ROUTES)) {
    routerHook.addRoute(path, () => (
      <Motion>
        <div style={pageStyle}>
          <I18nProvider>{page()}</I18nProvider>
        </div>
      </Motion>
    ));
  }
  return {
    name: "DeckyHub",
    titleView: <div className={staticClasses.Title}>DeckyHub</div>,
    content: (
      <Motion>
        <I18nProvider>
          <Content />
        </I18nProvider>
      </Motion>
    ),
    icon: <FaGithub />,
    onDismount() {
      markUnloaded();
      Object.keys(ROUTES).forEach((path) => routerHook.removeRoute(path));
      removeEventListener("registry_updated", onRegistryUpdated);
    },
  };
});
