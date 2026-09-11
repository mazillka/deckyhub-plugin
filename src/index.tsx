import { definePlugin, routerHook } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { FaGithub } from "react-icons/fa";
import { I18nProvider } from "./i18n";
import { Content } from "./pages/Content";
import { ManageRepositoriesPage } from "./pages/ManageRepositoriesPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { View } from "./types";
import { pageStyle } from "./utils";

const ROUTES = ["/deckyhub/updates", "/deckyhub/discover", "/deckyhub/settings", "/deckyhub/repositories"];

export default definePlugin(() => {
  const fullscreen = (view: View) => (
    <div style={pageStyle}>
      <I18nProvider>
        <Content fullPage={view} />
      </I18nProvider>
    </div>
  );
  routerHook.addRoute("/deckyhub/updates", () => fullscreen("updates"));
  routerHook.addRoute("/deckyhub/discover", () => fullscreen("discover"));
  routerHook.addRoute("/deckyhub/settings", () => (
    <div style={pageStyle}>
      <I18nProvider>
        <SettingsPage />
      </I18nProvider>
    </div>
  ));
  routerHook.addRoute("/deckyhub/repositories", () => (
    <div style={pageStyle}>
      <I18nProvider>
        <ManageRepositoriesPage />
      </I18nProvider>
    </div>
  ));
  return {
    name: "DeckyHub",
    titleView: <div className={staticClasses.Title}>DeckyHub</div>,
    content: (
      <I18nProvider>
        <Content />
      </I18nProvider>
    ),
    icon: <FaGithub />,
    onDismount() {
      ROUTES.forEach((path) => routerHook.removeRoute(path));
    },
  };
});
