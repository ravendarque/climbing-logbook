// The page stays hidden until this resolves: a flash then a redirect is worse than a brief wait.
import { needsChannelChoice, resolvePostLoginTarget } from "./login/resolve-app-origin.js";

export async function redirectIfLoggedIn(contentEl) {
  try {
    const res = await fetch("/-/api/auth/get-session");
    const data = await res.json();
    if (data?.user) {
      let betaOptIn = null;
      if (needsChannelChoice(location.hostname)) {
        try {
          const settingsRes = await fetch("/-/api/settings");
          betaOptIn = (await settingsRes.json()).betaOptIn;
        } catch {
        }
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
  contentEl.style.display = "";
}
