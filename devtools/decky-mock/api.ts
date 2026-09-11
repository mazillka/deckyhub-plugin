// Minimal stand-in for @decky/api, for local browser preview only.
// callable()/call() are bridged to a real running main.py via dev-server.py's
// HTTP RPC endpoint, so backend logic is real even though the loader isn't.
import type { ComponentType } from "react";

const BRIDGE_URL = "http://127.0.0.1:8642";

async function call(route: string, ...args: unknown[]) {
  const response = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route, args }),
  });
  const body = await response.json();
  if (!body.ok) throw new Error(body.error);
  return body.result;
}

export { call };
export const callable =
  <Args extends unknown[] = [], Return = void>(route: string) =>
  (...args: Args): Promise<Return> =>
    call(route, ...args) as Promise<Return>;

export const addEventListener = () => () => {};
export const removeEventListener = () => {};

export const routerHook = {
  _routes: new Map<string, ComponentType>(),
  addRoute(path: string, component: ComponentType) {
    routerHook._routes.set(path, component);
    window.dispatchEvent(new Event("decky-mock-routes-changed"));
  },
  removeRoute(path: string) {
    routerHook._routes.delete(path);
    window.dispatchEvent(new Event("decky-mock-routes-changed"));
  },
  addPatch: () => (route: unknown) => route,
  removePatch: () => {},
  addGlobalComponent: () => {},
  removeGlobalComponent: () => {},
};

export const toaster = {
  toast(data: { title?: unknown; body?: unknown }) {
    console.info("[decky-mock toast]", data.title, data.body);
    const el = document.createElement("div");
    el.textContent = `${data.title ?? ""}: ${data.body ?? ""}`;
    Object.assign(el.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      background: "#1a9fff",
      color: "#fff",
      padding: "10px 14px",
      borderRadius: "6px",
      zIndex: "9999",
      fontFamily: "sans-serif",
      fontSize: "13px",
      maxWidth: "280px",
    });
    document.body.appendChild(el);
    const timer = setTimeout(() => el.remove(), 4000);
    return { data, dismiss: () => { clearTimeout(timer); el.remove(); } };
  },
};

// The real GitHub API sends CORS headers, so a direct browser fetch works fine here.
export const fetchNoCors = (input: string, init?: RequestInit) => fetch(input, init);

export const FileSelectionType = { FILE: 0, FOLDER: 1 } as const;

export async function openFilePicker() {
  const path = window.prompt(
    "Dev mock: there's no native file picker in the browser. Paste an absolute path to a JSON file:",
    "/home/deck/Downloads/DeckyHub-repositories.json",
  );
  if (!path) throw new Error("File selection cancelled");
  return { path, realpath: path };
}

export const definePlugin =
  <Args extends unknown[], Return>(fn: (...args: Args) => Return) =>
  (...args: Args): Return =>
    fn(...args);
