import { addEventListener, removeEventListener, toaster } from "@decky/api";
import { getRemoteInstallStatus } from "./api";
import { runRemoteRequest } from "./components/remoteRequests";
import { getDeckyBackend } from "./deckyLoader";
import type { TFunc } from "./i18n/en";
import type { RemoteInstallRequest } from "./types";
import { nextPendingRequest, nextTrustedRequest } from "./remoteTrusted";

// The backend sends these when a request arrives (remote_install.py): from a trusted browser, which runs on its
// own, or from any other, which waits for the owner.
const TRUSTED_REQUEST = "remote_trusted_request";
const PENDING_REQUEST = "remote_pending_request";

// Runs requests from trusted browsers while DeckyHub is loaded, even with Quick Access closed.
// A request from any other browser opens its confirmation (the same one an install in DeckyHub shows, with the
// warnings and the scans) on its own; it also waits in Quick Access until it is answered or expires.
// No timer: it wakes on the backend's event, and once at startup for a request that
// arrived while the Steam UI was loading (it expires two minutes after it was approved).
// One request at a time from `nextRequest`, each put in front of the owner once. `auto`: trusted devices' requests,
// approved when they arrived, run without asking.
function requestQueue(
  t: TFunc,
  auto: boolean,
  nextRequest: (
    status: Awaited<ReturnType<typeof getRemoteInstallStatus>>,
    seen: Set<string>,
  ) => RemoteInstallRequest | undefined,
) {
  const seen = new Set<string>();
  let busy = false;
  let again = false;
  return async () => {
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
        const request = nextRequest(await getRemoteInstallStatus(), seen);
        if (!request) continue;
        seen.add(request.id);
        again = true;
        try {
          await runRemoteRequest(request, t, auto);
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
}

export function startRemoteRunner(t: TFunc) {
  const run = requestQueue(t, true, nextTrustedRequest);
  const ask = requestQueue(t, false, nextPendingRequest);
  const onRequest = () => void run();
  const onPending = () => void ask();
  addEventListener(TRUSTED_REQUEST, onRequest);
  addEventListener(PENDING_REQUEST, onPending);
  onRequest();
  onPending();
  return () => {
    removeEventListener(TRUSTED_REQUEST, onRequest);
    removeEventListener(PENDING_REQUEST, onPending);
  };
}
