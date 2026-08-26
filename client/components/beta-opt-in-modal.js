// <beta-opt-in-modal> (#443/#546, ADR-0020): the shared consent form for
// opting in/out of the beta.climbinglogbook.com early-access channel.
// Markup-only, same split as <climbing-menu-bar> (#346) -- this component
// owns the template, a separate wiring module (client/beta-opt-in.js)
// owns the open/close/submit behavior, using client/modal-utils.js's
// shared createModalHelpers() for the focus-trap/Escape-to-close
// mechanics rather than duplicating that logic here.
//
// Built as a genuine reusable custom element (not static markup baked
// into one page's own shell, unlike client/entry-form.js's entry-overlay)
// because ADR-0020 needs it importable from two different composition
// roots: this page's own account settings card (#546, this issue) and
// #548's server-rendered beta.x gate shell -- two separately-bundled
// pages, not two call sites within one page's own boot().
//
// Visual language matches public/log/index.html's entry-overlay exactly
// (same backdrop/card/z-index conventions) -- z-[100] is safe to reuse
// here since no other overlay from client/modal-utils.js's own
// DEFAULT_OVERLAY_IDS stacking order ever coexists on either of this
// component's two consumer pages.
const TEMPLATE = `
  <div class="fixed inset-0 z-[100] bg-[color-mix(in_srgb,black_60%,transparent)] flex items-start justify-center px-4 py-6 overflow-y-auto" id="beta-opt-in-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="beta-opt-in-title" tabindex="-1">
    <div class="bg-background border border-border rounded-app p-5 w-full max-w-[460px]">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-[1.15rem] font-bold text-accent" id="beta-opt-in-title">Check our beta</h2>
        <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-[1.1rem] leading-none p-[.2rem] hover:text-foreground" id="beta-opt-in-close" aria-label="Close">✕</button>
      </div>

      <p class="text-[.9rem] text-foreground mb-2">
        Our beta channel (beta.climbinglogbook.com) gets new features before they reach everyone else. That means things there are more likely to be unfinished or break -- it's a real early-access channel, not just a preview.
      </p>
      <p class="text-[.9rem] text-foreground mb-4">
        Your data is exactly the same in both places -- nothing about opting in changes what's stored, only which version of the app you see. You can change this choice any time from My account.
      </p>

      <form id="beta-opt-in-form">
        <div class="flex flex-col gap-2 mb-4">
          <label class="flex items-center gap-2 text-[.9rem] text-foreground cursor-pointer">
            <input type="radio" name="beta-opt-in-choice" value="in" class="w-4 h-4 accent-accent" required>
            Yes, I want to opt in to early access
          </label>
          <label class="flex items-center gap-2 text-[.9rem] text-foreground cursor-pointer">
            <input type="radio" name="beta-opt-in-choice" value="out" class="w-4 h-4 accent-accent">
            No, I want to opt out of early access
          </label>
        </div>
        <p class="text-[.85rem] text-accent mb-3" id="beta-opt-in-error" hidden></p>
        <div class="flex gap-2">
          <button type="submit" class="admin-btn admin-btn-primary" id="beta-opt-in-submit">Submit</button>
          <button type="button" class="admin-btn" id="beta-opt-in-cancel">Cancel</button>
        </div>
      </form>
    </div>
  </div>
`;

export class BetaOptInModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = TEMPLATE;
  }
}

customElements.define("beta-opt-in-modal", BetaOptInModal);
