import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow, ToggleField } from "@decky/ui";
import { toaster } from "@decky/api";
import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { FaCheck, FaInfoCircle, FaMobileAlt, FaTimes, FaTrash } from "react-icons/fa";
import {
  beginRemotePairing,
  claimRemoteRequest,
  decideRemotePairing,
  decideRemoteRequest,
  finishRemoteRequest,
  finishRemoteRequestUnknown,
  getApps,
  getRemoteInstallStatus,
  revokeRemoteDevice,
  setRemoteInstallEnabled,
} from "../api";
import { Card, IconNote } from "./Card";
import { colors } from "../styles";
import { installWarnings, type RemoteInstallRequest, type RemoteInstallStatus } from "../types";
import { useT } from "../i18n";
import { copyText } from "../clipboard";
import { listAppReleases, fetchPluginStats } from "../releases";
import { getDeckyBackend, installAction, installDeckyPlugin, needsFreshInstall, PLUGIN_INSTALL_TYPE } from "../install";
import { manifestName } from "../utils";
import { confirmPluginInstall } from "./InstallFlow";
import { compactButtonStyle, sectionDividerStyle } from "../utils";
import { approveRemoteUninstall } from "./RemotePluginUninstall";

export function RemoteInstallSection() {
  const t = useT();
  const [status, setStatus] = useState<RemoteInstallStatus | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [pairingTicket, setPairingTicket] = useState<{ code: string; token: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const refresh = async () => {
    try {
      const current = await getRemoteInstallStatus();
      setStatus(current);
      setCode(current.pairingCode ?? null);
      setPairingTicket((ticket) => (ticket?.code === current.pairingCode ? ticket : null));
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
      const next = await setRemoteInstallEnabled(enabled);
      setStatus(next);
      if (!enabled) {
        setCode(null);
        setPairingTicket(null);
        setShowDetails(false);
      } else if (next.active) {
        // Turning pairing on shows the QR straight away; there is nothing else to press.
        await onPair(true);
      }
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    } finally {
      setLoading(false);
    }
  };

  const onPair = async (quiet = false) => {
    try {
      const res = await beginRemotePairing();
      setCode(res.code);
      setPairingTicket({ code: res.code, token: res.pairingToken });
      if (!quiet) toaster.toast({ title: t("remote.pair"), body: res.code });
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const onDecidePairing = async (pairId: string, approve: boolean) => {
    try {
      await decideRemotePairing(pairId, approve);
      toaster.toast({
        title: "DeckyHub",
        body: approve ? t("remote.approve") : t("remote.reject"),
      });
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const onRevokeDevice = async (deviceId: string) => {
    try {
      await revokeRemoteDevice(deviceId);
      toaster.toast({ title: "DeckyHub", body: t("repos.removeConfirm") });
      void refresh();
    } catch (error) {
      toaster.toast({ title: "DeckyHub", body: String(error) });
    }
  };

  const onDecideRequest = async (request: RemoteInstallRequest, approve: boolean) => {
    if (!approve) {
      try {
        await decideRemoteRequest(request.id, false);
        await refresh();
      } catch (error) {
        toaster.toast({ title: "DeckyHub", body: String(error) });
      }
      return;
    }
    if (loading) return;
    setLoading(true);
    let approved = false;
    let handedOver = false;
    try {
      if (!getDeckyBackend()) throw new Error(t("settings.selfUpdateUnavailable"));
      if (request.action === "uninstall") {
        await approveRemoteUninstall(request, t);
        return;
      }
      const { apps } = await getApps();
      const app = apps.find((item) => item.id === request.pluginId);
      if (!app) throw new Error(t("appcard.noMatchingAsset"));
      if (request.action === "update" && (!app.installedVersion || app.repo !== request.repo))
        throw new Error(t("appcard.noMatchingAsset"));
      const { items, error } = await listAppReleases(app, true);
      const release = request.releaseTag
        ? items.find((item) => item.tag === request.releaseTag)
        : items.find((item) => !item.prerelease);
      const action = release && installAction(app, release);
      if (!release || !action || !release.assets[0]) throw new Error(error || t("appcard.noMatchingAsset"));
      if (request.action === "update" && action.type !== PLUGIN_INSTALL_TYPE.UPDATE) {
        await decideRemoteRequest(request.id, false);
        throw new Error(t("status.upToDate"));
      }
      const stats = await fetchPluginStats(false).catch(() => ({}) as Awaited<ReturnType<typeof fetchPluginStats>>);
      const warningApp = {
        ...app,
        stats: stats[app.repo.toLowerCase()],
        channel: release.prerelease ? ("prerelease" as const) : ("stable" as const),
      };
      const note = [
        request.ownerName,
        app.repo,
        release.tag,
        warningApp.stats?.root ? t("appcard.runsAsRootHint") : "",
        needsFreshInstall(action.name, action.type) ? t("appcard.freshInstallDescription", { name: app.name }) : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const accepted = await confirmPluginInstall(
        t,
        `${app.name} — ${release.tag}`,
        t(request.action === "update" ? "appcard.update" : "appcard.install"),
        {
          note,
          asset: release.assets[0],
          warnings: installWarnings(warningApp),
        },
      );
      if (!accepted) {
        await decideRemoteRequest(request.id, false);
        return;
      }
      await decideRemoteRequest(request.id, true);
      approved = true;
      // Refresh registry and release data after approval. Never substitute a different ZIP.
      const current = (await getApps()).apps.find((item) => item.id === request.pluginId);
      if (!current || current.repo !== app.repo) throw new Error(t("appcard.noMatchingAsset"));
      const refreshed = (await listAppReleases(current, true)).items.find((item) => item.tag === release.tag);
      const freshAction = refreshed && installAction(current, refreshed);
      const asset = refreshed?.assets[0];
      if (
        !freshAction ||
        freshAction.name !== action.name ||
        freshAction.type !== action.type ||
        !asset ||
        asset.url !== release.assets[0].url ||
        asset.sha256 !== release.assets[0].sha256
      )
        throw new Error(t("appcard.noMatchingAsset"));
      const name =
        freshAction.name === current.repo ? ((await manifestName(current.repo)) ?? current.repo) : freshAction.name;
      const claim = await claimRemoteRequest(request.id);
      if (claim.pluginId !== request.pluginId || (claim.releaseTag ?? null) !== (request.releaseTag ?? null))
        throw new Error(t("appcard.noMatchingAsset"));
      if ((claim.action ?? "install") !== (request.action ?? "install")) throw new Error(t("appcard.noMatchingAsset"));
      // Loader's confirmation can be cancelled, and its events lack request IDs. A handoff
      // cannot prove success: report unknown unless a future correlated result is available.
      handedOver = true;
      await installDeckyPlugin(asset, current.repo, name, refreshed.tag, freshAction.type);
      await finishRemoteRequestUnknown(request.id);
    } catch (error) {
      if (approved) {
        if (handedOver) await finishRemoteRequestUnknown(request.id).catch(() => undefined);
        else await finishRemoteRequest(request.id, false).catch(() => undefined);
      }
      toaster.toast({ title: "DeckyHub", body: String(error) });
    } finally {
      setLoading(false);
      void refresh();
    }
  };

  const isEnabled = Boolean(status?.enabled);
  const isActive = Boolean(status?.active);
  const pairingLink =
    status?.address &&
    status.fingerprint &&
    pairingTicket &&
    pairingTicket.code === code &&
    (() => {
      const device = new URL(status.address).host;
      const details = new URLSearchParams({ device, fingerprint: status.fingerprint, pair: pairingTicket.token });
      return `https://deckyhub.com/develop/remote-install/#${details}`;
    })();

  const pairingQr = useMemo(() => {
    if (!pairingLink) return null;
    const qr = qrcode(0, "M");
    qr.addData(pairingLink);
    qr.make();
    return qr.createDataURL(4, 16);
  }, [pairingLink]);

  return (
    <Card>
      <PanelSection title={t("remote.title")}>
        <PanelSectionRow>
          <div style={{ display: "grid", gap: 8 }}>
            <IconNote icon={<FaMobileAlt />}>{t("remote.description")}</IconNote>
          </div>
        </PanelSectionRow>
        <div aria-hidden style={sectionDividerStyle} />
        <PanelSectionRow>
          <ToggleField
            label={t("remote.pairMode")}
            checked={isEnabled}
            disabled={loading}
            onChange={(checked) => void onToggle(checked)}
          />
        </PanelSectionRow>

        {isEnabled && (
          <>
            {status?.error && (
              <PanelSectionRow>
                <div style={{ color: colors.danger, fontSize: "0.9em" }}>
                  <IconNote icon={<FaInfoCircle />}>{status.error}</IconNote>
                </div>
              </PanelSectionRow>
            )}

            {isActive && status?.address && (
              <>
                <div aria-hidden style={sectionDividerStyle} />
                <PanelSectionRow>
                  <ToggleField label={t("remote.address")} checked={showDetails} onChange={setShowDetails} />
                </PanelSectionRow>
                {showDetails && (
                  <PanelSectionRow>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: "0.85em", color: colors.muted }}>{t("remote.address")}</div>
                      <code style={{ fontSize: "0.95em", color: colors.accent }}>
                        {status.address.replace(/^https?:\/\//, "").replace(/\/remote-install$/, "")}
                      </code>
                      {status.fingerprint && (
                        <>
                          <div style={{ fontSize: "0.85em", color: colors.muted, marginTop: 4 }}>
                            {t("remote.fingerprint")}
                          </div>
                          <code
                            style={{
                              fontSize: "0.75em",
                              wordBreak: "break-all",
                              background: "rgba(0,0,0,0.2)",
                              padding: "4px 8px",
                              borderRadius: 4,
                            }}
                          >
                            {status.fingerprint}
                          </code>
                        </>
                      )}
                    </div>
                  </PanelSectionRow>
                )}

                <PanelSectionRow>
                  <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <Button style={{ ...compactButtonStyle, marginBottom: 0 }} onClick={() => void onPair()}>
                        {t("remote.pair")}
                      </Button>
                    </div>
                    {code && (
                      <div
                        style={{
                          fontSize: "1.2em",
                          fontWeight: "bold",
                          letterSpacing: 2,
                          color: colors.success,
                          padding: "2px 8px",
                          border: `1px solid ${colors.success}`,
                          borderRadius: 4,
                        }}
                      >
                        {code}
                      </div>
                    )}
                  </Focusable>
                </PanelSectionRow>

                {pairingQr && (
                  <PanelSectionRow>
                    <div style={{ display: "grid", justifyItems: "center", gap: 8, textAlign: "center" }}>
                      <img src={pairingQr} alt="" style={{ maxWidth: "100%", height: "auto" }} />
                      <span>{t("remote.scanPairingQr")}</span>
                    </div>
                  </PanelSectionRow>
                )}
                {pairingLink && (
                  <PanelSectionRow>
                    <Button
                      onClick={() =>
                        void copyText(pairingLink).then((copied) => {
                          toaster.toast({
                            title: copied ? t("remote.copyPairingLink") : t("scan.copyFailed"),
                            body: "",
                          });
                        })
                      }
                    >
                      {t("remote.copyPairingLink")}
                    </Button>
                  </PanelSectionRow>
                )}

                {/* Pending Pairing Requests */}
                {Boolean(status.pairings?.length) && (
                  <>
                    <div aria-hidden style={sectionDividerStyle} />
                    <PanelSectionRow>
                      <strong style={{ color: colors.warning }}>{t("remote.pairings")}</strong>
                    </PanelSectionRow>
                    {status.pairings.map((p) => (
                      <PanelSectionRow key={p.id}>
                        <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1 }}>{p.name}</span>
                          <Button
                            style={{ ...compactButtonStyle, background: colors.success, marginBottom: 0 }}
                            onClick={() => void onDecidePairing(p.id, true)}
                          >
                            <FaCheck /> {t("remote.approve")}
                          </Button>
                          <Button
                            style={{ ...compactButtonStyle, background: colors.danger, marginBottom: 0 }}
                            onClick={() => void onDecidePairing(p.id, false)}
                          >
                            <FaTimes /> {t("remote.reject")}
                          </Button>
                        </Focusable>
                      </PanelSectionRow>
                    ))}
                  </>
                )}

                {/* Pending Install Requests */}
                {Boolean(status.requests?.length) && (
                  <>
                    <div aria-hidden style={sectionDividerStyle} />
                    <PanelSectionRow>
                      <strong style={{ color: colors.accent }}>{t("remote.requests")}</strong>
                    </PanelSectionRow>
                    {status.requests.map((r) => (
                      <PanelSectionRow key={r.id}>
                        <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: "bold" }}>
                              {t(
                                r.action === "uninstall"
                                  ? "appcard.uninstall"
                                  : r.action === "update"
                                    ? "appcard.update"
                                    : "appcard.install",
                              )}{" "}
                              · {r.pluginName || r.pluginId}
                            </div>
                            <div style={{ fontSize: "0.8em", color: colors.muted }}>
                              {t("remote.from", { name: r.ownerName })}
                              {r.releaseTag ? ` (${r.releaseTag})` : ""}
                            </div>
                          </div>
                          <Button
                            style={{ ...compactButtonStyle, background: colors.success, marginBottom: 0 }}
                            disabled={loading}
                            onClick={() => void onDecideRequest(r, true)}
                          >
                            <FaCheck /> {t("remote.approve")}
                          </Button>
                          <Button
                            style={{ ...compactButtonStyle, background: colors.danger, marginBottom: 0 }}
                            disabled={loading}
                            onClick={() => void onDecideRequest(r, false)}
                          >
                            <FaTimes /> {t("remote.reject")}
                          </Button>
                        </Focusable>
                      </PanelSectionRow>
                    ))}
                  </>
                )}

                {/* Paired Browsers */}
                {Boolean(status.devices?.length) && (
                  <>
                    <div aria-hidden style={sectionDividerStyle} />
                    <PanelSectionRow>
                      <span style={{ fontSize: "0.9em", color: colors.muted }}>{t("remote.devices")}</span>
                    </PanelSectionRow>
                    {status.devices.map((d) => (
                      <PanelSectionRow key={d.id}>
                        <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ flex: 1 }}>{d.name}</span>
                          <Button
                            style={{ ...compactButtonStyle, marginBottom: 0 }}
                            onClick={() => void onRevokeDevice(d.id)}
                          >
                            <FaTrash /> {t("repos.removeConfirm")}
                          </Button>
                        </Focusable>
                      </PanelSectionRow>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </PanelSection>
    </Card>
  );
}
