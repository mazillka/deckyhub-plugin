// Runs in a page (the Deck's or the dev mock's): positions, sizes and styles of
// what DeckyHub's pages are made of, keyed by role, for compare.mjs to diff.
(() => {
  const root = document.querySelector(".deckyhub-motion");
  if (!root) return null;
  const origin = root.getBoundingClientRect();
  const pick = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      x: Math.round(r.x - origin.x), y: Math.round(r.y - origin.y), w: Math.round(r.width), h: Math.round(r.height),
      font: `${s.fontSize} ${s.fontWeight} ${s.fontFamily.split(",")[0]}`, color: s.color, bg: s.backgroundColor,
      radius: s.borderRadius, padding: s.padding.replace(/[d.]+px/g, (px) => `${Math.round(parseFloat(px) * (el.closest("[style*=zoom], .steam-page-content, .qam-content, .steam-modal-backdrop") ? 1 : 1))}px`), text: (el.textContent || "").trim().slice(0, 30),
    };
  };
  const all = (selector, n = 4) => [...root.querySelectorAll(selector)].filter((el) => el.getBoundingClientRect().height > 0).slice(0, n).map(pick);
  return JSON.stringify({
    viewport: [innerWidth, innerHeight, devicePixelRatio, getComputedStyle(document.documentElement).zoom],
    root: pick(root),
    title: all("h1, h2", 2),
    buttons: all("button, .DialogButton", 6),
    inputs: all("input, select", 3),
    cards: all("h3", 3).map((h) => h),
    disclaimer: all(".deckyhub-disclaimer", 1),
    chips: all(".deckyhub-category-chips button, .deckyhub-category-chips .DialogButton", 3),
    sectionTitles: all("[class*=PanelSectionTitle], .steam-panel-section-title", 3),
  });
})()
