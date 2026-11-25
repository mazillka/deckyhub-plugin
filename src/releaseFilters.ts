// Shared release selection rules, kept independent of network and UI for contract tests.
export function matchingAssets<T extends { name: string }>(
  app: { asset: { include: string[]; exclude: string[] } },
  assets: T[],
): T[] {
  const include = app.asset.include.map((word) => word.toLowerCase());
  const exclude = app.asset.exclude.map((word) => word.toLowerCase());
  return assets.filter((asset) => {
    const name = asset.name.toLowerCase();
    return (
      name.endsWith(".zip") &&
      !exclude.some((word) => name.includes(word)) &&
      include.every((word) => name.includes(word))
    );
  });
}

export function matchesReleaseTag(tag: string, filter?: string): boolean {
  return !filter || tag.toLowerCase().includes(filter.toLowerCase());
}
