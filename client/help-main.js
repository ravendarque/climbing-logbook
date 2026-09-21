// #876/#878 -- /help pages are genuinely static content (no Store, no
// admin-auth flow, no discipline concept), same no-session shape
// the public profile page already established -- but the header menu
// popover (theme toggle + a way back out) still needs real, live click
// wiring, and that logic (createDisclosure/createThemeToggle) only
// exists as Vite-bundled chunks in production, not directly-linkable
// static files (confirmed live, 2026-09-20 -- a first pass tried
// importing them as plain <script type="module"> src paths, which
// happened to work in dev, where Vite serves the raw source tree
// unbundled as a convenience, but 404s in a real production build).
// This entry exists purely to give /help a real, small bundle that can
// reuse those two centralized pieces properly, rather than duplicating
// their logic inline -- exactly the class of drift-prone copy
// theme-toggle.js's own header comment already flags a past instance of.
//
// Same two calls, no injected dependencies, as client/profile-main.js's
// own identical header-menu-popover section -- see that file's own
// comment for the fuller "no store/adminFetch needed for this half"
// reasoning.
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";

createDisclosure(document.getElementById("header-menu-btn"), document.getElementById("header-menu-popover"), "#header-menu-wrap");
createThemeToggle();

// #885 -- narrow mode: the topic list collapses behind a toggle (markup and
// the breakpoint CSS live in views/_includes/help-layout.njk). Above 600px
// the toggle is display:none and the list is always shown, so this does
// nothing there.
const helpNav = document.getElementById("help-nav");
const helpNavBtn = document.getElementById("help-nav-btn");
helpNavBtn?.addEventListener("click", () => {
  const open = helpNav.toggleAttribute("data-open");
  helpNavBtn.setAttribute("aria-expanded", String(open));
});
