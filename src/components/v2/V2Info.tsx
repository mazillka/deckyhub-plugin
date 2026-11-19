import { Focusable, showModal } from "@decky/ui";
import { WideConfirmModal } from "../WideModal";
import type { TFunc } from "../../i18n/en";
import { badgeLegend } from "../ContentHeader";
import { keepInView } from "../KeepInView";
import { Legend } from "./V2Library";

// Experimental V2's info window: the install disclaimer and what the badges and dots on plugins mean, one block at a
// time so the D-pad can scroll through it.
export const showV2Info = (t: TFunc) =>
  showModal(
    <WideConfirmModal
      bAlertDialog
      strTitle={t("appcard.badgesNotice")}
      strDescription={
        <Focusable flow-children="down" style={{ display: "grid", gap: 10 }}>
          {[<div key="disclaimer">{t("install.disclaimer")}</div>, <Legend key="dots" t={t} />, ...badgeLegend(t)].map(
            (block) => (
              <Focusable key={block.key} onActivate={() => {}} onFocus={keepInView}>
                {block}
              </Focusable>
            ),
          )}
        </Focusable>
      }
    />,
  );
