import { definePlugin, routerHook } from "@decky/api";
import { staticClasses } from "@decky/ui";
import type { ReactNode } from "react";
import { FaGithub } from "react-icons/fa";
import { I18nProvider } from "./i18n";
import { Content } from "./pages/Content";
import { ManageRepositoriesPage } from "./pages/ManageRepositoriesPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { View } from "./types";
import { pageStyle } from "./utils";

const ROUTES = ["/deckyhub/updates", "/deckyhub/discover", "/deckyhub/settings", "/deckyhub/repositories"];

const MOTION_CSS = `
  @media (prefers-reduced-motion: no-preference) {
    @keyframes deckyhub-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .deckyhub-motion { animation: deckyhub-enter 220ms cubic-bezier(.2, .8, .2, 1) both; }
    .deckyhub-motion button { transition: transform 140ms ease, filter 140ms ease; }
    .deckyhub-motion button:hover, .deckyhub-motion button:focus-visible { transform: translateY(-1px); filter: brightness(1.08); }
  }
`;

function Motion({ children }: { children: ReactNode }) {
  return <div className="deckyhub-motion"><style>{MOTION_CSS}</style>{children}</div>;
}

export default definePlugin(() => {
  const fullscreen = (view: View) => (
    <Motion>
      <div style={pageStyle}>
        <I18nProvider>
          <Content fullPage={view} />
        </I18nProvider>
      </div>
    </Motion>
  );
  routerHook.addRoute("/deckyhub/updates", () => fullscreen("updates"));
  routerHook.addRoute("/deckyhub/discover", () => fullscreen("discover"));
  routerHook.addRoute("/deckyhub/settings", () => (
    <Motion>
      <div style={pageStyle}>
        <I18nProvider>
          <SettingsPage />
        </I18nProvider>
      </div>
    </Motion>
  ));
  routerHook.addRoute("/deckyhub/repositories", () => (
    <Motion>
      <div style={pageStyle}>
        <I18nProvider>
          <ManageRepositoriesPage />
        </I18nProvider>
      </div>
    </Motion>
  ));
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
      ROUTES.forEach((path) => routerHook.removeRoute(path));
    },
  };
});
