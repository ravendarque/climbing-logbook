// <climbing-page-header> (#759, reworked #882): the layout host for every
// page's header row -- brand on the left, burger menu on the right. Its
// children are rendered at build time (views/_includes/page-header.njk),
// not built here at runtime any more; display/align-items/justify-content
// come from climbing-header.js's shared token stylesheet.
//
// class="mb-6" (account/account-edit/account-import/sync/beta-gate) vs no
// margin stays a per-page class on this element, set through the include's
// `headerClass` variable.
//
// setSyncState is called from ES-module code (client/sync-status-icon.js)
// via a plain DOM reference (document.querySelector("climbing-page-header")),
// never an import -- this file has no import capability at all. Kept as
// this component's own public method so that file's only coupling stays to
// the page's outer shell, not to which inner component owns the indicator.
(function () {
  class ClimbingPageHeader extends HTMLElement {
    setSyncState(state) {
      var menu = this.querySelector("climbing-burger-menu");
      if (menu && menu.setSyncState) menu.setSyncState(state);
    }
  }

  customElements.define("climbing-page-header", ClimbingPageHeader);
})();
