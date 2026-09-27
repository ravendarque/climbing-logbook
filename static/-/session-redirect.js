// The page waits briefly for this, since a flash then a redirect looks broken, but never for long.
import { needsChannelChoice, resolvePostLoginTarget } from "./login/resolve-app-origin.js";

const SHOW_PAGE_AFTER_MS = 3000;

export async function redirectIfLoggedIn(contentEl) {
  const show = () => {
    contentEl.style.display = "";
  };
  const showAnyway = setTimeout(show, SHOW_PAGE_AFTER_MS);
  try {
    const res = await fetch("/-/api/auth/get-session");
    const data = await res.json();
    if (data?.user) {
      let betaOptIn = null;
      if (needsChannelChoice(location.hostname)) {
        try {
          const settingsRes = await fetch("/-/api/settings");
          betaOptIn = (await settingsRes.json()).betaOptIn;
        } catch {}
      }
      location.href = resolvePostLoginTarget({
        hostname: location.hostname,
        origin: location.origin,
        username: data.user.username,
        returnTo: new URLSearchParams(location.search).get("returnTo"),
        betaOptIn,
      });
      return;
    }
  } catch {
    // Offline: show the page rather than block on a check that can't complete.
  }
  clearTimeout(showAnyway);
  show();
}
