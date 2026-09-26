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
    // setTimeout, not a microtask: replacing the button mid-dispatch detaches the click target, and
    // the menu reads it as an outside click. Microtasks run between listeners, too early.
    setTimeout(updateThemeToggleButton, 0);
  });
}
