import { ExperimentalStyle } from "./components/experimental/theme";
import { useUiStyle } from "./uiStyle";

// DeckyHub's transitions and its D-pad focus ring, as one stylesheet. Each route and
// the Quick Access panel include it (Motion in index.tsx), and so does every modal,
// since modals open in Steam's main window, which may not hold a route.
// Everything that moves is skipped when the system asks for less motion.
const MOTION_CSS = `
  /* The card or row holding the D-pad's focus gets a ring, so it's easy to spot from the couch.
     Steam marks the focused element with .gpfocus; the browser (and the dev mock) with :focus. */
  .deckyhub-focus-ring { outline: 0 solid transparent; outline-offset: 2px; }
  .deckyhub-focus-ring:focus-within, .deckyhub-focus-ring:has(.gpfocus) { outline: 3px solid #1a9fff; box-shadow: 0 0 0 6px rgba(26, 159, 255, 0.25); }
  @media (prefers-reduced-motion: no-preference) {
    @keyframes deckyhub-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes deckyhub-pop { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: none; } }
    /* A page opening, a card or row appearing, the rate-limit notice arriving. */
    .deckyhub-motion, .deckyhub-rate-limit { animation: deckyhub-enter 220ms cubic-bezier(.2, .8, .2, 1) both; }
    .deckyhub-focus-ring { animation: deckyhub-enter 260ms cubic-bezier(.2, .8, .2, 1) both; transition: outline-color 140ms ease, box-shadow 140ms ease; }
    /* A window opening. */
    .deckyhub-pop { animation: deckyhub-pop 220ms cubic-bezier(.2, .8, .2, 1) both; }
    /* Buttons lift when focused and press in when pushed. */
    .deckyhub-motion button, .deckyhub-pop button { transition: transform 140ms ease, filter 140ms ease; }
    .deckyhub-motion button:hover, .deckyhub-motion button:focus-visible, .deckyhub-pop button:focus-visible { transform: translateY(-1px); filter: brightness(1.08); }
    .deckyhub-motion button:active, .deckyhub-pop button:active { transform: scale(0.97); }
    /* Sections (Quick Access, Settings, About) rise in one after another. Filled backwards only: a transform
       left on a tile would change how what's inside it is positioned. Up and down only, never sideways. */
    @keyframes deckyhub-section { from { opacity: 0; transform: translateY(22px) scale(0.97); } to { opacity: 1; transform: none; } }
    .deckyhub-card { animation: deckyhub-section 340ms cubic-bezier(.2, .8, .2, 1) backwards; }
    .deckyhub-card:nth-of-type(2) { animation-delay: 60ms; }
    .deckyhub-card:nth-of-type(3) { animation-delay: 120ms; }
    .deckyhub-card:nth-of-type(4) { animation-delay: 180ms; }
    .deckyhub-card:nth-of-type(n+5) { animation-delay: 240ms; }
    /* The controller's highlight: Steam marks it with .gpfocus, which the browser's focus styles above never
       see. The scale property leaves the layout, and so where the D-pad goes next, as it was. */
    @keyframes deckyhub-focus-bounce { 0% { scale: 1; } 45% { scale: 1.06; } 100% { scale: 1.02; } }
    .deckyhub-motion button.gpfocus, .deckyhub-pop button.gpfocus { animation: deckyhub-focus-bounce 260ms ease-out both; }
  }
`;

// With the Experimental UI Style, its look comes along (see experimental/theme.tsx).
export function MotionStyle() {
  const experimental = useUiStyle() === "experimental";
  return (
    <>
      <style>{MOTION_CSS}</style>
      {experimental && <ExperimentalStyle />}
    </>
  );
}
