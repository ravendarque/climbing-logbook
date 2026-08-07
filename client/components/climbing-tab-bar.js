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
function encodePathSegment(value) {
  return encodeURIComponent(value ?? "");
}

const TABS = [
  { page: "log", label: "Logbook" },
  { page: "map", label: "Map" },
  // Grade Pyramid requires BOTH being logged in AND Athlete Mode on
  // (#151, carried forward from /logbook's own updateAdminBar() rule) --
  // gated by the show-performance attribute below, not hardcoded here.
  { page: "performance", label: "Grade Pyramid", requiresPerformance: true },
];

const LINK_CLASSES = "whitespace-nowrap text-[.95rem] font-semibold text-muted pb-2 border-b-2 border-transparent transition-colors duration-150 hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2";

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

    // Same rule as /logbook's own updateAdminBar(): the bar itself only
    // makes sense once there's something to choose between.
    const hidden = visibleTabs.length < 2;

    const links = visibleTabs
      .map(t => `
        <a href="/${encodePathSegment(username)}/${t.page}" class="${LINK_CLASSES}"${t.page === activePage ? ' aria-current="page"' : ""}>${t.label}</a>
      `)
      .join("");

    this.innerHTML = `<nav class="flex gap-5 mb-5" aria-label="View"${hidden ? " hidden" : ""}>${links}</nav>`;
  }
}

customElements.define("climbing-tab-bar", ClimbingTabBar);
