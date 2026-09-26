// Links between pages, so a navigation landmark with aria-current, not an ARIA tablist.
import { escapeHtml } from "../escape-html.js";

// encodeURIComponent is enough for the URL, but innerHTML policy is to escape everything.
function encodePathSegment(value) {
  return escapeHtml(encodeURIComponent(value ?? ""));
}

const TABS = [
  { page: "log", label: "Logbook" },
  { page: "performance", label: "Performance", requiresPerformance: true },
];

const LINK_CLASSES = "tab-nav-item";

export class ClimbingTabBar extends HTMLElement {
  static get observedAttributes() {
    return ["username", "active-page", "show-performance"];
  }

  // Renders once, after settings load, so the Performance tab doesn't pop in afterwards.
  #ready = false;

  connectedCallback() {
    if (this.#ready) this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected && this.#ready) this.render();
  }

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

    // No margin here: inside a flex item it would break the row's bottom alignment.
    this.innerHTML = `<nav class="tab-nav" aria-label="View">${links}</nav>`;
  }
}

customElements.define("climbing-tab-bar", ClimbingTabBar);
