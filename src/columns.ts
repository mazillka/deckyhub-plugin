// "Items per row: Auto" (0) fits as many cards as the width allows: 3 on the Deck's own 1280 px screen
// (what the fixed default was), more on a TV. `width` is in CSS pixels as laid out, i.e. already divided by
// the Large interface's zoom.
const MIN_CARD_WIDTH = 420;
const MAX_COLUMNS = 6;

export const autoColumns = (width: number) =>
  Math.max(1, Math.min(MAX_COLUMNS, Math.floor(width / MIN_CARD_WIDTH) || 1));
