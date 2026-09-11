import { definePlugin, routerHook } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { FaGithub } from "react-icons/fa";
import { Content } from "./pages/Content";
import { RepositorySettingsPage } from "./pages/RepositorySettingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { View } from "./types";
import { pageStyle } from "./utils";

const ROUTES = ["/deckyhub/updates", "/deckyhub/discover", "/deckyhub/settings", "/deckyhub/repository-settings"];

export default definePlugin(() => {
  const fullscreen = (view: View) => (
    <div style={pageStyle}>
      <Content fullPage={view} />
    </div>
  );
  routerHook.addRoute("/deckyhub/updates", () => fullscreen("updates"));
  routerHook.addRoute("/deckyhub/discover", () => fullscreen("discover"));
  routerHook.addRoute("/deckyhub/settings", () => (
    <div style={pageStyle}>
      <SettingsPage />
    </div>
  ));
  routerHook.addRoute("/deckyhub/repository-settings", () => (
    <div style={pageStyle}>
      <RepositorySettingsPage />
    </div>
  ));
  return {
    name: "DeckyHub",
    titleView: <div className={staticClasses.Title}>DeckyHub</div>,
    content: <Content />,
    icon: <FaGithub />,
    onDismount() {
      ROUTES.forEach((path) => routerHook.removeRoute(path));
    },
  };
});
