// The header's discipline picker, header menu (Athlete Mode/theme
// toggle/login live inside it), and theme persistence/toggling (#240,
// seventh piece of #233's modularization epic). Reads/writes active
// discipline through the Store (#234).
//
// `resetPyramidExpansion` is the one narrow callback into pyramid-view.js's
// own module (not the whole module -- this only ever needs "reset the
// lower-grades toggle on discipline switch," nothing else about the
// Pyramid view), and `adminFetch`/`isAuthRedirect`/`adminSettingsUrl` are
// the same not-yet-extracted auth/admin-bar surface place-picker.js and
// entry-form.js already depend on. `render`/`updateAdminBar` are no
// longer injected (#264) -- every state change here goes through a Store
// setter, which notifies main.js's render() (the Store's sole subscriber)
// automatically.
import { createDisclosure } from "./modal-utils.js";
import { createThemeToggle } from "./theme-toggle.js";
import { disciplineLabel } from "./status.js";

export function createHeaderChrome({
  store,
  resetPyramidExpansion,
  adminFetch,
  isAuthRedirect,
  adminSettingsUrl,
}) {
  // ── Theme toggle (light/dark) ─────────────────────────────────────────
  createThemeToggle();

  // ── Discipline picker (#110): header popover, always offers both
  // disciplines regardless of entry counts -- see the markup comment
  // above discipline-btn for why. Same interaction pattern as filter-btn/
  // filter-panel (delegated click, close on outside click), plus
  // Escape-to-close via createDisclosure.
  const disciplineBtn = document.getElementById("discipline-btn");
  const disciplinePopover = document.getElementById("discipline-popover");
  const { close: closeDisciplinePopover } = createDisclosure(disciplineBtn, disciplinePopover, "#discipline-wrap");

  // Called every render() cycle (not just on switch) to keep the label/
  // aria-label/aria-selected state in sync with the Store's active type.
  function updateDisciplinePicker() {
    document.getElementById("discipline-btn-label").textContent = disciplineLabel(store.getActiveType());
    // Kept in sync even though the visible label above covers most widths --
    // aria-label always wins over visible text content for the accessible
    // name, so this is what a screen reader announces once the label span
    // itself is hidden below the icon-collapse breakpoint (#114).
    disciplineBtn.setAttribute("aria-label", `Discipline: ${disciplineLabel(store.getActiveType())}`);
    document.querySelectorAll(".discipline-option").forEach(opt =>
      opt.setAttribute("aria-selected", String(opt.dataset.discipline === store.getActiveType()))
    );
  }

  disciplinePopover.addEventListener("click", async e => {
    const opt = e.target.closest(".discipline-option");
    if (!opt) return;
    // store.setActiveType() resets gradeRange itself (boulder and lead
    // grades aren't the same scale -- carrying a range like "6A-7B+" over
    // as some translated lead range would silently filter to something
    // the user didn't ask for, #161); the Pyramid's lower-grades
    // expansion is reset via its own module's callback.
    //
    // resetPyramidExpansion() deliberately runs BEFORE store.setActiveType()
    // (#264) -- setActiveType() is a Store mutation, so it synchronously
    // triggers the subscribed render() the moment it's called; if
    // lowerGradesExpanded (pyramid-view.js's own private state, not Store
    // state) hadn't already been reset by then, that auto-triggered render
    // would still be showing the previous discipline's expanded lower-grades
    // section, since nothing re-renders again afterward.
    resetPyramidExpansion();
    store.setActiveType(opt.dataset.discipline);
    closeDisciplinePopover();
    disciplineBtn.focus();

    // Best-effort persistence (#137) -- PATCH is Access-gated (same
    // boundary as Athlete Mode), so this only actually persists when
    // logged in; a logged-out visitor's switch stays local, same as
    // every other admin-only write in this app. Never blocks or reverts
    // the local switch above either way -- offline/failure just means
    // it doesn't carry over to other devices this time.
    try {
      const res = await adminFetch(adminSettingsUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeDiscipline: store.getActiveType() }),
      });
      if (res.status === 401 || isAuthRedirect(res)) {
        store.setLoggedIn(false); // Store mutation -- notify() covers the admin-bar update (#264)
      }
    } catch {
      // Offline or network error -- local switch already applied.
    }
  });

  // ── Header menu (#119, #122, #138, #155): Athlete Mode, theme toggle,
  // and Log in/out live in this popover at every viewport width -- it
  // used to only collapse them in here below 480px (reparenting the DOM
  // nodes between the header row and here as the viewport crossed that
  // breakpoint), but the popover turned out to just be a better pattern
  // outright, not a narrow-viewport compromise, so it's used everywhere
  // now and the wide-row layout it used to also support is gone. The
  // discipline picker is deliberately NOT part of this popover (#138) --
  // with it collapsed, there was no visible indicator anywhere of which
  // discipline was active until the menu was opened. It stays in the
  // header row at all widths instead.
  const headerMenuBtn = document.getElementById("header-menu-btn");
  const headerMenuPopover = document.getElementById("header-menu-popover");
  const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
  // menu-username, not athleteModeBtn -- Athlete Mode/Public Logbook moved
  // off this menu to the My account page (#445); menu-username is the one
  // that's now hidden entirely when logged out, same signal this check
  // always needed (some real content above the divider or not).
  const menuUsername = document.getElementById("menu-username");

  // The bottom row's top divider only makes sense when something is
  // actually visible above it -- menu-username is the only thing that can
  // occupy the top section, and it's hidden entirely when logged out
  // (main.js's updateAdminBar(), which calls this), which would
  // otherwise leave the divider floating above nothing (#138).
  function updateMenuDivider() {
    const hasTopContent = !menuUsername.hidden;
    headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
    headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
    headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
  }

  createDisclosure(headerMenuBtn, headerMenuPopover, "#header-menu-wrap");

  return { updateMenuDivider, updateDisciplinePicker };
}
