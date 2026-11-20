import { FileSelectionType, openFilePicker, toaster } from "@decky/api";
import { showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import {
  addCustomRegistry,
  exportCustomRepos,
  exportPluginPack,
  getDeckyHubInfo,
  getSettings,
  importCustomRepos,
  importPluginPack,
  REGISTRY_UPDATED,
  refreshRegistry,
  removeCustomRegistry,
  removeCustomRepo,
} from "../api";
import { offerPendingInstalls } from "../components/PendingInstalls";
import { WideConfirmModal } from "../components/WideModal";
import type { MessageKey, TFunc } from "../i18n/en";
import { isRepositoryName, log, registryUrlForRepo } from "../utils";

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

// Backend refusals (e.g. a file outside the home folder) come back as errors
// carrying their reason; show it instead of failing silently.
export const showRepoError = (error: unknown) => {
  log(`Repository action failed: ${error}`);
  toaster.toast({ title: "DeckyHub", body: String(error) });
};

const registriesChanged = () => window.dispatchEvent(new Event(REGISTRY_UPDATED));

// Asks for a .json file in the download folder; undefined when the picker is closed without one.
async function pickJson(): Promise<string | undefined> {
  try {
    const file = await openFilePicker(
      FileSelectionType.FILE,
      (await getDeckyHubInfo()).downloadDir,
      true,
      false,
      undefined,
      ["json"],
    );
    return file.realpath;
  } catch {
    return undefined;
  }
}

// Says why an add didn't work. Decky's toaster truncates a long body, so the toast stays a short sentence and
// the technical reason goes to the DeckyHub log instead (see log_frontend).
function explainRejection(t: TFunc, result: Awaited<ReturnType<typeof addCustomRegistry>>, url: string) {
  const key = REGISTRY_ERROR[result.reason ?? ""];
  if (result.detail) log(`Registry add rejected (${result.reason}) for ${url}: ${result.detail}`);
  toaster.toast({
    title: "DeckyHub",
    body: key ? t(key, { limit: result.detail ?? "10" }) : t("repos.registryFailed"),
  });
}

type Refresh = () => void;

// Adding, removing and reloading custom registries.
function useRegistryActions(t: TFunc, refreshRepos: Refresh) {
  const [registryValue, setRegistryValue] = useState("");
  const [registryBusy, setRegistryBusy] = useState(false);
  const registryFailed = (error: unknown, what: string) => {
    log(`${what} failed: ${error}`);
    toaster.toast({ title: "DeckyHub", body: t("repos.registryFailed") });
  };

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
        registriesChanged();
        toaster.toast({ title: "DeckyHub", body: t("repos.registryAdded", { apps: result.apps ?? 0 }) });
        return;
      }
      explainRejection(t, result, url);
    } catch (error) {
      registryFailed(error, "Adding registry");
    } finally {
      setRegistryBusy(false);
    }
  };

  const removeRegistry = async (url: string) => {
    try {
      await removeCustomRegistry(url);
    } catch (error) {
      registryFailed(error, "Removing registry");
    }
    refreshRepos();
    registriesChanged();
  };
  const confirmRemoveRegistry = (url: string) =>
    showModal(
      <WideConfirmModal
        strTitle={t("repos.removeRegistryTitle")}
        strDescription={t("repos.removeRegistryDesc", { url })}
        strOKButtonText={t("repos.removeConfirm")}
        bDestructiveWarning
        onOK={() => void removeRegistry(url)}
      />,
    );

  const reloadRegistries = async () => {
    if (registryBusy) return;
    setRegistryBusy(true);
    try {
      await refreshRegistry();
      refreshRepos();
      registriesChanged();
    } catch (error) {
      registryFailed(error, "Refreshing registries");
    } finally {
      setRegistryBusy(false);
    }
  };

  return { registryValue, setRegistryValue, registryBusy, addRegistry, confirmRemoveRegistry, reloadRegistries };
}

// Exporting and importing the repository list and plugin packs.
function useTransfer(t: TFunc, refreshRepos: Refresh) {
  const exportList = async () => {
    const result = await exportCustomRepos();
    toaster.toast({ title: "DeckyHub", body: t("repos.exportedTo", { path: result.path }) });
  };
  const exportPack = async () => {
    const result = await exportPluginPack();
    toaster.toast({
      title: "DeckyHub",
      body: result.path ? t("repos.packExported", { count: result.count, path: result.path }) : t("repos.packEmpty"),
    });
  };
  const importPack = async () => {
    const path = await pickJson();
    if (!path) return;
    const result = await importPluginPack(path);
    refreshRepos();
    if (result.added.length) registriesChanged();
    await offerPendingInstalls(t, true);
  };
  const importList = async () => {
    const path = await pickJson();
    if (!path) return;
    const result = await importCustomRepos(path);
    refreshRepos();
    if (result.added.length) registriesChanged();
    toaster.toast({
      title: "DeckyHub",
      body: result.added.length ? t("repos.imported", { repos: result.added.join(", ") }) : t("repos.nothingToImport"),
    });
  };

  return { exportList, exportPack, importPack, importList };
}

// The Repositories page's lists and everything its buttons do.
export function useRepositories(t: TFunc) {
  const [customRepos, setCustomRepos] = useState<string[]>([]);
  const [registries, setRegistries] = useState<string[]>([]);

  const refreshRepos = () => {
    void getSettings().then((settings) => {
      setCustomRepos(settings.customRepos ?? []);
      setRegistries(settings.customRegistries ?? []);
    });
  };
  useEffect(() => {
    refreshRepos();
  }, []);

  const registry = useRegistryActions(t, refreshRepos);
  const transfer = useTransfer(t, refreshRepos);
  const remove = async (repo: string) => {
    await removeCustomRepo(repo);
    refreshRepos();
    registriesChanged();
  };
  const confirmRemove = (repo: string) =>
    showModal(
      <WideConfirmModal
        strTitle={t("repos.removeRepositoryTitle")}
        strDescription={t("repos.removeRepositoryDesc", { repo })}
        strOKButtonText={t("repos.removeConfirm")}
        bDestructiveWarning
        onOK={() => void remove(repo).catch(showRepoError)}
      />,
    );

  return {
    customRepos,
    registries,
    registryValue: registry.registryValue,
    setRegistryValue: registry.setRegistryValue,
    registryBusy: registry.registryBusy,
    confirmRemove,
    confirmRemoveRegistry: registry.confirmRemoveRegistry,
    addRegistry: registry.addRegistry,
    reloadRegistries: registry.reloadRegistries,
    ...transfer,
  };
}
