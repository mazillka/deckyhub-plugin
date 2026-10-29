import { DialogButtonPrimary as Button, Focusable, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { FaFileExport, FaFileImport, FaPlus, FaRedo, FaTrash } from "react-icons/fa";
import { useT } from "../i18n";
import { compactButtonStyle, registryLabel } from "../utils";
import { Card } from "./Card";

// The Repositories page's sections. The page owns the lists and does the work;
// each section shows its list and asks for an action.

// Repositories you added: export or import the list, or remove one (after a confirm).
export function CustomReposSection({ repos, onExport, onImport, onRemove }: { repos: string[]; onExport: () => void; onImport: () => void; onRemove: (repo: string) => void }) {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("repos.managedRepositories")}>
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button style={compactButtonStyle} onClick={onExport}>
                <FaFileExport /> {t("repos.export")}
              </Button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Button style={compactButtonStyle} onClick={onImport}>
                <FaFileImport /> {t("repos.import")}
              </Button>
            </div>
          </Focusable>
        </PanelSectionRow>
        {repos.map((repo) => (
          <PanelSectionRow key={repo}>
            <Button style={compactButtonStyle} onClick={() => onRemove(repo)}>
              <FaTrash /> {t("repos.remove", { repo })}
            </Button>
          </PanelSectionRow>
        ))}
        {!repos.length && <PanelSectionRow>{t("repos.noCustomRepos")}</PanelSectionRow>}
      </PanelSection>
    </Card>
  );
}

// Other people's app lists: add one by owner/repo or URL, download them all again,
// or remove one (after a confirm).
export function CustomRegistriesSection({ registries, value, onValue, busy, onAdd, onRefresh, onRemove }: { registries: string[]; value: string; onValue: (value: string) => void; busy: boolean; onAdd: () => void; onRefresh: () => void; onRemove: (url: string) => void }) {
  const t = useT();
  return (
    <Card>
      <PanelSection title={t("repos.customRegistries")}>
        <PanelSectionRow>
          <Focusable flow-children="right" style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField label={t("repos.registrySource")} value={value} onChange={(event) => onValue(event.currentTarget.value)} />
            </div>
            <div style={{ flex: "0 0 160px", paddingTop: 24 }}>
              <Button style={compactButtonStyle} onClick={onAdd} disabled={busy}>
                <FaPlus /> {busy ? t("repos.registryLoading") : t("repos.addRegistry")}
              </Button>
            </div>
          </Focusable>
        </PanelSectionRow>
        {registries.length > 0 && (
          <PanelSectionRow>
            <Button style={compactButtonStyle} disabled={busy} onClick={onRefresh}>
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
                <Button style={compactButtonStyle} onClick={() => onRemove(url)}>
                  <FaTrash /> {t("repos.removeRegistry")}
                </Button>
              </div>
            </Focusable>
          </PanelSectionRow>
        ))}
        {!registries.length && <PanelSectionRow>{t("repos.noCustomRegistries")}</PanelSectionRow>}
      </PanelSection>
    </Card>
  );
}
