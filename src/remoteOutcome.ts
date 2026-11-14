// Decky Loader's installer tells the caller nothing about how an install ended, so after handing a release over
// DeckyHub looks at what is installed: success once the plugin is there with a version other than before (null:
// a fresh install), "unknown" if nothing changed in time (the owner may have cancelled Decky's own dialog).
export async function settleInstall({
  installedVersion,
  before,
  succeeded,
  unknown,
  wait,
  attempts = 45,
  everyMs = 2000,
}: {
  installedVersion: () => Promise<string | null>;
  before: string | null;
  succeeded: () => Promise<unknown>;
  unknown: () => Promise<unknown>;
  wait: (ms: number) => Promise<void>;
  attempts?: number;
  everyMs?: number;
}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    await wait(everyMs);
    const version = await installedVersion().catch(() => null);
    if (version !== null && version !== before) return succeeded();
  }
  return unknown();
}
