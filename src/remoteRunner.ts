import { addEventListener, removeEventListener, toaster } from "@decky/api";
import { getRemoteInstallStatus } from "./api";
import { runRemoteRequest } from "./components/remoteRequests";
import { getDeckyBackend } from "./install";
import type { TFunc } from "./i18n/en";
import { nextTrustedRequest } from "./remoteTrusted";

// The backend sends this when a trusted browser's request arrives (remote_install.py).
const TRUSTED_REQUEST = "remote_trusted_request";

// Runs requests from trusted browsers while DeckyHub is loaded, even with Quick Access closed.
// Requests from other browsers wait for the device owner in Quick Access.
// No timer: it wakes on the backend's event, and once at startup for a request that
// arrived while the Steam UI was loading (it expires two minutes after it was approved).
export function startRemoteRunner(t: TFunc) {
  const started = new Set<string>();
  let busy = false;
  let again = false;
  const run = async () => {
    // An event during a run is not lost: the list is read again once the run ends.
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        if (!getDeckyBackend()) return;
        const request = nextTrustedRequest(await getRemoteInstallStatus(), started);
        if (!request) continue;
        started.add(request.id);
        again = true;
        try {
          await runRemoteRequest(request, t, true);
        } catch (error) {
          toaster.toast({ title: "DeckyHub", body: String(error) });
        }
      } while (again);
    } catch {
      // The backend is busy or unloading; the next event tries again.
    } finally {
      busy = false;
    }
  };
  const onRequest = () => void run();
  addEventListener(TRUSTED_REQUEST, onRequest);
  onRequest();
  return () => removeEventListener(TRUSTED_REQUEST, onRequest);
}
