// Copies shared/demo-personas.js by hand: this unbundled script can't import from shared/.
const DEMO_PERSONAS = [
  { username: "beginnerdemo", label: "Beginner", description: "Just starting out -- early V-grade boulders, first leads on toprope and easy sport routes." },
  { username: "intermediatedemo", label: "Intermediate", description: "A season or two in -- consistent mid-grade sends, a few onsight/redpoint projects on the go." },
  { username: "advanceddemo", label: "Advanced", description: "Years of mileage -- hard boulder/lead grades, a long send history across disciplines." },
];

import { resolveAppOrigin } from "/-/login/resolve-app-origin.js";

const APP_ORIGIN = resolveAppOrigin(window.location.hostname, false);

const trigger = document.getElementById("demo-picker-trigger");
const popover = document.getElementById("demo-picker-popover");
const list = document.getElementById("demo-picker-list");

// The full app, not the read-only profile: demo accounts' pages need no session.
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
