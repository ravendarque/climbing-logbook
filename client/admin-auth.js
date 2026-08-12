// Auth state and the Athlete Mode setting (#239, sixth piece of #233's
// modularization epic). Owns checkSession() (Better Auth session check,
// #320 -- was Cloudflare Access until here), fetchSettings() (the public
// Athlete Mode + persisted-discipline read), and the login/logout click
// handler. Athlete Mode/Public Logbook expose plain setAthleteMode()/
// setLogbookPublic() mutators (#445) rather than owning a click handler
// themselves -- their UI lives on the My account page now, not a fixed
// element this module can assume exists; /logbook's own still-independent
// Athlete Mode button is the one exception, wired the old DOM-coupled way
// (#344's parallel-migration policy -- see athleteModeBtn's own comment
// below).
//
// Scoped narrower than the issue's own rough estimate: updateAdminBar()
// and setActiveView() (admin-gated UI visibility, view-tab switching)
// stay in main.js -- grounding scope in the real code showed they're
// genuinely header-chrome/composition-root concerns (#240/#242) that
// happen to be *triggered by* auth-state changes, not auth logic
// themselves. This module exposes isAthleteMode() so main.js's
// updateAdminBar() can still read the one piece of state that moved.
export function createAdminAuth({ store, adminFetch, isAuthRedirect, adminSettingsUrl, updateAdminBar }) {
  const AUTH_SESSION_URL = "/logbook/api/auth/get-session";
  const AUTH_SIGN_OUT_URL = "/logbook/api/auth/sign-out";
  // Cross-origin in production (#295 -- /login moved to the apex,
  // climbinglogbook.com, while this app is reachable at
  // my.climbinglogbook.com/logbook and, for now, still ravendarque.com/
  // logbook too). Same-origin fallback for local dev/PR previews, which
  // don't have a real climbinglogbook.com to send a browser to and never
  // served /logbook/login/ in the first place -- see login.js's own
  // REDIRECT_URL comment for the mirror-image version of this check.
  const LOGIN_PAGE_URL = ["my.climbinglogbook.com", "ravendarque.com"].includes(window.location.hostname)
    ? "https://climbinglogbook.com/login/"
    : "/login/";
  const SETTINGS_URL = "/logbook/api/settings";
  const LOGIN_HINT_KEY = "logbook_logged_in_hint";

  const loginToggleBtn = document.getElementById("login-toggle-btn");
  // #445 moved both toggles' UI off the shared burger menu onto the My
  // account page -- <climbing-menu-bar> no longer renders either element
  // at all, so both are null on every page except /logbook, which keeps
  // its own independent, pre-#346 markup untouched (#344's parallel-
  // migration policy). Every use of either below is null-guarded because
  // of this.
  const athleteModeBtn = document.getElementById("athlete-mode-btn");
  const publicToggleBtn = document.getElementById("public-toggle-btn");

  let athleteMode = false;
  let logbookPublic = true;
  // #302 -- the "My account" link needs the caller's own username to build
  // its href (/:username/account); the menu-username label needs it to
  // display; client/account-edit-main.js's own username/email rows need
  // both, read from this same already-fetched session response rather
  // than that page making its own second get-session call. Only ever set
  // from a real session response below, never guessed -- stays null
  // across the offline fallback branch (no real session data available
  // there), same as every other piece of state checkSession() can't
  // determine offline.
  let username = null;
  let email = null;

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
      // Always updated, even on /logbook where publicToggleBtn is null and
      // nothing reads isLogbookPublic() -- harmless unused state there,
      // same as persistedDiscipline being tracked regardless of whether a
      // given page's UI surfaces it.
      logbookPublic = !!data.logbookPublic;
    } catch {
      // Offline — keep the last-known in-memory defaults rather than
      // guessing; the Athlete Mode toggle is only interactive when logged
      // in, so a stale value there can't be acted on incorrectly, and the
      // discipline heuristic default already applied is a reasonable
      // fallback for the picker (which is usable while offline).
    }
  }

  // Shared PATCH-one-field core, used both by /logbook's own still-DOM-
  // coupled click handler below and by the My account page's own toggle
  // UI (#445, client/account-main.js) calling setAthleteMode()/
  // setLogbookPublic() directly -- no DOM lookup of any kind in here, so
  // it works identically regardless of where (or whether) a clickable
  // control for it currently exists. Returns `{ok, status?}` rather than
  // throwing on a non-2xx response -- a failed settings PATCH is an
  // expected, displayable outcome (shown as the control's own error
  // state), not an exceptional one; a thrown network/parse error still
  // propagates normally to the caller's own try/catch.
  async function patchSetting(field, value) {
    const res = await adminFetch(adminSettingsUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.status === 401 || isAuthRedirect(res)) {
      // Session lapsed since page load — same handling as
      // syncPending()'s 401 case: drop back to the logged-out view.
      // isAuthRedirect() is a no-op against Better Auth's plain 401
      // JSON response (never an opaque redirect) but stays harmless to
      // check -- see adminFetch's own comment in main.js.
      store.setLoggedIn(false);
      return { ok: false };
    }
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: await res.json() };
  }

  async function setAthleteMode(next) {
    const result = await patchSetting("athleteMode", next);
    if (result.ok) athleteMode = !!result.data.athleteMode;
    updateAdminBar();
    return result;
  }

  async function setLogbookPublic(next) {
    const result = await patchSetting("logbookPublic", next);
    if (result.ok) logbookPublic = !!result.data.logbookPublic;
    updateAdminBar();
    return result;
  }

  // /logbook's own still-independent Athlete Mode button (#344 parallel-
  // migration policy -- see athleteModeBtn's own comment above for why
  // this is null, and this whole block a no-op, everywhere else).
  if (athleteModeBtn) {
    athleteModeBtn.addEventListener("click", async () => {
      const next = !athleteMode;
      athleteModeBtn.disabled = true;
      try {
        const result = await setAthleteMode(next);
        athleteModeBtn.title = result.ok ? "" : `Failed to update Athlete Mode (${result.status ?? "network error"})`;
      } catch (err) {
        athleteModeBtn.title = `Failed to update Athlete Mode: ${err.message}`;
      } finally {
        athleteModeBtn.disabled = false;
      }
    });
  }
  // publicToggleBtn is always null now (#445) -- kept null-guarded rather
  // than deleted outright in case a future page ever wants this exact
  // DOM-coupled shape again; harmless dead branch until then.
  if (publicToggleBtn) {
    publicToggleBtn.addEventListener("click", async () => {
      const next = !logbookPublic;
      publicToggleBtn.disabled = true;
      try {
        const result = await setLogbookPublic(next);
        publicToggleBtn.title = result.ok ? "" : `Failed to update Public Logbook (${result.status ?? "network error"})`;
      } catch (err) {
        publicToggleBtn.title = `Failed to update Public Logbook: ${err.message}`;
      } finally {
        publicToggleBtn.disabled = false;
      }
    });
  }

  // Better Auth's own session-check endpoint (#320 -- was Cloudflare
  // Access's /admin/session until here). Returns `null` (valid JSON) when
  // there's no session, `{ session, user }` when there is -- unlike
  // Access, it never intercepts with non-JSON hosted-login HTML, but the
  // JSON-parse catch stays as a defensive fallback rather than assuming
  // the response is always well-formed. A genuine network failure
  // (offline) is distinguished from "not authenticated" so the
  // offline-queue hint doesn't get mistaken for a real session.
  async function checkSession() {
    let res;
    try {
      res = await adminFetch(AUTH_SESSION_URL);
    } catch {
      // Offline — fall back to the last known login state so the UI
      // still shows edit affordances; writes still get verified for
      // real once synced.
      store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
      return;
    }
    try {
      const data = await res.json();
      const ok = res.ok && data !== null && !!data.user;
      store.setLoggedIn(ok);
      username = ok ? data.user.username : null;
      email = ok ? data.user.email : null;
    } catch {
      store.setLoggedIn(false);
      username = null;
      email = null;
    }
    localStorage.setItem(LOGIN_HINT_KEY, store.isLoggedIn() ? "1" : "0");
  }

  // Shared by #348's newer composition roots' boot() sequences
  // (map-main.js, performance-main.js, log-main.js) -- default to
  // whichever discipline actually has entries (boulder wins if both/
  // neither do), then let a persisted choice override that default once
  // both concurrent requests (checkSession()/fetchSettings(), kicked off
  // by the caller before its own resource loads) are known complete.
  // Order matters: applying the persisted override before the has-entries
  // default would let the default silently clobber it. This exact
  // sequence was hand-copied identically across all three composition
  // roots (found via code review, 2026-08-09) -- exposed as a method here
  // rather than a standalone function since store/persistedDiscipline are
  // already in this factory's own closure, nothing extra to inject.
  //
  // Not used by client/main.js (/logbook's own, still-untouched
  // composition root, which keeps its own equivalent logic inline) --
  // #344's parallel-migration decision holds /logbook stable throughout
  // this epic; adding this method doesn't change main.js's behavior at
  // all (it simply never calls it), same reasoning as this file's other
  // exposed methods below.
  async function resolveActiveType(sessionPromise, settingsPromise) {
    const hasBoulder = store.getEntries().some(e => e.type === "boulder");
    const hasLead = store.getEntries().some(e => e.type === "lead");
    store.setActiveType(hasBoulder || !hasLead ? "boulder" : "lead");

    await Promise.all([sessionPromise, settingsPromise]);
    if (persistedDiscipline) store.setActiveType(persistedDiscipline);
  }

  loginToggleBtn.addEventListener("click", async () => {
    if (store.isLoggedIn()) {
      // A plain same-origin POST, not a dedicated logout URL/page like
      // Access's -- Better Auth doesn't need a redirect ceremony to
      // clear its session cookie, so this can just fetch() and update
      // local state directly rather than a full-page navigation.
      await fetch(AUTH_SIGN_OUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      store.setLoggedIn(false);
      localStorage.setItem(LOGIN_HINT_KEY, "0");
      updateAdminBar();
    } else {
      // Full-page navigation to the login form (#320) -- there's no
      // hosted-login ceremony to redirect through anymore, just a real
      // page with its own form; login.js sends you back here on success.
      window.location.href = LOGIN_PAGE_URL;
    }
  });

  return {
    checkSession,
    fetchSettings,
    isAthleteMode: () => athleteMode,
    setAthleteMode,
    isLogbookPublic: () => logbookPublic,
    setLogbookPublic,
    getUsername: () => username,
    getEmail: () => email,
    getPersistedDiscipline: () => persistedDiscipline,
    resolveActiveType,
  };
}
