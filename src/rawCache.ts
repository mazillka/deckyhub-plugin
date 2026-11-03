// Share an in-flight request and retry failed reads sooner than successful ones.
export function createRawCache<T>(read: (urls: string[]) => Promise<{ value: T; failed: boolean }>, successTtl: number, failedTtl: number) {
  let cached: { at: number; urls: string; failed: boolean; request: Promise<T> } | null = null;
  return (urls: string[], force = false): Promise<T> => {
    const key = urls.join(" ");
    if (!cached || cached.urls !== key || Date.now() - cached.at > (cached.failed ? failedTtl : force ? 60_000 : successTtl)) {
      const entry = { at: Date.now(), urls: key, failed: false, request: undefined as unknown as Promise<T> };
      entry.request = read(urls).then(({ value, failed }) => {
        entry.failed = failed;
        return value;
      });
      cached = entry;
    }
    return cached.request;
  };
}
