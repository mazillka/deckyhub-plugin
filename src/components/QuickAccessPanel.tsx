import { useEffect, useRef, useState } from "react";
import { getSettings } from "../api";
import { LOCALE_CHANGED } from "../i18n";
import type { App, Settings } from "../types";
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
  // Nothing optional is drawn until the choices are known, so a hidden section never flashes up.
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    const load = () => void getSettings().then(setSettings);
    load();
    window.addEventListener(LOCALE_CHANGED, load);
    return () => window.removeEventListener(LOCALE_CHANGED, load);
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
      {settings && <RemoteInstallSection hideWhenOff={settings.hideRemoteWhenOff} />}
      {settings && !settings.hideSupport && <SupportSection />}
    </div>
  );
}
