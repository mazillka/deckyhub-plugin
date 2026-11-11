import { toaster } from "@decky/api";
import { getRemoteInstallStatus } from "./api";
import { runRemoteRequest } from "./components/remoteRequests";
import { getDeckyBackend } from "./install";
import type { TFunc } from "./i18n/en";
import { nextTrustedRequest } from "./remoteTrusted";

// Runs requests from trusted browsers while DeckyHub is loaded, even with Quick Access closed.
// Requests from other browsers wait for the device owner in Quick Access.
export function startRemoteRunner(t: TFunc) {
  const started = new Set<string>();
  let busy = false;
  const tick = async () => {
    if (busy || !getDeckyBackend()) return;
    busy = true;
    try {
      const status = await getRemoteInstallStatus();
      const request = nextTrustedRequest(status, started);
      if (!request) return;
      started.add(request.id);
      try {
        await runRemoteRequest(request, t, true);
      } catch (error) {
        toaster.toast({ title: "DeckyHub", body: String(error) });
      }
    } catch {
      // The backend is busy or unloading; try again on the next tick.
    } finally {
      busy = false;
    }
  };
  const timer = window.setInterval(() => void tick(), 4000);
  return () => window.clearInterval(timer);
}
