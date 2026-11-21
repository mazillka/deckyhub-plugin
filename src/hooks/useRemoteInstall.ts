import { toaster } from "@decky/api";
import { useEffect, useState } from "react";
import { decideRemotePairing, decideRemoteRequest, getRemoteInstallStatus, setRemoteInstallEnabled } from "../api";
import { runRemoteRequest } from "../components/remoteRequests";
import type { TFunc } from "../i18n/en";
import type { RemoteInstallRequest, RemoteInstallStatus } from "../types";

const showError = (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) });

// Remote Install's status in Quick Access (refreshed every 3 seconds), the switch, and answers to
// pairing and plugin requests.
export function useRemoteInstall(t: TFunc) {
  const [status, setStatus] = useState<RemoteInstallStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await getRemoteInstallStatus());
    } catch {
      // Ignored if plugin is unloading
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, []);

  const onToggle = async (enabled: boolean) => {
    setLoading(true);
    try {
      setStatus(await setRemoteInstallEnabled(enabled));
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const onDecidePairing = async (pairId: string, approve: boolean) => {
    try {
      await decideRemotePairing(pairId, approve);
      toaster.toast({ title: "DeckyHub", body: approve ? t("remote.approve") : t("remote.reject") });
      void refresh();
    } catch (error) {
      showError(error);
    }
  };

  const onDecideRequest = async (request: RemoteInstallRequest, approve: boolean) => {
    if (!approve) {
      try {
        await decideRemoteRequest(request.id, false);
        await refresh();
      } catch (error) {
        showError(error);
      }
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      await runRemoteRequest(request, t, false);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
      void refresh();
    }
  };

  return { status, loading, onToggle, onDecidePairing, onDecideRequest };
}
