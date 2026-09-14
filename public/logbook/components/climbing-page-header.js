// <climbing-page-header> (#759): folds the previously hand-copied
// #brand-row wrapper into one owned component. Confirmed via
// `grep -rn 'id="brand-row"'` (2026-09-14): all 16 real consumers
// (/log, /map, /profile, /performance + its 8 subpages, /account +
// /edit + /import, /sync, /beta-gate) paired the exact same two
// elements the exact same way --
//
//   <div class="flex items-start justify-between gap-2[ mb-6]" id="brand-row">
//     <climbing-header variant="brand" align-left></climbing-header>
//     <climbing-burger-menu[ admin-hidden]></climbing-burger-menu>
//   </div>
//
// -- byte-for-byte identical apart from the two variations this
// component still exposes below. The thing that varied page-to-page was
// nothing else, so there was nothing left for any page to independently
// get wrong except by copy-paste drift -- which had already happened
// once (#754's e2e fixtures were never updated to match the real
// pages' markup, caught during this issue's own investigation).
//
// display/align-items/justify-content/gap live in climbing-header.js's
// own shared token stylesheet, not a style tag here -- this component's
// sibling rules (climbing-burger-menu, climbing-discipline-picker)
// already live there too; one synchronously-injected stylesheet for
// every sibling component's display rule, not one per file. See that
// file's own TOKENS_CSS comment.
//
// class="mb-6" (5 of the 16 consumers -- account/account-edit/
// account-import/sync/beta-gate) vs no margin (the other 11) stays a
// per-page class on this element itself, same as every other shared
// component here receives its page-specific margin externally
// (climbing-tab-bar, climbing-burger-menu) -- not baked in, since the
// two groups genuinely need different values and there's no single
// correct default.
//
// admin-hidden: forwarded to the inner <climbing-burger-menu>,
// unchanged meaning -- only the public profile page
// (client/profile-main.js) sets it, the same single real consumer that
// component always had.
//
// align-left is NOT exposed here (unlike raw <climbing-header>, which
// still supports both) -- every one of this component's real consumers
// wants it, so it's hardcoded rather than plumbed through as a pointless
// always-true attribute. login/register/reset-password/apex, the four
// consumers that want <climbing-header> centered with no burger menu at
// all, use that element directly and don't go through this component.
(function () {
  class ClimbingPageHeader extends HTMLElement {
    connectedCallback() {
      var adminHidden = this.hasAttribute("admin-hidden") ? " admin-hidden" : "";
      this.innerHTML =
        '<climbing-header variant="brand" align-left></climbing-header>' +
        "<climbing-burger-menu" + adminHidden + "></climbing-burger-menu>";
    }
  }

  customElements.define("climbing-page-header", ClimbingPageHeader);
})();
