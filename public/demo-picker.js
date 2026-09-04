// #251 -- the apex landing page's "View demo" popup: three persona links
// to the seeded, publicly-viewable demo accounts. Outside client/'s
// bundled module graph deliberately, same reasoning public/login/login.js's
// own header comment gives for that page -- public/index.html has no
// bundled JS of its own at all today, and this is a small enough addition
// not to be the thing that changes that.
//
// Duplicates shared/demo-personas.js's persona list rather than importing
// it: shared/ is only reachable from client/'s *bundled* module graph
// (esbuild inlines it at build time) -- a plain unbundled script under
// public/ has no bundler, and shared/ isn't itself part of the public/
// static-asset tree Workers Static Assets serves, so a runtime import of
// "../shared/demo-personas.js" would 404. Three short, rarely-changing
// entries; kept in sync by hand, same trade-off server/api/owned-routes.js's
// loginUrl() and client/admin-auth.js's LOGIN_PAGE_URL already make for
// their own independently-duplicated hostname list.
const DEMO_PERSONAS = [
  { username: "beginnerdemo", label: "Beginner", description: "Just starting out -- early V-grade boulders, first leads on toprope and easy sport routes." },
  { username: "intermediatedemo", label: "Intermediate", description: "A season or two in -- consistent mid-grade sends, a few onsight/redpoint projects on the go." },
  { username: "advanceddemo", label: "Advanced", description: "Years of mileage -- hard boulder/lead grades, a long send history across disciplines." },
];

// #113 -- the app itself lives at my.<domain>/:username, cross-origin from
// this apex page in production; same-origin fallback for local dev/PR
// previews, which don't have a real my.<domain> to link to. Mirrors
// public/login/resolve-app-origin.js's own resolveAppOrigin(hostname,
// false) exactly (demo links always go to my.x, never beta.x) -- not
// imported directly for the same "outside client/'s bundled graph" reason
// DEMO_PERSONAS above isn't either, but public/login/resolve-app-origin.js
// is itself outside client/ too (a plain public/ file), so this one *is*
// import-safe -- both live under public/, no bundler involved either way.
import { resolveAppOrigin } from "./login/resolve-app-origin.js";

const APP_ORIGIN = resolveAppOrigin(window.location.hostname, false);

const trigger = document.getElementById("demo-picker-trigger");
const popover = document.getElementById("demo-picker-popover");
const list = document.getElementById("demo-picker-list");

// #251 -- links to /:username/log, not the bare public profile page: the
// real, full app experience (owned-routes.js's isDemoOwnedPage bypass
// makes it reachable with no session) is the actual demo, not the
// separate read-only page real users' public profiles use.
list.innerHTML = DEMO_PERSONAS.map(p => `
  <a class="flex flex-col gap-[.15rem] px-[.7rem] py-[.6rem] rounded-[calc(var(--radius-app)-2px)] text-left no-underline hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]" href="${APP_ORIGIN}/${encodeURIComponent(p.username)}/log">
    <span class="text-[.9rem] font-bold text-foreground">${p.label}</span>
    <span class="text-[.78rem] text-muted">${p.description}</span>
  </a>
`).join("");

function closePopover() {
  popover.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

trigger.addEventListener("click", () => {
  const isOpen = !popover.hidden;
  popover.hidden = isOpen;
  trigger.setAttribute("aria-expanded", String(!isOpen));
});

document.addEventListener("click", e => {
  if (!popover.hidden && !e.target.closest("#demo-picker-wrap")) closePopover();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !popover.hidden) closePopover();
});
