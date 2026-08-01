// Auth state and the Athlete Mode setting (#239, sixth piece of #233's
// modularization epic). Owns checkSession() (Cloudflare Access session
// check), fetchSettings() (the public Athlete Mode + persisted-discipline
// read), and the login/logout + Athlete Mode toggle click handlers.
//
// Scoped narrower than the issue's own rough estimate: updateAdminBar()
// and setActiveView() (admin-gated UI visibility, view-tab switching)
// stay in main.js -- grounding scope in the real code showed they're
// genuinely header-chrome/composition-root concerns (#240/#242) that
// happen to be *triggered by* auth-state changes, not auth logic
// themselves. This module exposes isAthleteMode() so main.js's
// updateAdminBar() can still read the one piece of state that moved.
export function createAdminAuth({ store, adminFetch, isAuthRedirect, adminSettingsUrl, updateAdminBar }) {
  const ADMIN_SESSION_URL = "/logbook/api/admin/session";
  const ADMIN_LOGIN_URL = "/logbook/api/admin/login";
  const SETTINGS_URL = "/logbook/api/settings";
  const ACCESS_LOGOUT_URL = "https://ravendarque.com/cdn-cgi/access/logout";
  const LOGIN_HINT_KEY = "logbook_logged_in_hint";

  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const athleteModeBtn = document.getElementById("athlete-mode-btn");

  let athleteMode = false;

  // Set (not directly via store.setActiveType()) by fetchSettings() below,
  // then applied in boot() after both it and the entries load are known
  // complete -- both requests run concurrently with a real await in
  // between them (the entries fetch), so which one resolves first isn't
  // guaranteed. Calling store.setActiveType() straight from here would
  // race the has-entries heuristic in boot() and could get silently
  // clobbered if the heuristic happened to run second (#137).
  let persistedDiscipline = null;

  // Public visitors always see the effective settings (Athlete Mode off
  // by default, discipline from boot()'s has-entries heuristic by
  // default); only the logged-in admin sees a control to change either.
  // Covers both settings in one request rather than a separate fetch per
  // field (#137 folded discipline persistence into the same endpoint).
  async function fetchSettings() {
    try {
      const res = await fetch(SETTINGS_URL);
      const data = await res.json();
      if (!res.ok) return;
      athleteMode = !!data.athleteMode;
      // Validated defensively even though the server already validates on
      // write, since this is public data read back out of KV.
      if (data.activeDiscipline === "boulder" || data.activeDiscipline === "lead") {
        persistedDiscipline = data.activeDiscipline;
      }
    } catch {
      // Offline — keep the last-known in-memory defaults rather than
      // guessing; the Athlete Mode toggle is only interactive when logged
      // in, so a stale value there can't be acted on incorrectly, and the
      // discipline heuristic default already applied is a reasonable
      // fallback for the picker (which is usable while offline).
    }
  }

  athleteModeBtn.addEventListener("click", async () => {
    const next = !athleteMode;
    athleteModeBtn.disabled = true;
    try {
      const res = await adminFetch(adminSettingsUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteMode: next }),
      });
      if (res.status === 401 || isAuthRedirect(res)) {
        // Access session lapsed since page load — same handling as
        // syncPending()'s 401 case: drop back to the logged-out view.
        store.setLoggedIn(false);
      } else if (res.ok) {
        const data = await res.json();
        athleteMode = !!data.athleteMode;
        athleteModeBtn.title = "";
      } else {
        athleteModeBtn.title = `Failed to update Athlete Mode (${res.status})`;
      }
    } catch (err) {
      athleteModeBtn.title = `Failed to update Athlete Mode: ${err.message}`;
    } finally {
      athleteModeBtn.disabled = false;
      updateAdminBar();
    }
  });

  // Cloudflare Access gates /logbook/api/admin/* at Cloudflare's edge, so
  // "logged in" just means "the session fetch below wasn't intercepted by
  // Access's own hosted login page." A genuine network failure (offline)
  // is distinguished from "not authenticated" so the offline-queue hint
  // doesn't get mistaken for a real session.
  async function checkSession() {
    let res;
    try {
      res = await adminFetch(ADMIN_SESSION_URL);
    } catch {
      // Offline — fall back to the last known login state so the UI
      // still shows edit affordances; writes still get verified for
      // real by Access once synced.
      store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
      return;
    }
    try {
      const data = await res.json();
      store.setLoggedIn(res.ok && !!data.loggedIn);
    } catch {
      // Access intercepted with its own hosted login page (non-JSON) —
      // not logged in.
      store.setLoggedIn(false);
    }
    localStorage.setItem(LOGIN_HINT_KEY, store.isLoggedIn() ? "1" : "0");
  }

  loginToggleBtn.addEventListener("click", () => {
    if (store.isLoggedIn()) {
      window.location.href = ACCESS_LOGOUT_URL;
    } else {
      // Full-page navigation (not fetch) so Cloudflare Access's hosted
      // login redirect can actually complete; it bounces back to the app
      // once you're authenticated.
      window.location.href = ADMIN_LOGIN_URL;
    }
  });

  return {
    checkSession,
    fetchSettings,
    isAthleteMode: () => athleteMode,
    getPersistedDiscipline: () => persistedDiscipline,
  };
}
