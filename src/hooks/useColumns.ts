import { useEffect, useState } from "react";
import { autoColumns } from "../columns";
import { DENSITY_APPLIED, layoutWidth } from "../styles";

// The cards per row to lay out: the setting, or for Auto (0) what the window's width fits, kept up to date
// as the window is resized (a docked Deck changes screen) and as the interface size is applied.
export function useColumns(setting: number) {
  const [width, setWidth] = useState(layoutWidth);
  useEffect(() => {
    if (setting) return;
    const update = () => setWidth(layoutWidth());
    update();
    window.addEventListener("resize", update);
    window.addEventListener(DENSITY_APPLIED, update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener(DENSITY_APPLIED, update);
    };
  }, [setting]);
  return setting || autoColumns(width);
}
