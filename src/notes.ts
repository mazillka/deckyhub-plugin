// Release notes as text a Steam Deck window can show. No imports, so tests/notes.test.ts can run it.

// ponytail: markdown read as plain text (no headings' #, bold's **, link URLs; list
// dashes become bullets), minus images and HTML tags; render markdown if this reads badly.
// Repeats until nothing changes, so a nested tag like <scr<b>ipt> can't reassemble one.
export function plainNotes(notes = "") {
  for (let previous = ""; previous !== notes; ) {
    previous = notes;
    notes = notes.replace(/!\[[^\]]*\]\([^)]*\)|<[^>]*>/g, "");
  }
  return notes
    .replace(/\r\n?/g, "\n")
    .replace(/^#{1,6}[ \t]*/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*[-*][ \t]+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Short focus stops let Steam scroll through text longer than one screen.
export function textSections(text: string, limit = 300): string[] {
  const parts: string[] = [];
  while (text.length > limit) {
    const space = text.lastIndexOf(" ", limit);
    const newline = text.lastIndexOf("\n", limit);
    // Cut at a line end when one is near, so a section doesn't end on a lone bullet.
    const end = newline > limit / 2 ? newline : Math.max(space, newline);
    const cut = end > 0 ? end + 1 : limit;
    parts.push(text.slice(0, cut));
    text = text.slice(cut);
  }
  if (text) parts.push(text);
  return parts;
}
