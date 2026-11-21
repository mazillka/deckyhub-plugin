import { PageHeader } from "../components/Card";
import { CustomRegistriesSection, CustomReposSection, PacksSection } from "../components/RepositoriesSections";
import { RateLimitBanner } from "../components/RateLimitBanner";
import { FaListUl } from "react-icons/fa";
import { useT } from "../i18n";
import { showRepoError, useRepositories } from "../hooks/useRepositories";

// Settings' Repositories tab (embedded: no page header or rate-limit banner of its own).
export function ManageRepositoriesPage({ embedded }: { embedded?: boolean }) {
  const t = useT();
  const repos = useRepositories(t);
  return (
    <>
      {!embedded && <RateLimitBanner />}
      {!embedded && <PageHeader icon={<FaListUl />} title={t("nav.repositories")} />}
      <CustomReposSection
        repos={repos.customRepos}
        onExport={() => void repos.exportList().catch(showRepoError)}
        onImport={() => void repos.importList().catch(showRepoError)}
        onRemove={repos.confirmRemove}
      />
      <PacksSection
        onExport={() => void repos.exportPack().catch(showRepoError)}
        onImport={() => void repos.importPack().catch(showRepoError)}
      />
      <CustomRegistriesSection
        registries={repos.registries}
        value={repos.registryValue}
        onValue={repos.setRegistryValue}
        busy={repos.registryBusy}
        onAdd={() => void repos.addRegistry()}
        onRefresh={() => void repos.reloadRegistries()}
        onRemove={repos.confirmRemoveRegistry}
      />
    </>
  );
}
