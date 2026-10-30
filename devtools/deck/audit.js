// Runs in a page on the Deck (deck.test.mjs passes it a root selector as ROOT):
// what a player can't read or reach under that root. Lists problems as text.
//   - visible: text cut off without "…", or off the screen's edges
//   - aligned: controls side by side in a row that don't share a top and height
//   - accessible: controls with no name, images with no alt, text with too little
//     contrast against what's behind it (WCAG AA: 4.5:1, 3:1 for large text)
((ROOT) => {
  const root = document.querySelector(ROOT);
  if (!root) return [`no ${ROOT}`];
  const problems = [];
  const name = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("alt") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    // The whole page counts, scrolled out of view or not; text hidden for screen readers doesn't.
    return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && Number(s.opacity) > 0 && s.clip !== "rect(0px, 0px, 0px, 0px)";
  };
  const ownText = (el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());

  // Visible.
  for (const el of root.querySelectorAll("*")) {
    if (!shown(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (ownText(el) && (r.left < -1 || r.right > innerWidth + 1)) problems.push(`off screen: ${name(el)}`);
    const clips = /hidden|clip/.test(s.overflowX + s.overflow);
    const lineClamp = s.webkitLineClamp && s.webkitLineClamp !== "none";
    if (clips && el.textContent.trim() && !lineClamp) {
      if (el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== "ellipsis" && !el.querySelector("*[style*=ellipsis]")) problems.push(`cut off: ${name(el)}`);
      if (/hidden|clip/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2 && s.whiteSpace !== "nowrap") problems.push(`cut off below: ${name(el)}`);
    }
  }

  // Aligned: buttons that share a row (overlapping vertically, same parent row).
  const controls = [...root.querySelectorAll("button, .DialogButton, input, select, [role=button]")].filter(shown);
  const rows = new Map();
  for (const el of controls) {
    const row = el.closest("[class*=Focusable], .Panel, div")?.parentElement?.closest("div");
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(el);
  }
  for (const group of rows.values()) {
    for (let i = 1; i < group.length; i++) {
      const [a, b] = [group[i - 1].getBoundingClientRect(), group[i].getBoundingClientRect()];
      const sameRow = a.top < b.bottom && b.top < a.bottom;
      if (sameRow && (Math.abs(a.top - b.top) > 2 || Math.abs(a.height - b.height) > 2)) problems.push(`misaligned: ${name(group[i - 1])} / ${name(group[i])}`);
    }
  }

  // Accessible names.
  for (const el of controls) {
    const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.textContent.trim() || el.title || el.closest("label")?.textContent.trim() || el.placeholder;
    if (!labelled) problems.push(`no name: ${el.tagName.toLowerCase()} at ${Math.round(el.getBoundingClientRect().x)},${Math.round(el.getBoundingClientRect().y)}`);
  }
  for (const img of root.querySelectorAll("img")) if (shown(img) && !img.hasAttribute("alt")) problems.push(`no alt: ${img.src.slice(-40)}`);

  // Contrast: the text colour over its backgrounds, composited down to Steam's black.
  const rgba = (value) => { const m = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return [m[0], m[1], m[2], m[3] ?? 1]; };
  const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
  const luminance = (rgb) => { const [r, g, b] = rgb.map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const background = (el) => {
    const layers = [];
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage !== "none" && /gradient/.test(s.backgroundImage)) return null; // can't tell; skip
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    return layers.reverse().reduce((under, layer) => over(layer, under), [0, 0, 0]);
  };
  const seen = new Set();
  for (const el of root.querySelectorAll("*")) {
    if (!ownText(el) || !shown(el) || seen.has(el.textContent)) continue;
    const s = getComputedStyle(el);
    let opacity = 1;
    for (let node = el; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
    // WCAG exempts disabled controls; the focused one wears Steam's own white-on-blue.
    if (el.closest("[aria-disabled=true], .Disabled, :disabled, .gpfocus")) continue;
    const bg = background(el);
    if (!bg) continue;
    const [r, g, b, a] = rgba(s.color);
    const fg = over([r, g, b, a * opacity], bg);
    const [l1, l2] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) { seen.add(el.textContent); problems.push(`low contrast ${ratio.toFixed(1)}:1: ${name(el)}`); }
  }
  return [...new Set(problems)];
})
