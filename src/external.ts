import { Navigation, Router } from "@decky/ui";

// Steam's history for its main window, which @decky/ui doesn't type.
type MainWindowHistory = { location: { pathname: string }; listen: (listener: (location: { pathname: string }) => void) => () => void };
// A control to find again: coming back from the browser re-mounts the page, so the
// element itself is gone (seen on a Deck). Its label and its card's title (the heading
// each card keeps as a direct child) find the new one.
type Control = { label: string; card?: string };

const describe = (element: HTMLElement): Control => {
  let card: HTMLElement | null = element;
  while (card && !card.querySelector(":scope > h3")) card = card.parentElement;
  return { label: element.textContent?.trim() ?? "", card: card?.querySelector(":scope > h3")?.textContent?.trim() };
};

const find = (page: Document, control: Control) => {
  const heading = control.card ? [...page.querySelectorAll<HTMLElement>(".deckyhub-motion h3")].find((h3) => h3.textContent?.trim() === control.card) : null;
  const scope = heading?.parentElement ?? page.querySelector(".deckyhub-motion");
  return [...(scope?.querySelectorAll<HTMLElement>("button, .DialogButton") ?? [])].find((button) => button.textContent?.trim() === control.label);
};

const mainWindow = () => Router.WindowStore?.GamepadUIMainWindowInstance;
// The DeckyHub control with controller focus, in Steam's main window.
const pageFocus = () => mainWindow()?.BrowserWindow?.document.querySelector<HTMLElement>(".deckyhub-motion .gpfocus") ?? null;

// The control a window (Manage) was opened from. Closing a window from code, as its
// Repository button does before opening the browser, doesn't give focus back to it.
let opener: Control | null = null;

// Call when a control opens a window. With the controller's A button the click event's
// target isn't the button (seen on a Deck), so it's whatever has controller focus.
export function rememberOpener(control: EventTarget | null) {
  const element = pageFocus() ?? (control as HTMLElement | null);
  opener = element ? describe(element) : null;
}

// Opens a page in Steam's browser, then gives DeckyHub's page its controller focus back.
// Coming back from the browser, Steam leaves focus on a hidden panel outside the page,
// so the D-pad did nothing until a touch (seen on a Deck). The control that had focus,
// or the one that opened the window that had it, gets it back, else the page's first one.
export function openExternalWeb(url: string) {
  const main = mainWindow();
  const page = main?.BrowserWindow?.document;
  const history = (main as unknown as { m_history?: MainWindowHistory } | undefined)?.m_history;
  const focused = pageFocus();
  const control = focused ? describe(focused) : opener;
  const path = history?.location.pathname;
  Navigation.NavigateToExternalWeb(url);
  if (!page || !history || !path) return;
  const stop = history.listen((location) => {
    if (location.pathname !== path) return;
    stop();
    setTimeout(() => {
      if (page.querySelector(".deckyhub-motion .gpfocus")) return;
      const target = (control && find(page, control)) || page.querySelector<HTMLElement>(".deckyhub-motion button, .deckyhub-motion .DialogButton");
      target?.focus();
    }, 300);
  });
}
