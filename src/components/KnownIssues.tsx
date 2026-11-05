import { DialogButtonPrimary as Button } from "@decky/ui";
import { FaExclamationTriangle } from "react-icons/fa";
import { openExternalWeb } from "../external";
import type { TFunc } from "../i18n/en";
import { modalButtonStyle } from "../utils";
import { sectionTitleStyle } from "./DetailsWindow";

// A plugin's known issues from the registry, in its Manage window: problems that affect
// it in DeckyHub (titles in English, like registry descriptions), each opening its report.
export function KnownIssues({ t, issues, closeModal }: { t: TFunc; issues: { title: string; url: string }[]; closeModal?: () => void }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ ...sectionTitleStyle, color: "#ffb35c" }}>
        <FaExclamationTriangle /> {t("appcard.knownIssues")}
      </span>
      {issues.map((issue) => (
        <Button
          key={issue.url}
          style={{ ...modalButtonStyle, justifyContent: "flex-start", textAlign: "left" }}
          onClick={() => {
            // Close first, or Steam's browser opens underneath this window.
            closeModal?.();
            openExternalWeb(issue.url);
          }}
        >
          {issue.title}
        </Button>
      ))}
    </div>
  );
}
