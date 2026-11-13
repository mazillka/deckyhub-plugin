import { addEventListener, removeEventListener, toaster } from "@decky/api";
import { getRemoteInstallStatus } from "./api";
import { runRemoteRequest } from "./components/remoteRequests";
import { getDeckyBackend } from "./install";
import type { TFunc } from "./i18n/en";
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
  // One confirmation at a time, each request put in front of the owner once.
  const shown = new Set<string>();
  let asking = false;
  let askAgain = false;
  const ask = async () => {
    if (asking) {
      askAgain = true;
      return;
    }
    asking = true;
    try {
      do {
        askAgain = false;
        if (!getDeckyBackend()) return;
        const request = nextPendingRequest(await getRemoteInstallStatus(), shown);
        if (!request) continue;
        shown.add(request.id);
        askAgain = true;
        try {
          await runRemoteRequest(request, t, false);
        } catch (error) {
          toaster.toast({ title: "DeckyHub", body: String(error) });
        }
      } while (askAgain);
    } catch {
      // The backend is busy or unloading; the next event tries again.
    } finally {
      asking = false;
    }
  };
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
