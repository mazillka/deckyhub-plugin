import { useEffect, useRef } from "react";
import type { App } from "../types";
import { ExpQuickAccess } from "./experimental/ExpQuickAccess";
import { QuickAccessNav } from "./QuickAccessNav";
import { RateLimitBanner } from "./RateLimitBanner";
import { RemoteInstallSection } from "./RemoteInstallSection";
import { SupportSection } from "./SupportSection";
import { UiStyleSection } from "./UiStyleSection";

// DeckyHub's Quick Access tab: the menu (loaded the way the Updates page loads its apps, for
// the Updates count) and the sections under it.
export function QuickAccessPanel({
  apps,
  experimental,
  listedCount,
  installedCount,
}: {
  apps: App[];
  experimental: boolean;
  listedCount: number;
  installedCount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "start" }));
  }, []);
  const updates = apps.filter((app) => app.updateAvailable);
  return (
    <div ref={ref} className="deckyhub-qam">
      <RateLimitBanner stacked />
      {experimental ? (
        <ExpQuickAccess updates={updates} listedCount={listedCount} installedCount={installedCount} />
      ) : (
        <QuickAccessNav updateCount={updates.length} listedCount={listedCount} installedCount={installedCount} />
      )}
      <UiStyleSection />
      <RemoteInstallSection />
      <SupportSection />
    </div>
  );
}
