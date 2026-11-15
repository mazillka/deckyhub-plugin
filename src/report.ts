// "Report a problem": a new issue in the plugin's own GitHub repository, with what DeckyHub knows already
// filled in. Nothing is sent from here: it is only an address the Deck's browser opens, and the person writes
// and submits the issue on GitHub.
// owner/name as the registry spells it: neither part is only dots.
const REPO = /^(?!\.+\/)[A-Za-z0-9_.-]{1,100}\/(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;

export function reportIssueUrl({
  repo,
  name,
  version,
  deckyhubVersion,
}: {
  repo: string;
  name: string;
  version?: string | null;
  deckyhubVersion?: string | null;
}): string | null {
  if (!REPO.test(repo)) return null;
  const lines = [
    `**Plugin:** ${name}${version ? ` ${version}` : ""}`,
    deckyhubVersion ? `**Reported from DeckyHub ${deckyhubVersion}**` : "**Reported from DeckyHub**",
    "",
    "### What happened",
    "",
    "",
    "### What you expected",
    "",
    "",
    "### Your device (Steam Deck LCD or OLED, SteamOS version)",
    "",
  ];
  const query = new URLSearchParams({
    title: `${name}: `,
    body: lines.join("\n"),
  });
  return `https://github.com/${repo}/issues/new?${query}`;
}
