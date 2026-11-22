import type { RemoteInstallStatus } from "./types";

// The next request waiting for an answer that hasn't been put in front of the device's owner yet,
// and only while Remote Install is on.
export function nextPendingRequest(status: Pick<RemoteInstallStatus, "enabled" | "requests">, shown: Set<string>) {
  return status.enabled ? status.requests?.find((request) => !shown.has(request.id)) : undefined;
}

// Whether a trusted browser's install may run without asking the owner: only when its ZIP carries a SHA-256 for
// Decky Loader to check. One without is put in front of the owner first, with the warning the dialog already shows.
export const runsUnattended = (trusted: boolean, asset: { sha256?: string } | undefined) =>
  trusted && /^[0-9a-f]{64}$/i.test(asset?.sha256 ?? "");

// The next request this device should run on its own: approved on arrival from a trusted
// browser, not started yet, and only while Remote Install is on.
export function nextTrustedRequest(
  status: Pick<RemoteInstallStatus, "enabled" | "trustedRequests">,
  started: Set<string>,
) {
  return status.enabled ? status.trustedRequests?.find((request) => !started.has(request.id)) : undefined;
}
