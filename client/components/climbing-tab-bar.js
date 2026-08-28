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

// log and map are always present regardless of show-performance -- unlike
// /logbook's own #view-tabs (whose visibility rule this component
// originally carried forward verbatim), there's never a state where fewer
// than 2 tabs are visible here, so this component doesn't hide itself the
// way that one does; that check was dead code (removed via code review,
// 2026-08-09) on every one of this component's three real consumers.
const TABS = [
  { page: "log", label: "Logbook" },
  { page: "map", label: "Map" },
  // Performance Insights requires BOTH being logged in AND Athlete Mode on
  // (#151, carried forward from /logbook's own updateAdminBar() rule) --
  // gated by the show-performance attribute below, not hardcoded here.
  { page: "performance", label: "Performance Insights", requiresPerformance: true },
];

// no-underline: these are real <a> links (unlike /logbook's own <button>-
// based tabs, which never needed it) -- nothing in this codebase's global
// CSS strips the browser's default anchor underline, so without it every
// tab renders underlined. Found via Raven's production report, 2026-08-10.
const LINK_CLASSES = "no-underline whitespace-nowrap text-[.95rem] font-semibold text-muted pb-2 border-b-2 border-transparent transition-colors duration-150 hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2";

export class ClimbingTabBar extends HTMLElement {
  static get observedAttributes() {
    return ["username", "active-page", "show-performance"];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
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

    this.innerHTML = `<nav class="flex gap-5 mb-5" aria-label="View">${links}</nav>`;
  }
}

customElements.define("climbing-tab-bar", ClimbingTabBar);
