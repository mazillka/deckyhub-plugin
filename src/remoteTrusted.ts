import type { RemoteInstallStatus } from "./types";

// The next request waiting for an answer that hasn't been put in front of the device's owner yet,
// and only while Remote Install is on.
export function nextPendingRequest(status: Pick<RemoteInstallStatus, "enabled" | "requests">, shown: Set<string>) {
  return status.enabled ? status.requests?.find((request) => !shown.has(request.id)) : undefined;
}

// The next request this device should run on its own: approved on arrival from a trusted
// browser, not started yet, and only while Remote Install is on.
export function nextTrustedRequest(
  status: Pick<RemoteInstallStatus, "enabled" | "trustedRequests">,
  started: Set<string>,
) {
  return status.enabled ? status.trustedRequests?.find((request) => !started.has(request.id)) : undefined;
}
