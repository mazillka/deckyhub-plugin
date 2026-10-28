import { FileSelectionType, openFilePicker, toaster } from "@decky/api";
import { DialogButtonPrimary as Button, ConfirmModal, Focusable, PanelSection, PanelSectionRow, showModal, TextField } from "@decky/ui";
import { Card, PageHeader } from "../components/Card";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { useEffect, useState } from "react";
import { FaFileExport, FaFileImport, FaListUl, FaPlus, FaRedo, FaTrash } from "react-icons/fa";
import { addCustomRegistry, exportCustomRepos, getSettings, importCustomRepos, REGISTRY_UPDATED, refreshRegistry, removeCustomRegistry, removeCustomRepo } from "../api";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { compactButtonStyle, isRepositoryName, log, registryLabel, registryUrlForRepo } from "../utils";

// The backend reports why an add didn't work as a reason code rather than raising,
// so a mistyped URL never surfaces a Python exception. Keys are literal so the
// map stays in step with MessageKey.
const REGISTRY_ERROR: Record<string, MessageKey> = {
  "invalid-url": "repos.errInvalidUrl",
  "already-added": "repos.registryAlreadyAdded",
  "too-many": "repos.errTooMany",
  "not-found": "repos.errNotFound",
  "not-registry": "repos.errNotRegistry",
  "ssl-error": "repos.errSsl",
  unreachable: "repos.errUnreachable",
  "nothing-new": "repos.errNothingNew",
};

export function ManageRepositoriesPage() {
  const t = useT();
  const [customRepos, setCustomRepos] = useState<string[]>([]);
  const [registries, setRegistries] = useState<string[]>([]);
  const [registryValue, setRegistryValue] = useState("");
  const [registryBusy, setRegistryBusy] = useState(false);


  const refreshRepos = () => {
    void getSettings().then((settings) => {
      setCustomRepos(settings.customRepos ?? []);
      setRegistries(settings.customRegistries ?? []);
    });
  };

  useEffect(() => {
    refreshRepos();
  }, []);

  // Backend refusals (e.g. a file outside /home/deck) come back as errors
  // carrying their reason; show it instead of failing silently.
  const showError = (error: unknown) => {
    log(`Repository action failed: ${error}`);
    toaster.toast({ title: "DeckyHub", body: String(error) });
  };

  const remove = async (repo: string) => {
    await removeCustomRepo(repo);
    refreshRepos();
    window.dispatchEvent(new Event(REGISTRY_UPDATED));
  };

  const confirmRemove = (repo: string) =>
    showModal(
      <ConfirmModal
        strTitle={t("repos.removeRepositoryTitle")}
        strDescription={t("repos.removeRepositoryDesc", { repo })}
        strOKButtonText={t("repos.removeConfirm")}
        bDestructiveWarning
        onOK={() => void remove(repo).catch(showError)}
      />
    );

  const addRegistry = async () => {
    const value = registryValue.trim();
    if (!value || registryBusy) return;
    setRegistryBusy(true);
    try {
      // "owner/repo" expands to that repo's registry/apps.json; anything else is a URL.
      const url = isRepositoryName(value) ? registryUrlForRepo(value) : value;
      const result = await addCustomRegistry(url);
      if (result.added) {
        setRegistryValue("");
        refreshRepos();
        window.dispatchEvent(new Event(REGISTRY_UPDATED));
        toaster.toast({ title: "DeckyHub", body: t("repos.registryAdded", { apps: result.apps ?? 0 }) });
        return;
      }
      const key = REGISTRY_ERROR[result.reason ?? ""];
      // Decky's toaster truncates a long body, so the toast stays a short sentence and
      // the technical reason goes to the DeckyHub log instead (see log_frontend).
      if (result.detail) log(`Registry add rejected (${result.reason}) for ${url}: ${result.detail}`);
      toaster.toast({ title: "DeckyHub", body: key ? t(key, { limit: result.detail ?? "10" }) : t("repos.registryFailed") });
    } catch (error) {
      log(`Adding registry failed: ${error}`);
      toaster.toast({ title: "DeckyHub", body: t("repos.registryFailed") });
    } finally {
      setRegistryBusy(false);
    }
  };

  const removeRegistry = async (url: string) => {
    try {
      await removeCustomRegistry(url);
    } catch (error) {
      log(`Removing registry failed: ${error}`);
      toaster.toast({ title: "DeckyHub", body: t("repos.registryFailed") });
    }
    refreshRepos();
    window.dispatchEvent(new Event(REGISTRY_UPDATED));
  };

  const confirmRemoveRegistry = (url: string) =>
    showModal(
      <ConfirmModal
        strTitle={t("repos.removeRegistryTitle")}
        strDescription={t("repos.removeRegistryDesc", { url })}
        strOKButtonText={t("repos.removeConfirm")}
        bDestructiveWarning
        onOK={() => void removeRegistry(url)}
      />
    );

  const reloadRegistries = async () => {
    if (registryBusy) return;
    setRegistryBusy(true);
    try {
      await refreshRegistry();
      refreshRepos();
      window.dispatchEvent(new Event(REGISTRY_UPDATED));
    } catch (error) {
      log(`Refreshing registries failed: ${error}`);
      toaster.toast({ title: "DeckyHub", body: t("repos.registryFailed") });
    } finally {
      setRegistryBusy(false);
    }
  };

  const exportList = async () => {
    const result = await exportCustomRepos();
    toaster.toast({ title: "DeckyHub", body: t("repos.exportedTo", { path: result.path }) });
  };

  const importList = async () => {
    let file: { realpath: string };
    try {
      file = await openFilePicker(FileSelectionType.FILE, "/home/deck/Downloads", true, false, undefined, ["json"]);
    } catch {
      return; // Picker closed without a file.
    }
    const result = await importCustomRepos(file.realpath);
    refreshRepos();
    if (result.added.length) window.dispatchEvent(new Event(REGISTRY_UPDATED));
    toaster.toast({ title: "DeckyHub", body: result.added.length ? t("repos.imported", { repos: result.added.join(", ") }) : t("repos.nothingToImport") });
  };

  return (
    <>
      <RateLimitBanner />
      <PageHeader icon={<FaListUl />} title={t("nav.repositories")} />
      <Card>
        <PanelSection title={t("repos.managedRepositories")}>
          <PanelSectionRow>
            <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Button style={compactButtonStyle} onClick={() => void exportList().catch(showError)}>
                  <FaFileExport /> {t("repos.export")}
                </Button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Button style={compactButtonStyle} onClick={() => void importList().catch(showError)}>
                  <FaFileImport /> {t("repos.import")}
                </Button>
              </div>
            </Focusable>
          </PanelSectionRow>
          {customRepos.map((repo) => (
            <PanelSectionRow key={repo}>
              <Button style={compactButtonStyle} onClick={() => confirmRemove(repo)}>
                <FaTrash /> {t("repos.remove", { repo })}
              </Button>
            </PanelSectionRow>
          ))}
          {!customRepos.length && <PanelSectionRow>{t("repos.noCustomRepos")}</PanelSectionRow>}
        </PanelSection>
      </Card>


      <Card>
        <PanelSection title={t("repos.customRegistries")}>
          <PanelSectionRow>
            <Focusable flow-children="right" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label={t("repos.registrySource")}
                  value={registryValue}
                  onChange={(event) => setRegistryValue(event.currentTarget.value)}
                />
              </div>
              <div style={{ flex: "0 0 160px", paddingTop: 24 }}>
                <Button style={compactButtonStyle} onClick={() => void addRegistry()} disabled={registryBusy}>
                  <FaPlus /> {registryBusy ? t("repos.registryLoading") : t("repos.addRegistry")}
                </Button>
              </div>
            </Focusable>
          </PanelSectionRow>
          {registries.length > 0 && (
            <PanelSectionRow>
              <Button style={compactButtonStyle} disabled={registryBusy} onClick={() => void reloadRegistries()}>
                <FaRedo /> {t("repos.refreshRegistries")}
              </Button>
            </PanelSectionRow>
          )}
          {registries.map((url) => (
            <PanelSectionRow key={url}>
              <Focusable flow-children="right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                  {registryLabel(url)}
                  <br />
                  <small>{url}</small>
                </div>
                <div style={{ flex: "0 0 120px" }}>
                  <Button style={compactButtonStyle} onClick={() => confirmRemoveRegistry(url)}>
                    <FaTrash /> {t("repos.removeRegistry")}
                  </Button>
                </div>
              </Focusable>
            </PanelSectionRow>
          ))}
          {!registries.length && <PanelSectionRow>{t("repos.noCustomRegistries")}</PanelSectionRow>}
        </PanelSection>
      </Card>
    </>
  );
}
