// Pages reach setSyncState through a DOM reference: this classic script can't be imported.
(function () {
  class ClimbingPageHeader extends HTMLElement {
    setSyncState(state) {
      var menu = this.querySelector("climbing-burger-menu");
      if (menu && menu.setSyncState) menu.setSyncState(state);
    }
  }

  customElements.define("climbing-page-header", ClimbingPageHeader);
})();
