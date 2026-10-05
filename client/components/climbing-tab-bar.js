// Links between pages, so a navigation landmark with aria-current, not an ARIA tablist. The page supplies the links.
export class ClimbingTabBar extends HTMLElement {
  static get observedAttributes() {
    return ["username", "active-page"];
  }

  connectedCallback() {
    this.#apply();
  }

  attributeChangedCallback() {
    this.#apply();
  }

  // Shown once the page's settings are in, so a tab the page reveals doesn't pop in afterwards.
  markReady() {
    this.toggleAttribute("ready", true);
  }

  #apply() {
    const username = encodeURIComponent(this.getAttribute("username") || "");
    const activePage = this.getAttribute("active-page");
    for (const link of this.querySelectorAll("a[data-page]")) {
      link.href = `/${username}/${link.dataset.page}`;
      if (link.dataset.page === activePage) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }
}

customElements.define("climbing-tab-bar", ClimbingTabBar);
