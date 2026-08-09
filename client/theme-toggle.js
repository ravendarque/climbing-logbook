// Shared by client/header-chrome.js (still the sole owner of this button
// for /logbook and the three owner-only #348 pages, via
// createHeaderChrome()) and client/profile-main.js (which doesn't use the
// full createHeaderChrome() factory at all -- no store.js/adminFetch/
// resetPyramidExpansion, see that file's own header comment -- but still
// needs this one self-contained piece of it). Previously duplicated
// byte-for-byte, including the setTimeout-not-queueMicrotask workaround
// below -- a real, empirically-discovered bug fix that only living in one
// place now means it can't quietly drift out of sync between copies
// (found via code review, 2026-08-09).
//
// The actual theme is already set on <html> by the blocking inline script
// in each page's own <head> (before first paint) -- this just wires up
// the button to flip it and keeps the icon/label in sync.
export function createThemeToggle() {
  const SUN_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
  const MOON_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  function updateThemeToggleButton() {
    const theme = document.documentElement.dataset.theme;
    themeToggleBtn.innerHTML = theme === "light" ? MOON_ICON : SUN_ICON;
    themeToggleBtn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
  updateThemeToggleButton();
  themeToggleBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("logbook_theme", next);
    // Deferred, not called inline: updateThemeToggleButton() replaces this
    // button's innerHTML, which destroys whatever element the click
    // actually landed on (almost always the icon <svg> itself, not the
    // button). Doing that synchronously mid-bubble detaches e.target
    // before it reaches the header menu's document-level outside-click
    // listener (#123) -- a detached node's closest() can't find any
    // ancestor, including #header-menu-wrap, so the click reads as
    // "outside" and the menu closes right when it shouldn't.
    // queueMicrotask is NOT enough here: microtasks are checkpointed after
    // *each* listener invocation during event dispatch (per spec's "clean
    // up after running script"), not just once after the whole bubble
    // phase finishes -- confirmed empirically, a queued microtask still
    // ran before the next bubble-phase listener saw this event. setTimeout
    // defers to a genuinely later task, after the entire click (all
    // listeners, all elements) has finished dispatching.
    setTimeout(updateThemeToggleButton, 0);
  });
}
