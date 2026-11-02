// Puts text on the clipboard; true if it got there. `page` is the document of the control
// that asked (a Manage window lives in Steam's main window, not DeckyHub's own document).
// The Clipboard API needs a focused, permitted page, which Steam's windows don't always
// give a plugin, so a hidden text field and the older copy command are the fallback.
// Controller focus goes back to the control that had it.
export async function copyText(text: string, page: Document = document): Promise<boolean> {
  try {
    const clipboard = page.defaultView?.navigator.clipboard;
    if (clipboard) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the copy command.
  }
  const focused = page.activeElement as HTMLElement | null;
  const field = page.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  Object.assign(field.style, { position: "fixed", top: "0", left: "0", opacity: "0", pointerEvents: "none" });
  page.body.appendChild(field);
  try {
    field.select();
    return page.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    focused?.focus?.();
  }
}
