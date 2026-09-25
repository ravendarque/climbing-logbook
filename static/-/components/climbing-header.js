// Shared design tokens + brand header markup (#345). Loaded as a classic,
// non-module <script> (not ES module) in each page's <head> -- deliberately,
// so it runs synchronously during parsing, the same way each page's
// existing theme-bootstrap inline script does. An ES module would be
// deferred until after parsing, meaning these CSS custom properties
// wouldn't exist yet at first paint -- a flash of unstyled content.
// Running synchronously means the token <style> is in the document before
// the parser reaches any content that depends on it, regardless of where
// <climbing-header> itself appears in the body.
//
// Consumers: public/login/, public/register/, public/reset-password/, and
// public/index.html (apex) originally (#345); #348 adds
// /:username/{log,map,performance} as further consumers, using the exact
// same brand markup (logo/title/tagline) -- the brand header is meant to
// be consistent everywhere, app pages included, not just marketing/
// auxiliary ones. public/-/index.html is deliberately left
// untouched -- per #344's parallel-migration decision, nothing in
// Phase A-D of that epic modifies the live admin SPA; it stays a working
// reference/fallback until Phase E (#375) decides its fate, which may be
// well after this component exists. Because logbook/index.html never
// consumes this component, its markup below doesn't need to match
// logbook's own brand-header-row pixel-for-pixel -- it's designed for
// these centered, single-column pages instead (hence justify-center
// below, where logbook's own version is left-aligned for its wider
// dashboard layout).
(function () {
  var TOKENS_STYLE_ID = "climbing-header-tokens";

  // #956 -- beta.<domain> is Logbook Beta, its own installable app, so it
  // must never be mistaken for the main one: a "Beta" badge on the brand
  // header, and yellow instead of red browser/app chrome. The page's
  // theme-color meta (which sits above this script in every <head>) wins
  // over the manifest's theme_color, so it's switched here.
  var IS_BETA = location.hostname.indexOf("beta.") === 0;
  var BETA_THEME_COLOR = "#ffcc00";
  if (IS_BETA) {
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", BETA_THEME_COLOR);
  }

  var TOKENS_CSS = [
    ":root {",
    "  --color-bg:          #0f0f0f;",
    "  --color-surface:     #1a1a1a;",
    "  --color-text:        #f0f0f0;",
    "  --color-text-muted:  #a0a0a0;",
    "  --color-accent:      #ff2727;",
    "  --color-accent-text: #ffffff;",
    "  --color-border:      #2e2e2e;",
    "  --r: 8px;",
    '  --font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  --font-display: "Bebas Neue", sans-serif;',
    // Carried over from public/-/index.html's own second :root
    // block (predates #345 -- these never made it into this shared token
    // set when it was created, so every /:username/{log,map,performance}
    // page and the public profile page had .btn/the discipline
    // picker/grade prev-next buttons collapse to zero vertical padding
    // (var(--field-h) resolving to nothing), and every grade badge/
    // evidence-tier color (client/grade-data.js, the citations/evidence-
    // tier overlays) silently fall back to unstyled text color. Found via
    // Raven's production report, 2026-08-10 -- values copied exactly, not
    // re-derived, to keep these pages pixel-identical to /logbook's own.
    "  --field-h:     2.25rem;",
    // #170/#462/#463/#696 -- five colours from #170's own decided "Fiery
    // Red Sunset" palette (10 raw hex spanning VB->V17, see #170's issue
    // body for the full named set), collapsed to #462's five grade
    // tiers. #696: the brighter warm end (indices 5-9, red_ochre ->
    // amber_flame) -- the earlier pick reached to the dark near-black
    // end and read as muddy in the UI. These are the pill *background*
    // now, not the grade text (see grade-badge/grade-select in
    // styles/tailwind.css). Same value in both themes -- a fixed,
    // decided brand palette, not something that adapts per theme.
    // Replaces the old per-grade --grade-easy..--grade-8a tokens (#463).
    "  --grade-tier-beginner:     #dc2f02;",
    "  --grade-tier-intermediate: #e85d04;",
    "  --grade-tier-advanced:     #f48c06;",
    "  --grade-tier-elite:        #faa307;",
    "  --grade-tier-hyper-elite:  #ffba08;",
    // #696 -- uniform grade-badge/grade-select text colour. Dark in both
    // themes on purpose: the pills above are bright warm colours in both
    // themes, so a literal light/dark text flip would leave the gold
    // tiers unreadable in dark mode.
    "  --grade-badge-ink: #1c1917;",
    // #797 -- --tier-peer/--tier-community (the evidence-tier chip's own
    // "Peer-reviewed"/"Community data" colors) removed along with that
    // retired popup UI -- --tier-heuristic stays, still genuinely used by
    // combo-chart.js's own chart-line coloring and climbing-grade-
    // pyramid.js's own health-card "low" status, unrelated purposes that
    // just happen to reuse the same amber token.
    "  --tier-heuristic: #dba43a;",
    // #861 -- the burger menu's own sync-status ring/glow, deliberately
    // its own token rather than reusing --tier-heuristic above: that one
    // read as a "dirty yellow" for this specific purpose (Raven, live,
    // 2026-09-19), and is also chart-line/pyramid-health-card coloring
    // (client/combo-chart.js, climbing-grade-pyramid.js) -- brightening
    // it for the ring would have silently changed those too. Named for
    // the STATE it represents, not its own color -- already changed
    // once (yellow to orange, 2026-09-19), and a state-based name means
    // a third retune doesn't need a third rename. Same fixed value in
    // both themes, matching this file's own grade-tier/pyramid-status
    // convention for a deliberately un-adapted brand-style color, not
    // something themed.
    "  --sync-working: #ff6d00;",
    // #516 -- <climbing-grade-pyramid>'s own status-icon colors (good/
    // missing/promoted), previously hardcoded raw hex directly in that
    // component and never in this token set at all, so they never
    // participated in light/dark theme switching the way every other
    // themeable color here does (found via code review, 2026-08-22).
    "  --pyramid-status-good:     #22c55e;",
    "  --pyramid-status-missing:  #ef4444;",
    "  --pyramid-status-promoted: #eab308;",
    // #807 -- form-error text (entry-form.js/place-picker.js's shared
    // error-message styling, and the login/register/reset-password
    // pages' own #*-error elements) measured under 4.5:1 (WCAG AA) in
    // light theme specifically -- #f87171 (Tailwind red-400) already
    // clears AA against every dark-theme background these elements
    // render on (confirmed empirically, ~5.3:1 minimum), so it stays
    // the dark-theme value; only light theme needs its own darker
    // shade, same antisymmetric-per-theme pattern as
    // --pyramid-status-missing just above (red-500 dark / red-700
    // light).
    "  --color-error-text: #f87171;",
    "}",
    // Bebas Neue, SIL OFL 1.1, (c) Dharma Type -- sourced directly from
    // https://github.com/dharmatype/Bebas-Neue, not Google Fonts. Absolute
    // path (not relative to this script's own location): a <style>
    // element's relative url()s resolve against the document's base URI,
    // not the script's src, so a relative path here would 404 depending
    // on which page loaded it.
    "@font-face {",
    '  font-family: "Bebas Neue";',
    '  src: url("/-/fonts/BebasNeue-Regular.woff2") format("woff2");',
    "  font-weight: 400;",
    "  font-style: normal;",
    "  font-display: swap;",
    "}",
    ':root[data-theme="light"] {',
    "  --color-bg:          #f5f5f5;",
    "  --color-surface:     #ffffff;",
    "  --color-text:        #1a1a1a;",
    "  --color-text-muted:  #6b6b6b;",
    "  --color-accent:      #ff2727;",
    "  --color-accent-text: #ffffff;",
    "  --color-border:      #dcdcdc;",
    // Same fixed values as the dark block above -- deliberately not
    // theme-adapted, see that block's own comment.
    "  --grade-tier-beginner:     #dc2f02;",
    "  --grade-tier-intermediate: #e85d04;",
    "  --grade-tier-advanced:     #f48c06;",
    "  --grade-tier-elite:        #faa307;",
    "  --grade-tier-hyper-elite:  #ffba08;",
    "  --grade-badge-ink: #1c1917;",
    "  --tier-heuristic: #a6740a;",
    "  --sync-working: #ff6d00;",
    "  --pyramid-status-good:     #16a34a;",
    "  --pyramid-status-missing:  #b91c1c;",
    "  --pyramid-status-promoted: #a16207;",
    // #807 -- #f87171 (the dark-theme value above) measured ~2.5:1
    // against entry-form.js's tinted error background and ~3.8:1 for
    // the auth pages' plain-background error text in light theme, both
    // under WCAG AA's 4.5:1 minimum for normal text (measured directly,
    // not assumed from the original report). #b91c1c (Tailwind red-700)
    // clears AA against both: ~5.75:1 against the tinted background,
    // ~5.9:1 against the light-theme page background.
    "  --color-error-text: #b91c1c;",
    "}",
    // #789 -- single source of truth for the brand lockup's (logo+title+
    // tagline) size at any viewport width. Replaces the old approach of
    // giving the logo/h1/tagline each their own independent max-[600px]/
    // max-[400px] breakpoints (see brandHtml()'s own former comment,
    // removed with this fix) -- those could never guarantee the three
    // parts stayed in proportion (they didn't even reduce by the same
    // ratio as each other), and none of them accounted for the sync
    // status icon (#762) eating into the shared flex row's space at a
    // FIXED viewport width, which is what actually caused Raven's
    // originally reported wrap (the icon appearing shrinks available
    // space independently of viewport width -- a signal a width-only
    // media query structurally cannot see). This value IS the h1's own
    // font-size (not an abstract multiplier) -- every consumer below
    // derives its own size as `calc(var(--brand-scale) * <ratio to the
    // h1>)`, a plain length-times-number, so every part is
    // mathematically locked to the same proportion and none can drift
    // independently -- "resizes as a whole", per Raven's explicit ask.
    // Driven by viewport width (not a container query against the
    // row's own rendered width): deliberately side-steps a real
    // circular-dependency risk where a flex item's measured width would
    // depend on a scale that itself depends on the flex item's measured
    // width.
    //
    // #847 later moved the icon off this row entirely (onto the burger
    // menu's own border) -- once that landed, this row only ever has
    // the brand block and the burger menu, the same two elements the
    // ORIGINAL, pre-icon, never-shrinks brand header only ever had.
    // Raven's own follow-up (2026-09-18): restore full size across as
    // much of that range as the row genuinely still fits in, rather
    // than keep shrinking as if the (now gone) icon still needed room.
    //
    // 312px, not 320px, is the floor -- Raven's own real test width
    // ("I always use a 312px wide viewport... the real size of Firefox
    // on my OnePlus 13", 2026-09-19), narrower than the #789 comment's
    // stated "practical minimum" this used to be anchored to.
    //
    // 28.8px (=1.8rem) is real PRODUCTION's own current h1 size at that
    // width -- pulled directly from getComputedStyle() via Raven's own
    // devtools against https://my.climbinglogbook.com (their actual
    // daily account, not a demo/beta environment), 2026-09-19: h1
    // 28.8125px, tagline 10.2188px, both exactly production's existing
    // max-[600px] breakpoint tier (1.8rem/0.6384rem) -- production has
    // no narrower tier than that at all (no max-[400px] step ever
    // shipped there), so this is what "always looked perfect" actually
    // means on Raven's own device, not a guess. Confirms these two
    // particular values were ALREADY proportionally locked by
    // coincidence (0.6384/1.8 = 0.8512/2.4 = 0.3547, this file's own
    // tagline ratio, below) -- only the logo's own old max-[600] value
    // (39.32px) drifted slightly off that same ratio (1.365x vs this
    // file's locked 1.4133x, a ~1.4px difference at this size), which
    // is the kind of small independent drift the whole --brand-scale
    // rewrite exists to stop happening, not something to preserve.
    //
    // Two earlier attempts at this floor were both wrong the same
    // way -- computed/measured rather than copied from something
    // already proven to work in Raven's real environment: first 0.58x
    // at a 320px viewport (measured against the OLD, since-replaced
    // per-element breakpoints, never re-validated after the rewrite);
    // then 0.8x at 320px, chosen from real spare room measured in this
    // tool's own Chromium-based browser, which turned out to have zero
    // actual margin in Raven's real Firefox (the tagline wrapped there
    // -- see this rule's sibling fix below, whitespace-nowrap on the
    // tagline itself); then 20.8px/1.3rem, taken from a diagnostic that
    // (unnoticed at the time) had actually run against a DIFFERENT,
    // ahead-of-production beta deploy, not production -- reads smaller
    // than what Raven's real, everyday account actually shows. This
    // value is the first one sourced directly from the same production
    // environment and account Raven judged it against.
    //
    // Ceiling (600px, not 400px) -- also brought back in line with
    // production's own existing max-[600px] breakpoint threshold,
    // rather than the 400px this file previously derived from measuring
    // where the row happens to stop needing to shrink now that #847
    // moved the icon off it. That measurement wasn't wrong, but 600px
    // is the width Raven has actually been looking at full-size text
    // above for as long as this app has existed -- matching it avoids
    // yet another guess about where "big enough" should start.
    //
    // clamp(MIN_LEN, MIN_LEN + (100vw - MIN_VW) * SLOPE, MAX_LEN) --
    // the standard fluid-typography pattern (every term a <length>,
    // combined only via +/-/* against a plain number, never a <length>
    // divided by a <length>). A first version of this used the
    // `(100vw - 320px) / 320px` trick to produce a unitless multiplier
    // instead -- valid per spec, but confirmed broken in a real Firefox
    // 155 (Raven's report, 2026-09-18: the whole lockup wrong at EVERY
    // width, not just narrow ones, with zero console errors -- exactly
    // what "--brand-scale invalid at computed-value time" looks like,
    // since an invalid custom property makes every declaration
    // referencing it via var() fall back silently, cascading to the
    // logo/h1/tagline/margins/gap at once). This form never divides two
    // lengths at all, so there's no such edge case to hit. Entirely in
    // px, not rem, for the two endpoints AND the slope -- an earlier
    // version of this same rewrite derived its slope in rem-per-px
    // terms then applied it as a bare number against a px quantity
    // (same unit in, same unit out -- not rem), making the growth 16x
    // too shallow; keeping everything in one unit throughout avoids
    // that mistake recurring. 0.0333 = (38.4 - 28.8) / (600 - 312),
    // i.e. px of --brand-scale gained per px of viewport growth between
    // the floor and ceiling above -- rounded to 4 places, off the exact
    // 1/30 by well under a hundredth of a pixel at either end.
    ":root {",
    "  --brand-scale: clamp(28.8px, calc(28.8px + (100vw - 312px) * 0.0333), 38.4px);",
    "}",
    "[hidden] { display: none; }",
    // Custom elements are `display: inline` by default with no UA
    // stylesheet override -- this component's content is always
    // block-level (a header row plus a hidden modal overlay), and
    // consumers rely on being able to apply block-level margin utilities
    // (e.g. mb-4) directly to <climbing-header> itself.
    "climbing-header { display: block; }",
    // <climbing-discipline-picker>/<climbing-burger-menu> (#211/#465) --
    // split from the former <climbing-menu-bar> (#346, classic-scripted in
    // #626), which needed `display: flex` here because it rendered TWO
    // children (picker + menu) that had to lay out side by side within one
    // custom element (default display: inline breaks that -- see this
    // rule's own git history for the fuller story, found via Raven's
    // production report, 2026-08-10). Each split-out component now wraps
    // exactly one child div, so `display: block` is enough -- no flex
    // layout to establish, and no `width: 100%` + ml-auto trick needed
    // either, since positioning is now the consuming page's job (its own
    // flex row + justify-end/justify-between), not baked into the
    // component (see climbing-burger-menu.js's own comment).
    "climbing-discipline-picker { display: block; }",
    "climbing-burger-menu { display: block; }",
    // #759 -- replaces the per-page "flex items-start justify-between
    // gap-2" div that used to wrap <climbing-header>+<climbing-burger-menu>
    // on all 16 real consumers; this component's own host element IS the
    // flex row now, not an inner wrapper div (see climbing-page-header.js's
    // own comment for the full history).
    "climbing-page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }",
    // #847/#861 -- the sync/offline status ring+glow climbing-burger-
    // menu.js draws around its own #header-menu-btn, replacing the
    // standalone icon between the brand header and the burger menu that
    // #762/#786/#787/#788 built and #789 found was crowding the brand
    // lockup in narrow mode. Two layered elements, not one:
    //
    // - .menu-sync-ring: a thin ring positioned via the "mask-composite:
    //   exclude" trick (an element sized slightly larger than the
    //   button, punched through in the middle by its own content-box,
    //   leaving only a border-thickness band) so it traces the button's
    //   own rounded-rect shape rather than a plain circle -- a crisp
    //   line, nothing more.
    // - .menu-sync-glow: a second, UNMASKED element behind it, same
    //   footprint, doing nothing but casting a soft box-shadow bloom.
    //   Found live (Raven's report, 2026-09-19) that putting the glow's
    //   box-shadow directly on .menu-sync-ring produced no visible glow
    //   at all: CSS masking composites the ENTIRE rendered output of
    //   the element it's applied to, box-shadow included, not just its
    //   background/fill -- so a shadow trying to bloom past the ring's
    //   own `inset: -3px` mask boundary was being clipped at that exact
    //   3px edge before it could ever spread. A shadow on a sibling
    //   element with no mask at all has nothing clipping it.
    //
    // data-sync-state (set by ClimbingBurgerMenu.setSyncState(),
    // climbing-burger-menu.js's own method) drives which state applies
    // on both layers together -- "working" pulses --sync-working
    // (below), "offline" sits static solid red (--color-accent) with no
    // animation: a deliberate escalation from "something's happening,
    // transient" to "this needs attention, settled" (Raven, 2026-09-18).
    // Absent state (data-sync-state unset) leaves both at opacity 0 --
    // no ring or glow at all, matching the old icon's own "idle"
    // (hidden) state.
    "#header-menu-btn { position: relative; }",
    ".menu-sync-ring, .menu-sync-glow {",
    "  position: absolute;",
    "  inset: -3px;",
    "  border-radius: calc(var(--r) + 3px);",
    "  opacity: 0;",
    "  pointer-events: none;",
    "}",
    ".menu-sync-ring {",
    "  padding: 2px;",
    "  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);",
    "  -webkit-mask-composite: xor;",
    "  mask-composite: exclude;",
    "}",
    // #861 -- three layered shadows on .menu-sync-glow (tight bright
    // core, mid halo, wide soft bloom via color-mix -- the same "mix a
    // color with transparent" pattern this file's own footnote-overlay
    // backdrop already uses), not one -- a single small blur read as a
    // subtle glow, not the pronounced, recognisable "status LED on a
    // physical device" look Raven asked for. Both elements share the
    // same opacity animation/value per state, so the ring and its glow
    // stay in lockstep -- one keyframe rule drives both.
    '#header-menu-btn[data-sync-state="working"] .menu-sync-ring {',
    "  background: var(--sync-working);",
    "  animation: menu-sync-pulse 3.6s ease-in-out infinite;",
    "}",
    '#header-menu-btn[data-sync-state="working"] .menu-sync-glow {',
    "  box-shadow: 0 0 1px 0px color-mix(in srgb, var(--sync-working) 80%, transparent), 0 0 4px 1px color-mix(in srgb, var(--sync-working) 55%, transparent), 0 0 7px 2px color-mix(in srgb, var(--sync-working) 25%, transparent);",
    // 3.6s, not 2.2s, and 0 (not .4) as the pulse's own low point --
    // found live, same report: the old, faster cycle with a non-zero
    // floor meant a sync that finished quickly could start and stop
    // mid-pulse, reading as an abrupt flash rather than a real status
    // light. Starting and ending each cycle at fully invisible gives a
    // genuine fade-in the first time the ring appears (a very short
    // sync only shows a soft rise, never a hard cut), then a slow
    // breathe for as long as it's genuinely still working.
    "  animation: menu-sync-pulse 3.6s ease-in-out infinite;",
    "}",
    '#header-menu-btn[data-sync-state="offline"] .menu-sync-ring {',
    "  opacity: 1;",
    "  background: var(--color-accent);",
    "}",
    '#header-menu-btn[data-sync-state="offline"] .menu-sync-glow {',
    "  opacity: 1;",
    "  box-shadow: 0 0 1px 0px color-mix(in srgb, var(--color-accent) 80%, transparent), 0 0 4px 1px color-mix(in srgb, var(--color-accent) 55%, transparent), 0 0 7px 2px color-mix(in srgb, var(--color-accent) 25%, transparent);",
    "}",
    "@keyframes menu-sync-pulse { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }",
    // Folds offline-sync.js's own pre-existing sync-btn-icon spin
    // (.animate-spin, Tailwind's utility class) into this same guard
    // rather than a second separate one, matching this rule's own
    // pre-#847 history of doing the same for the now-removed sync-
    // status-spin class.
    '@media (prefers-reduced-motion: reduce) { .animate-spin { animation: none; } #header-menu-btn[data-sync-state="working"] .menu-sync-ring, #header-menu-btn[data-sync-state="working"] .menu-sync-glow { animation: none; opacity: .8; } }',
    // .tab-nav/.tab-nav-item (#211/#465) -- shared visual language for
    // "a horizontal row of view switchers with an active-item indicator",
    // used by two components that are deliberately NOT the same element:
    // client/components/climbing-tab-bar.js (real <a> links between
    // separate pages -- WAI-ARIA Navigation pattern) and public/profile/
    // index.html's own #view-tabs (an in-page WAI-ARIA Tabs widget --
    // <button role="tab">, switching panels within one page, no
    // navigation). That split is correct and stays -- see climbing-tab-
    // bar.js's own comment for why merging the two into one component
    // would be an ARIA anti-pattern. What was NOT correct: their visual
    // styling had been hand-copy-pasted between the two files instead of
    // sharing a source, so a spacing fix applied to one silently didn't
    // reach the other (Raven's report, 2026-09-05). This rule is that
    // shared source -- both consumers apply .tab-nav to their container
    // and .tab-nav-item to each link/button, on top of whichever
    // page-layout margin utility (e.g. mb-5) their own context needs
    // (deliberately not baked in here, since one consumer's container is
    // a flex-item sibling of another element and one isn't -- see
    // climbing-tab-bar.js's own mb-5 comment for that distinction).
    // Active-state selector covers both consumers' own attribute
    // ([aria-current=page] for the link pattern, [aria-selected=true] for
    // the tab pattern) in one rule rather than needing two copies.
    // background/cursor/border-width reset folded in here too (no-ops for
    // <a>, needed for <button>) so neither consumer needs any classes of
    // its own beyond this one.
    ".tab-nav { display: flex; gap: .75rem; }",
    ".tab-nav-item {",
    "  background: transparent;",
    "  border-width: 0 0 2px 0;",
    "  border-style: solid;",
    "  border-color: transparent;",
    "  cursor: pointer;",
    "  text-decoration: none;",
    "  white-space: nowrap;",
    "  font-size: .95rem;",
    "  font-weight: 600;",
    "  color: var(--color-text-muted);",
    "  padding: 0 0 .5rem 0;",
    "  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);",
    "}",
    ".tab-nav-item:hover { color: var(--color-text); }",
    ".tab-nav-item[aria-current=\"page\"], .tab-nav-item[aria-selected=\"true\"] {",
    "  color: var(--color-text);",
    "  border-color: var(--color-accent);",
    "}",
    ".tab-nav-item:focus-visible {",
    "  outline: 2px solid var(--color-text);",
    "  outline-offset: 2px;",
    "}"
  ].join("\n");

  function injectTokens() {
    if (document.getElementById(TOKENS_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = TOKENS_STYLE_ID;
    style.textContent = TOKENS_CSS;
    document.head.appendChild(style);
  }

  // Runs at script-evaluation time (this file is a classic script, so
  // this happens synchronously mid-parse) -- not inside connectedCallback,
  // so the tokens exist before the parser even reaches <climbing-header>,
  // let alone before first paint.
  injectTokens();

  // Exact markup/classes from public/-/index.html's former
  // #brand-header-row and #footnote-overlay -- reused, not reinvented.
  // See #208 for the logo's cap-height/baseline alignment derivation and
  // #356 for why the logo uses fill="currentColor" rather than a
  // hardcoded hex. The footnote trigger/modal is specific to this
  // component (it only ever appears as part of it, per Raven, 2026-08-07)
  // so its open/close/focus-trap behavior is wired below, self-contained
  // -- not sharing client/modal-utils.js's createModalHelpers(), which
  // coordinates a fixed multi-overlay stacking list specific to whichever
  // page instantiates it. Consuming pages that also use that shared
  // modal machinery for other overlays (client/content-overlays.js,
  // client/modal-utils.js) need to leave the footnote out of their own
  // config, since this component already owns it end to end -- see
  // those files' own comments (#348).
  //
  // alignLeft (new, 2026-08-10): login/register/reset-password/apex are
  // narrow single-column pages, where centering this row (the default)
  // is correct -- but #348 later added /:username/{log,map,performance}
  // and the public profile page as consumers, and those are left-aligned
  // dashboard layouts matching /logbook's own #brand-header-row (no
  // justify-center there, no text-center on the tagline). Reusing the
  // centered markup unmodified for those four was wrong -- found via
  // Raven's production report. alignLeft is opt-in (default false) so
  // the four original, unaffected consumers don't change at all.
  function brandHtml(alignLeft) {
    // #789 -- every size below is `calc(var(--brand-scale) * <ratio to
    // the h1's own font-size>)`, so the whole lockup shrinks/grows as
    // one rigid unit (see --brand-scale's own comment, in TOKENS_CSS,
    // for why -- including why this is a length-times-number, not the
    // reverse, after a Firefox-only bug in the first version of this).
    // No property here has its own independent breakpoint any more --
    // that was the actual bug (see #789/#791 history: the logo, h1 and
    // tagline each had their own max-[600px]/max-[400px] rules that
    // didn't even reduce by the same ratio as each other, so
    // "unwrappable" and "in proportion" kept failing together). Ratios
    // are each original value's own size relative to the h1's original
    // 2.4rem: tagline .8512/2.4, logo width 54.272px/38.4px, logo
    // height 42.4px/38.4px, logo margin 4.48px/38.4px, row gap
    // .26rem/2.4rem, h1's own margin -.3rem/2.4rem.
    var rowClass = alignLeft
      ? "flex items-end gap-[calc(var(--brand-scale)*0.1083)] mb-4"
      : "flex items-end justify-center gap-[calc(var(--brand-scale)*0.1083)] mb-4";
    // whitespace-nowrap -- found live (Raven's report, 2026-09-19, a
    // real 312px-wide device): the h1 already had this (#789), but the
    // tagline never did, so IT was the one that wrapped once the
    // tagline's own text (longer than the h1's, just rendered smaller)
    // ran out of room -- the exact same class of bug #789 fixed for
    // the h1, just on the other element.
    var taglineClass = "font-display font-normal uppercase tracking-wide leading-none whitespace-nowrap text-[calc(var(--brand-scale)*0.3547)] text-muted mb-0" + (alignLeft ? "" : " text-center");
    return (
      '<div class="' + rowClass + '" id="brand-header-row">' +
      '  <div class="shrink-0 flex mb-[calc(var(--brand-scale)*0.1167)]">' +
      '    <svg class="w-[calc(var(--brand-scale)*1.4133)] h-[calc(var(--brand-scale)*1.1042)]" viewBox="0 14.4 122.88 96" aria-hidden="true">' +
      '      <path d="M45.6,14.4l23.718,48l-2.99,6l-21.689,0l10.843,21.6l-10.142,20.4l-45.342,0l45.6,-96Z" fill="currentColor"/>' +
      '      <path d="M85.203,37.2l16.333,31.2l-10.787,21.6l21.63,0l10.501,20.4l-74.042,0l36.364,-73.2Z" fill="currentColor"/>' +
      '    </svg>' +
      '  </div>' +
      '  <div>' +
      // #789 -- whitespace-nowrap: the title has no wrap
      // opportunity of its own (it's meant to read as one wordmark).
      // Without it, a narrow flex row (this brand block is a sibling of
      // the sync icon+burger-menu group in climbing-page-header's own
      // space-between row) could squeeze this element's box below its
      // natural text width, and the browser filled that by wrapping
      // "Climbing"/"Logbook" onto two lines -- the original bug report.
      // nowrap forbids that escape valve entirely (so it can never
      // wrap, regardless of available space); --brand-scale is what
      // keeps the now-unshrinkable text a sensible size at narrow
      // viewports instead of just overflowing.
      // [font-size:var(--brand-scale)], not text-[var(--brand-scale)] --
      // found live (Raven's report, 2026-09-18): the `text-` prefix is
      // ambiguous between Tailwind's font-size and text-color utilities,
      // and a bare var() with no calc()/unit hint resolves that
      // ambiguity as a COLOR arbitrary value (compiles to `color:
      // var(--brand-scale)`, not `font-size: ...`) -- silently a no-op
      // here since --brand-scale is a length, invalid as a color, so
      // the h1 fell back to the browser's own default h1 sizing
      // regardless of viewport. The explicit property syntax (already
      // used by this file's own footnote-trigger button, below) has no
      // such ambiguity to resolve.
      '    <h1 class="font-display font-normal uppercase tracking-wide [font-size:var(--brand-scale)] leading-none mb-[calc(var(--brand-scale)*-0.125)] whitespace-nowrap"><span class="text-accent">Climbing</span> <span class="text-foreground relative">Logbook' +
      // #956 -- Raven's design: a yellow tag leaning like the K's arm,
      // over the word's top-right corner. Absolutely positioned, so it
      // adds no width to a row that must never wrap (#789). The tag is
      // decoration, drawn with ::after so the heading's text stays
      // "Climbing Logbook Beta"; screen readers get "Beta" from the sr-only
      // text.
      (IS_BETA
        ? '<span class="absolute left-[calc(100%-var(--brand-scale)*0.07)] top-[calc(var(--brand-scale)*0.18)] -skew-x-[20deg] bg-[#ffcc00] text-[#0f0f0f] leading-none [font-size:calc(var(--brand-scale)*0.225)] tracking-wide px-[.5em] pt-[.12em] pb-[.02em]" id="beta-badge" aria-hidden="true"><span class="inline-block skew-x-[20deg] after:content-[attr(data-label)]" data-label="Beta"></span></span><span class="sr-only"> Beta</span>'
        : '') +
      '</span></h1>' +
      '    <p class="' + taglineClass + '">Log your climbs, visualise your progress (<button type="button" class="inline [font-size:inherit] bg-transparent border-0 p-0 cursor-pointer text-accent" id="footnote-trigger">or not</button>)</p>' +
      '  </div>' +
      '</div>' +
      '<div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-center justify-center px-4 py-6 overflow-y-auto" id="footnote-overlay" hidden role="dialog" aria-modal="true" aria-label="Or not" tabindex="-1">' +
      '  <div class="bg-background border border-border rounded-app p-5 w-full max-w-[380px]">' +
      '    <div class="flex justify-end mb-1">' +
      '      <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-[1.1rem] leading-none p-[.2rem] hover:text-foreground" id="footnote-close" aria-label="Close">✕</button>' +
      '    </div>' +
      '    <p class="text-foreground text-[.95rem]">...or just keep a list because who can remember All The Stuffs™️ these days? Share it with friends, rivals, concerned family members, or internet strangers. See it on a map. Celebrate your success whether it\'s pulling on the first moves scared or sending your big proj. Just get out there and have fun climbing rocks &lt;3.</p>' +
      '  </div>' +
      '</div>'
    );
  }

  function focusableEls(overlay) {
    return [].slice.call(overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  class ClimbingHeader extends HTMLElement {
    connectedCallback() {
      if (this.getAttribute("variant") !== "brand") return;
      this.innerHTML = brandHtml(this.hasAttribute("align-left"));
      this._wireFootnote();
    }

    _wireFootnote() {
      var trigger = this.querySelector("#footnote-trigger");
      var overlay = this.querySelector("#footnote-overlay");
      var closeBtn = this.querySelector("#footnote-close");
      var lastFocusedEl = null;

      function open() {
        lastFocusedEl = document.activeElement;
        overlay.hidden = false;
        overlay.scrollTop = 0;
        (focusableEls(overlay)[0] || overlay).focus();
      }
      function close() {
        overlay.hidden = true;
        if (lastFocusedEl) lastFocusedEl.focus();
      }

      trigger.addEventListener("click", open);
      closeBtn.addEventListener("click", close);
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });
      document.addEventListener("keydown", function (e) {
        if (overlay.hidden) return;
        if (e.key === "Escape") {
          close();
          return;
        }
        if (e.key === "Tab") {
          var focusable = focusableEls(overlay);
          if (focusable.length === 0) return;
          var first = focusable[0];
          var last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    }
  }

  customElements.define("climbing-header", ClimbingHeader);
})();
