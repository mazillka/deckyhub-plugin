import { toaster } from "@decky/api";
import { DialogButtonPrimary as Button, Focusable, showModal } from "@decky/ui";
import { FaExclamationTriangle, FaEye, FaEyeSlash, FaLock, FaSync, FaTimes, FaTrash, FaUnlock } from "react-icons/fa";
import { getDeckyHubInfo } from "../api";
import { ownerOf } from "../author";
import { openExternalWeb } from "../external";
import type { useRepoPreference } from "../hooks/useRepoPreference";
import type { TFunc } from "../i18n/en";
import { reportIssueUrl } from "../report";
import { colors } from "../styles";
import type { App, AppReleaseOption, HideableButton } from "../types";
import { modalButtonStyle, uninstallDeckyPlugin } from "../utils";
import { displayVersion } from "../version";
import { DetailsRow } from "./DetailsWindow";
import { ReleaseActions } from "./VersionPickerPanel";
import { WideConfirmModal } from "./WideModal";

type Close = (() => void) | undefined;
type Pref = ReturnType<typeof useRepoPreference>;

const halfButtonStyle = { ...modalButtonStyle, width: "auto", flex: "1 1 auto" };

// Installed Decky plugins can be removed through Decky Loader � never
// DeckyHub itself from here. The loader doesn't confirm, so we do.
// An unverified one is removed by the name Decky knows it by, when that name is unique (uninstallName).
export const uninstallNameOf = (app: App) => app.pluginName ?? app.uninstallName;

function confirmUninstall(t: TFunc, app: App, closeModal: Close, onUninstalled: () => void) {
  const name = uninstallNameOf(app)!;
  showModal(
    <WideConfirmModal
      strTitle={t("appcard.uninstallTitle", { name: app.name })}
      strDescription={
        app.identityUnverified
          ? `${t("appcard.uninstallByName", { name })} ${t("appcard.uninstallDescription")}`
          : t("appcard.uninstallDescription")
      }
      strOKButtonText={t("appcard.uninstall")}
      bDestructiveWarning
      onOK={() => {
        closeModal?.();
        void uninstallDeckyPlugin(name).then(
          () => {
            toaster.toast({ title: "DeckyHub", body: t("appcard.uninstalled", { name: app.name }) });
            onUninstalled();
          },
          (error: unknown) => toaster.toast({ title: "DeckyHub", body: String(error) }),
        );
      }}
    />,
  );
}

async function reportProblem(app: App, closeModal: Close) {
  const info = await getDeckyHubInfo().catch(() => null);
  const issue = reportIssueUrl({
    repo: app.repo,
    name: app.name,
    version: app.installedVersion ? displayVersion(app.installedVersion) : undefined,
    deckyhubVersion: info?.version,
  });
  if (!issue) return;
  closeModal?.();
  openExternalWeb(issue);
}

// The routine and the rare actions behind one row, so the window doesn't end in a long stack.
export function MoreActions({
  t,
  app,
  pref,
  loading,
  onCheck,
  closeModal,
}: {
  t: TFunc;
  app: App;
  pref: Pref;
  loading: boolean;
  onCheck: () => void;
  closeModal: Close;
}) {
  const { skipped, latest, pinned, preference } = pref;
  return (
    <DetailsRow title={t("notice.more")}>
      <Focusable flow-children="down" style={{ display: "grid", gap: 8 }}>
        {!app.store && (
          <Button style={modalButtonStyle} disabled={loading} onClick={onCheck}>
            <FaSync /> {loading ? t("settings.checkingUpdate") : t("settings.checkUpdate")}
          </Button>
        )}
        {pref.canSkip && (
          <Button style={modalButtonStyle} onClick={pref.toggleSkip}>
            {skipped ? <FaEye /> : <FaEyeSlash />}{" "}
            {t(skipped ? "appcard.unskipVersion" : "appcard.skipVersion", { version: displayVersion(latest!) })}
          </Button>
        )}
        {app.installedVersion && !app.store && (
          <Button style={modalButtonStyle} onClick={pref.togglePin}>
            {pinned ? <FaUnlock /> : <FaLock />}{" "}
            {t(pinned ? "appcard.unpinVersion" : "appcard.pinVersion", {
              version: displayVersion(pinned ? preference.pinVersion! : app.installedVersion),
            })}
          </Button>
        )}
        <Button style={modalButtonStyle} onClick={() => void reportProblem(app, closeModal)}>
          <FaExclamationTriangle /> {t("appcard.reportProblem")}
        </Button>
      </Focusable>
    </DetailsRow>
  );
}

// More from this plugin's author, over every plugin (Discover only).
export function MoreFromAuthorButton({
  t,
  app,
  count,
  show,
  closeModal,
}: {
  t: TFunc;
  app: App;
  count: number;
  show: () => void;
  closeModal: Close;
}) {
  return (
    <Button
      style={modalButtonStyle}
      onClick={() => {
        closeModal?.();
        show();
      }}
    >
      {t("details.moreFromAuthor", { author: ownerOf(app), count })}
    </Button>
  );
}

// Remove apart from the rest, and Close beside it.
export function RemoveAndClose({
  t,
  app,
  closeModal,
  onUninstalled,
}: {
  t: TFunc;
  app: App;
  closeModal: Close;
  onUninstalled: () => void;
}) {
  const name = uninstallNameOf(app);
  return (
    <Focusable flow-children="right" style={{ display: "flex", gap: 8 }}>
      {name && name !== "DeckyHub" && (
        <Button
          style={{ ...halfButtonStyle, color: colors.danger }}
          onClick={() => confirmUninstall(t, app, closeModal, onUninstalled)}
        >
          <FaTrash /> {t("appcard.uninstall")}
        </Button>
      )}
      <Button style={halfButtonStyle} onClick={closeModal}>
        <FaTimes /> {t("settings.close")}
      </Button>
    </Focusable>
  );
}

// Under the window's actions: the release links, the author's other plugins, More, Remove and Close.
export function AppFooter({
  t,
  app,
  hiddenButtons,
  moreFromAuthor,
  closeModal,
  onUninstalled,
  release,
  pref,
  loading,
  onCheck,
}: {
  t: TFunc;
  app: App;
  hiddenButtons: HideableButton[];
  moreFromAuthor?: { count: number; show: () => void };
  closeModal?: Close;
  onUninstalled: () => void;
  release?: AppReleaseOption | null;
  pref: Pref;
  loading: boolean;
  onCheck: () => void;
}) {
  return (
    <>
      {/* The links, in one row. */}
      <ReleaseActions
        t={t}
        url={release?.url}
        repoUrl={`https://github.com/${app.repo}`}
        pageUrl={app.official ? `https://deckyhub.com/plugins/${encodeURIComponent(app.id)}.html` : undefined}
        hideReleasePage={hiddenButtons.includes("releasePage")}
        checking={loading}
        disabled={loading}
        onCheck={onCheck}
        closeModal={closeModal}
        hideCheck
      />
      {moreFromAuthor && moreFromAuthor.count > 1 && (
        <MoreFromAuthorButton t={t} app={app} {...moreFromAuthor} closeModal={closeModal} />
      )}
      <MoreActions t={t} app={app} pref={pref} loading={loading} onCheck={onCheck} closeModal={closeModal} />
      <RemoveAndClose t={t} app={app} closeModal={closeModal} onUninstalled={onUninstalled} />
    </>
  );
}
