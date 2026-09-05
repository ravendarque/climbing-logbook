// <climbing-tab-bar> (#349): route-aware replacement for /logbook's
// #view-tabs. Unlike #345/#346 (pure markup extractions, no behavior
// change), this component's actual behavior is new -- today's tabs
// drive a client-side view switch (main.js's setActiveView()) inside
// the single /logbook page; once #348 splits the app into real separate
// pages, each tab needs to be a real link between them instead.
// /logbook itself is untouched (parallel-migration decision) and keeps
// its own client-side-switch #view-tabs exactly as-is -- this component
// is built fresh for #348's pages, not extracted from /logbook's
// existing markup verbatim.
//
// ARIA correction, not a mechanical copy of /logbook's tab-role markup:
// WAI-ARIA's Tabs pattern is for switching panels within ONE page --
// /logbook's role="tablist"/role="tab"/aria-selected/aria-controls
// markup is correct THERE, because that's genuinely what it does. Once
// each tab is a link to a different page, "tabs" is the wrong pattern
// -- the correct semantics for "a set of links to different pages, one
// of which is the current one" is a plain navigation landmark with
// aria-current="page" on the active link (WAI-ARIA APG's Navigation
// pattern, not Tabs). Applying role="tab" here would be an ARIA
// anti-pattern, not just a style choice.
//
// Reflects, doesn't own, external state -- same "no store.js/adminFetch
// coupling" reasoning as #346: this component doesn't know the current
// user or whether Athlete Mode is on, so those are properties/attributes
// set from outside by whichever page's composition root uses it.
// "./escape-html.js", not "../escape-html.js" -- see
// climbing-entries-table.js's own comment for why (esbuild's --external
// bundling convention needs the literal specifier to match the flat
// output layout, not this file's own real nesting).
import { escapeHtml } from "./escape-html.js";

// encodeURIComponent alone makes the URL correct (and, incidentally,
// already can't break out of the href="..." attribute either -- its
// output charset excludes every HTML metacharacter), but escapeHtml on
// top is the actual documented policy (docs/coding-standards.md: every
// field landing in a template string bound for innerHTML goes through
// escapeHtml first) -- every sibling component in this epic
// (climbing-entries-table.js, climbing-grade-pyramid.js) applies it
// unconditionally too, not just where a specific character set analysis
// says it's currently needed. Found via code review (2026-08-09): this
// was the one component that had drifted from that policy.
function encodePathSegment(value) {
  return escapeHtml(encodeURIComponent(value ?? ""));
}

// #211/#465 -- Map dropped from this tab bar entirely (Raven's call: the
// /map route and page stay fully alive, just no longer linked from here --
// "no on-page navigation between profile and app for now" is the accepted
// gap). log is always present regardless of show-performance; performance
// is the only conditionally-visible tab now.
const TABS = [
  { page: "log", label: "Logbook" },
  // Performance Insights requires BOTH being logged in AND Athlete Mode on
  // (#151, carried forward from /logbook's own updateAdminBar() rule) --
  // gated by the show-performance attribute below, not hardcoded here.
  // Label shortened from "Performance Insights" to "Performance" (#211) --
  // room freed up by the discipline picker moving out of its own row and
  // in next to this one.
  { page: "performance", label: "Performance", requiresPerformance: true },
];

// #211/#465 -- was a locally-owned Tailwind utility string (including its
// own no-underline fix, Raven's production report 2026-08-10); now the
// shared .tab-nav-item rule in public/logbook/components/climbing-header.js
// -- see that rule's own comment for why this is shared with public/
// profile/index.html's #view-tabs despite the two being genuinely
// different components.
const LINK_CLASSES = "tab-nav-item";

export class ClimbingTabBar extends HTMLElement {
  static get observedAttributes() {
    return ["username", "active-page", "show-performance"];
  }

  // #605 -- username/active-page are known synchronously (set at each
  // composition root's module scope, before boot() even starts), but
  // show-performance depends on a real network round trip
  // (adminAuth.resolveActiveType()'s checkSession()/fetchSettings()) that
  // resolves well after this element's first paint. Rendering eagerly on
  // every attribute change -- as this used to do -- means the very first
  // real paint shows 2 tabs, then ~100ms later a second render adds the
  // 3rd (Performance Insights) tab, visibly reflowing the header (the
  // "collapses then expands" report this issue tracks). #ready gates out
  // every render until markReady() (called once, by each composition
  // root's boot(), right after resolveActiveType() resolves) -- so
  // there's exactly one render per page load, already in its final
  // correct shape, at the cost of the tab bar's own first paint landing
  // slightly later than the rest of the page rather than appearing twice.
  #ready = false;

  connectedCallback() {
    if (this.#ready) this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected && this.#ready) this.render();
  }

  // Idempotent -- composition roots call this unconditionally once
  // boot() reaches its own final render(), which itself can be reached
  // more than once in principle (e.g. a future re-boot path); only the
  // first call may transition #ready from false to true.
  markReady() {
    if (this.#ready) return;
    this.#ready = true;
    this.render();
  }

  render() {
    const username = this.getAttribute("username") || "";
    const activePage = this.getAttribute("active-page") || "";
    const showPerformance = this.hasAttribute("show-performance");

    const visibleTabs = TABS.filter(t => !t.requiresPerformance || showPerformance);

    const links = visibleTabs
      .map(t => `
        <a href="/${encodePathSegment(username)}/${t.page}" class="${LINK_CLASSES}"${t.page === activePage ? ' aria-current="page"' : ""}>${t.label}</a>
      `)
      .join("");

    // #211/#465 -- mb-5 moved out to the composing page's own wrapper row
    // (picker-tabs-row), not carried here: this component now sits beside
    // <climbing-discipline-picker> as a flex item, and a trailing margin on
    // an element INSIDE a flex item gets absorbed into that item's own box
    // rather than producing real sibling spacing after it -- which broke
    // items-end alignment between the two (the nav's content stayed pinned
    // to the top of its own now-taller box instead of the bottom). Found
    // via direct measurement in the browser, not by eye. The container's
    // gap (originally a local gap-5, tightened to gap-3 after Map's
    // removal left only 2 tabs sharing it -- Raven's report) now lives in
    // the shared .tab-nav rule instead, for the same reason LINK_CLASSES
    // moved out: a value duplicated across this file and public/profile/
    // index.html silently drifts out of sync when only one copy gets
    // fixed.
    this.innerHTML = `<nav class="tab-nav" aria-label="View">${links}</nav>`;
  }
}

customElements.define("climbing-tab-bar", ClimbingTabBar);
