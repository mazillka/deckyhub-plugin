// The Experimental UI Style's look, scoped to .deckyhub-exp (set on the panel's and each
// route's root by Motion in index.tsx). Its own components (Exp*) use the dh-exp-* classes;
// the shared sections (Card, notices, Steam's buttons) are reshaped here, so the Default
// style stays exactly as it was. Inline styles need !important to be overridden.
const EXP_CSS = `
  .deckyhub-exp {
    --exp-accent: #4fd1ff;
    --exp-accent-2: #a78bfa;
    --exp-surface: rgba(18, 24, 38, 0.72);
    --exp-surface-2: rgba(255, 255, 255, 0.05);
    --exp-line: rgba(255, 255, 255, 0.08);
    --exp-text: #eef4fb;
    --exp-muted: #93a4b8;
    --exp-radius: 16px;
    color: var(--exp-text);
  }
  .deckyhub-exp .deckyhub-card {
    background: var(--exp-surface) !important;
    border: 1px solid var(--exp-line) !important;
    border-radius: var(--exp-radius) !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  }
  .deckyhub-exp button { border-radius: 12px !important; }
  .deckyhub-exp .deckyhub-disclaimer, .deckyhub-exp .deckyhub-badge-notice { border-radius: 12px !important; }
  .dh-exp-gradient-text { background: linear-gradient(90deg, var(--exp-accent), var(--exp-accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }

  /* Pages' tab bar. */
  .dh-exp-nav { display: flex; gap: 6px; padding: 6px; margin-bottom: 16px; border-radius: 999px; background: var(--exp-surface); border: 1px solid var(--exp-line); }
  .dh-exp-nav > div { flex: 1; min-width: 0; }
  .dh-exp-nav button { display: flex !important; align-items: center; justify-content: center; gap: 8px; width: 100%; min-width: 0 !important; min-height: 36px; padding: 4px 10px !important; border-radius: 999px !important; background: transparent !important; color: var(--exp-muted) !important; white-space: nowrap; overflow: hidden; }
  .dh-exp-nav .is-active button { background: linear-gradient(90deg, var(--exp-accent), var(--exp-accent-2)) !important; color: #0b1020 !important; font-weight: 700; }

  .dh-exp-nav-hint { align-self: center; flex: 0 0 auto; padding: 2px 8px; margin: 0 4px; border-radius: 6px; background: rgba(255, 255, 255, 0.1); color: #dbe6f0; font-size: max(12px, 0.75em); font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; }
  .dh-exp-rail-hints { display: flex; justify-content: space-between; padding: 0 4px 6px; }

  /* A page's header. */
  .dh-exp-hero { position: relative; display: flex; align-items: center; gap: 16px; padding: 18px 20px; margin-bottom: 14px; border-radius: 20px; overflow: hidden; border: 1px solid var(--exp-line);
    background: radial-gradient(120% 140% at 0% 0%, rgba(79, 209, 255, 0.22), transparent 55%), radial-gradient(120% 140% at 100% 100%, rgba(167, 139, 250, 0.22), transparent 55%), var(--exp-surface); }
  .dh-exp-hero h2 { margin: 0; font-size: 1.9em; font-weight: 800; line-height: 1.1; letter-spacing: -0.01em; }
  .dh-exp-hero p { margin: 4px 0 0; color: var(--exp-muted); font-size: max(12px, 0.9em); }
  .dh-exp-actions { display: flex; gap: 8px; flex: 0 0 auto; }
  .dh-exp-actions button { min-width: 0 !important; min-height: 40px; padding: 4px 14px !important; display: flex !important; align-items: center; gap: 8px; white-space: nowrap; }

  /* Plugin cards. */
  .dh-exp-card { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; border-radius: var(--exp-radius); overflow: hidden; background: var(--exp-surface); border: 1px solid var(--exp-line); }
  .dh-exp-cover { position: relative; display: flex; align-items: flex-end; height: 72px; padding: 0 14px 10px; }
  .dh-exp-cover .dh-exp-status { position: absolute; top: 10px; right: 12px; }
  .dh-exp-body { display: flex; flex-direction: column; gap: 8px; flex: 1; padding: 12px 14px 14px; }
  .dh-exp-card h3, .dh-exp-row h3 { margin: 0; color: #fff; font-size: 1.1em; font-weight: 700; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dh-exp-meta { color: var(--exp-muted); font-size: max(12px, 0.78em); display: flex; flex-wrap: wrap; gap: 2px 12px; }
  .dh-exp-version { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; background: var(--exp-surface-2); border: 1px solid var(--exp-line); font-size: max(12px, 0.8em); color: #d7e3ee; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .dh-exp-version b { color: var(--exp-accent); }
  .dh-exp-status { padding: 2px 10px; border-radius: 999px; font-size: max(12px, 0.74em); font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; background: rgba(8, 12, 20, 0.7); border: 1px solid; backdrop-filter: blur(6px); }
  .dh-exp-spacer { flex: 1; }
  .dh-exp-buttons { display: flex; gap: 8px; }
  .dh-exp-buttons button { min-width: 0 !important; min-height: 40px; padding: 4px 10px !important; display: flex !important; align-items: center; justify-content: center; gap: 8px; width: 100%; }
  .dh-exp-buttons .dh-exp-primary button { background: linear-gradient(90deg, var(--exp-accent), var(--exp-accent-2)) !important; color: #0b1020 !important; font-weight: 700; }
  .dh-exp-row { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto 220px; align-items: center; gap: 4px 14px; padding: 10px 14px; border-radius: var(--exp-radius); background: var(--exp-surface); border: 1px solid var(--exp-line); }

  /* The Quick Access panel. */
  .dh-exp-qam-hero { padding: 16px; margin-bottom: 12px; border-radius: 18px; border: 1px solid var(--exp-line);
    background: radial-gradient(140% 120% at 0% 0%, rgba(79, 209, 255, 0.28), transparent 60%), radial-gradient(140% 120% at 100% 100%, rgba(167, 139, 250, 0.28), transparent 60%), var(--exp-surface); }
  .dh-exp-qam-hero .dh-exp-big { font-size: 2.4em; font-weight: 800; line-height: 1; }
  .dh-exp-qam-hero ul { margin: 10px 0 12px; padding: 0; list-style: none; display: grid; gap: 6px; }
  .dh-exp-qam-hero li { display: flex; justify-content: space-between; gap: 8px; font-size: max(12px, 0.85em); color: #d7e3ee; }
  .dh-exp-qam-hero li span:last-child { color: var(--exp-accent); white-space: nowrap; }
  /* The panel is narrow and clips what crosses its edges: keep a gutter on both sides so focus
     rings show whole, and line the banner and tiles up with the cards' text below them. */
  .deckyhub-exp .deckyhub-qam { padding: 6px 10px 12px; }
  .deckyhub-exp .deckyhub-qam .dh-exp-qam-hero { padding: 16px 14px; }
  .deckyhub-exp .deckyhub-qam .gpfocus, .deckyhub-exp .deckyhub-qam button:focus-visible { box-shadow: 0 0 0 4px rgba(79, 209, 255, 0.55) !important; transform: none !important; }
  .deckyhub-exp .deckyhub-qam .deckyhub-card { box-shadow: none; }
  .dh-exp-tile button { display: flex !important; flex-direction: column; align-items: flex-start !important; gap: 6px; width: 100%; min-width: 0 !important; min-height: 78px; padding: 10px 12px !important; border-radius: 16px !important; background: var(--exp-surface) !important; border: 1px solid var(--exp-line) !important; color: var(--exp-text) !important; text-align: left; }
  .dh-exp-tile button svg { color: var(--exp-accent); font-size: 1.2em; }
  .dh-exp-tile button strong { font-size: max(12px, 0.9em); }
  .dh-exp-tile button small { color: var(--exp-muted); }
  .dh-exp-wide button { width: 100%; display: flex !important; align-items: center; justify-content: center; gap: 8px; min-height: 40px; background: linear-gradient(90deg, var(--exp-accent), var(--exp-accent-2)) !important; color: #0b1020 !important; font-weight: 700; }

  /* Discover's storefront. */
  .dh-exp-strip { display: flex; gap: 12px; overflow-x: auto; padding: 4px 4px 14px; margin: 0 -4px 6px; scrollbar-width: none; }
  .dh-exp-strip::-webkit-scrollbar { display: none; }
  .dh-exp-category { flex: 0 0 auto; }
  .dh-exp-category button { display: flex !important; flex-direction: column; align-items: flex-start !important; justify-content: flex-end; gap: 2px; min-width: 170px !important; min-height: 84px; padding: 10px 14px !important; border-radius: 16px !important; color: #fff !important; text-align: left; white-space: nowrap;
    background: linear-gradient(135deg, hsl(var(--hue) 60% 38%), hsl(calc(var(--hue) + 50) 55% 20%)) !important; }
  .dh-exp-category button small { color: rgba(255, 255, 255, 0.75); }
  .dh-exp-shelf-title { margin: 8px 0 10px; color: #fff; font-size: 1.3em; font-weight: 800; }
  .dh-exp-shelf-item { flex: 0 0 300px; min-width: 0; }
  .dh-exp-see-all { flex: 0 0 160px; display: flex; }
  .dh-exp-see-all button { width: 100%; min-width: 0 !important; border-radius: var(--exp-radius) !important; background: var(--exp-surface) !important; border: 1px dashed rgba(255, 255, 255, 0.2) !important; color: var(--exp-accent) !important; font-weight: 700; }

  /* Settings: side menu and pane. */
  .dh-exp-settings { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 18px; align-items: start; }
  .dh-exp-rail-box { position: sticky; top: 0; }
  .dh-exp-rail { display: grid; gap: 6px; padding: 16px 12px; border-radius: 20px; background: var(--exp-surface); border: 1px solid var(--exp-line); }
  .dh-exp-rail h2 { margin: 0 4px 10px; font-size: 1.6em; font-weight: 800; }
  .dh-exp-rail button { width: 100%; min-width: 0 !important; min-height: 40px; padding: 4px 14px !important; justify-content: flex-start !important; text-align: left; background: transparent !important; color: var(--exp-muted) !important; }
  .dh-exp-rail .is-active button { background: linear-gradient(90deg, rgba(79, 209, 255, 0.25), rgba(167, 139, 250, 0.2)) !important; color: #fff !important; font-weight: 700; box-shadow: inset 3px 0 0 var(--exp-accent); }
  .dh-exp-pane { min-width: 0; }

  /* Windows (Manage, downloads, Cleanup). */
  .deckyhub-pop.deckyhub-exp h2, .deckyhub-pop.deckyhub-exp h3 { background: linear-gradient(90deg, var(--exp-accent), var(--exp-accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }

  /* Manage and update windows: banner, then actions left and reading right. */
  .dh-exp-details { display: grid; gap: 18px; }
  .dh-exp-details-hero { display: flex; align-items: center; gap: 18px; padding: 18px; border-radius: 20px; border: 1px solid var(--exp-line);
    background: radial-gradient(120% 160% at 0% 0%, rgba(79, 209, 255, 0.2), transparent 55%), radial-gradient(120% 160% at 100% 100%, rgba(167, 139, 250, 0.2), transparent 55%), var(--exp-surface); }
  .dh-exp-details-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }
  .dh-exp-details-side { display: grid; gap: 12px; padding: 14px; border-radius: 18px; background: var(--exp-surface); border: 1px solid var(--exp-line); }
  .dh-exp-details-side .deckyhub-version-pickers { grid-template-columns: minmax(0, 1fr) !important; }
  .dh-exp-details-main { display: grid; gap: 18px; min-width: 0; }
  .dh-exp-label { margin: 0 0 8px; color: var(--exp-accent); font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
  .dh-exp-prose { display: grid; gap: 8px; color: #e6eef4; font-size: 15px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .dh-exp-notes { padding: 14px 16px; border-radius: 16px; background: var(--exp-surface-2); border: 1px solid var(--exp-line); color: #c9d5df; font-size: 14px; }

  /* Discover's filter bar and Search's banner. */
  .dh-exp-filters { display: grid; gap: 10px; padding: 14px; margin-bottom: 14px; border-radius: 18px; background: var(--exp-surface); border: 1px solid var(--exp-line); }
  .dh-exp-filter-row { display: flex; align-items: flex-end; gap: 12px; }
  .dh-exp-search { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 0 6px 0 14px; border-radius: 999px; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--exp-line); }
  .dh-exp-search > svg { color: var(--exp-accent); flex-shrink: 0; }
  .dh-exp-search > div { flex: 1; min-width: 0; }
  .dh-exp-search input { background: transparent !important; border: 0 !important; }
  .dh-exp-search-big { min-height: 52px; font-size: 1.1em; }
  .dh-exp-field { flex: 0 0 210px; min-width: 0; display: grid; gap: 4px; font-size: max(12px, 0.8em); color: var(--exp-muted); }
  .dh-exp-segmented { flex: 1; display: flex; gap: 4px; padding: 4px; border-radius: 999px; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--exp-line); }
  .dh-exp-segmented > div { flex: 1; min-width: 0; }
  .dh-exp-segmented button { width: 100%; min-width: 0 !important; min-height: 36px; padding: 2px 10px !important; border-radius: 999px !important; background: transparent !important; color: var(--exp-muted) !important; white-space: nowrap; }
  .dh-exp-segmented button small { opacity: 0.7; margin-left: 4px; }
  .dh-exp-segmented .is-active button { background: linear-gradient(90deg, var(--exp-accent), var(--exp-accent-2)) !important; color: #0b1020 !important; font-weight: 700; }
  .dh-exp-search-hero { display: grid; gap: 0; }
  .dh-exp-notices { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; margin-bottom: 14px; }
  .dh-exp-notices > * { margin-bottom: 0 !important; min-width: 0; }
  @media (prefers-reduced-motion: no-preference) {
    @keyframes dh-exp-glow { from { background-position: 0% 50%; } to { background-position: 100% 50%; } }
    .dh-exp-gradient-text { background-size: 200% 100%; animation: dh-exp-glow 6s ease-in-out infinite alternate; }
  }
  /* The D-pad's focus. Steam marks the focused control with .gpfocus (the browser with :focus-visible).
     The backgrounds above replace Steam's own focus look, so every focused control gets a bright
     ring and lifts, and a focused menu entry, tab or tile also lights up. */
  .deckyhub-exp .gpfocus, .deckyhub-exp button:focus-visible, .deckyhub-exp [tabindex]:focus-visible {
    outline: 3px solid #ffffff !important; outline-offset: 2px !important;
    box-shadow: 0 0 0 7px rgba(79, 209, 255, 0.55), 0 8px 24px rgba(0, 0, 0, 0.45) !important;
    filter: brightness(1.15); position: relative; z-index: 1;
  }
  .deckyhub-exp :is(.dh-exp-nav, .dh-exp-rail, .dh-exp-segmented, .dh-exp-tile, .dh-exp-see-all) :is(button.gpfocus, button:focus-visible) { background: rgba(255, 255, 255, 0.22) !important; color: #fff !important; }
  .deckyhub-exp :is(.dh-exp-nav, .dh-exp-rail, .dh-exp-segmented) .is-active :is(button.gpfocus, button:focus-visible) { background: linear-gradient(90deg, #8be4ff, #c7b6ff) !important; color: #0b1020 !important; }
  /* A card or row holding focus gets the same ring, so you can tell which plugin it's on. */
  .deckyhub-exp .deckyhub-focus-ring:focus-within, .deckyhub-exp .deckyhub-focus-ring:has(.gpfocus) { outline: 3px solid var(--exp-accent) !important; box-shadow: 0 0 0 6px rgba(79, 209, 255, 0.25) !important; }
  @media (prefers-reduced-motion: no-preference) {
    .deckyhub-exp button.gpfocus, .deckyhub-exp button:focus-visible { transform: translateY(-1px) scale(1.02); transition: transform 120ms ease, box-shadow 120ms ease; }
  }
`;

export const ExperimentalStyle = () => <style>{EXP_CSS}</style>;
