// Runs before first paint, so the page never flashes the wrong theme.
(() => {
  var stored = null;
  try {
    stored = localStorage.getItem("logbook_theme");
  } catch {}
  var theme = stored || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = theme;
})();
