// Auth state and the Athlete Mode/Public Logbook settings (#239, sixth
// piece of #233's modularization epic). Owns checkSession() (Better Auth
// session check, #320 -- was Cloudflare Access until here), fetchSettings()
// (the public Athlete Mode/Public Logbook + persisted-discipline read),
// and the login/logout click handler. Athlete Mode/Public Logbook expose
// plain setAthleteMode()/setLogbookPublic() mutators (#445) with no DOM
// coupling of their own -- client/account-main.js is the only caller,
// wiring them to its own toggle rows. (Used to also carry a DOM-coupled
// click handler for /logbook's own independent Athlete Mode button,
// #344's parallel-migration policy -- removed once #375 retired
// /logbook entirely, so that compat shim had no remaining consumer.)
//
// Scoped narrower than the issue's own rough estimate: updateAdminBar()
// and setActiveView() (admin-gated UI visibility, view-tab switching)
// stay in main.js -- grounding scope in the real code showed they're
// genuinely header-chrome/composition-root concerns (#240/#242) that
// happen to be *triggered by* auth-state changes, not auth logic
// themselves. This module exposes isAthleteMode() so main.js's
// updateAdminBar() can still read the one piece of state that moved.
import { VALID_TYPES } from "../shared/entry-schema.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";
import { LOGIN_PATH, loginPageUrl } from "./login-url.js";
import { clearSignedInUser, ownerOfPath, userKey, writeSignedInUser } from "./user-storage.js";
import { isDemoUsername } from "./demo-mode.js";
import { isWorkerCache } from "./sw/caches.js";

// #947 -- deletes every cache the service worker owns (logbook-*).
async function clearWorkerCaches() {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(names.filter(isWorkerCache).map(name => caches.delete(name)));
  } catch {
    /* Cache Storage unavailable (private mode, blocked): nothing to clear */
  }
}

// #847 follow-up -- onFetchTimeout defaults to a no-op so the four
// admin-hidden-style pages that construct this factory without a
// client/sync-status-icon.js instance at all (account/account-edit/
// account-import/beta-gate -- confirmed via grep, none of them wrap
// checkSession()/fetchSettings() in syncStatusIcon.track()) don't need
// to pass anything; the 10 real consumers that do pass their own
// syncStatusIcon.reportTimeout directly.
export function createAdminAuth({ store, adminFetch, isAuthRedirect, adminSettingsUrl, updateAdminBar, onFetchTimeout = () => {} }) {
  const AUTH_SESSION_URL = "/-/api/auth/get-session";
  const AUTH_SIGN_OUT_URL = "/-/api/auth/sign-out";
  const SETTINGS_URL = "/-/api/settings";
  const LOGIN_HINT_KEY = "logbook_logged_in_hint";
  // #762 -- mirrors store.js's ENTRIES_CACHE_KEY/PLACES_CACHE_KEY/
  // LOCATIONS_CACHE_KEY convention. Written on every successful
  // fetchSettings() response; read once, synchronously, right below, so
  // athleteMode/logbookPublic/betaOptIn/persistedDiscipline start from
  // the last-known-good value instead of a hardcoded default, letting
  // every consumer's first paint (tab bar's show-performance attribute,
  // the discipline filter) be right immediately instead of after a
  // network round trip.
  // #960 -- namespaced per user (client/user-storage.js).
  const SETTINGS_CACHE_KEY = userKey("logbook_settings_cache");

  function loadSettingsFromCache() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY));
    } catch {
      return null;
    }
  }

  const loginToggleBtn = document.getElementById("login-toggle-btn");

  const cachedSettings = loadSettingsFromCache();
  let athleteMode = !!cachedSettings?.athleteMode;
  let logbookPublic = cachedSettings ? !!cachedSettings.logbookPublic : true;
  // #952, ADR-0029 -- two states: enrolled or not (default not enrolled).
  let betaOptIn = cachedSettings?.betaOptIn === true;
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
  let persistedDiscipline = cachedSettings && VALID_TYPES.includes(cachedSettings.activeDiscipline)
    ? cachedSettings.activeDiscipline
    : null;

  // Public visitors always see the effective settings (Athlete Mode off
  // by default, discipline from boot()'s has-entries heuristic by
  // default); only the logged-in admin sees a control to change either.
  // Covers both settings in one request rather than a separate fetch per
  // field (#137 folded discipline persistence into the same endpoint).
  async function fetchSettings() {
    try {
      const res = await fetch(SETTINGS_URL, { signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS) });
      const data = await res.json();
      if (!res.ok) return;
      athleteMode = !!data.athleteMode;
      // Validated defensively even though the server already validates on
      // write, since this is public data read back out of KV.
      if (VALID_TYPES.includes(data.activeDiscipline)) {
        persistedDiscipline = data.activeDiscipline;
      }
      // Always updated, even on pages with no Public Logbook toggle UI
      // (only client/account-main.js has one, #445) -- harmless unused
      // state elsewhere, same as persistedDiscipline being tracked
      // regardless of whether a given page's UI surfaces it.
      logbookPublic = !!data.logbookPublic;
      betaOptIn = data.betaOptIn === true;
      localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
        athleteMode, logbookPublic, betaOptIn, activeDiscipline: persistedDiscipline,
      }));
    } catch (err) {
      // Offline (or a genuine timeout -- see err.name check below) — keep
      // the last-known in-memory defaults rather than guessing; the
      // Athlete Mode toggle is only interactive when logged in, so a
      // stale value there can't be acted on incorrectly, and the
      // discipline heuristic default already applied is a reasonable
      // fallback for the picker (which is usable while offline).
      //
      // #847 follow-up -- AbortSignal.timeout() rejects with a
      // DOMException named "TimeoutError" specifically (distinct from
      // "AbortError", which is what a user- or code-triggered abort()
      // produces) -- checked here, not assumed, so this only fires the
      // sync/offline indicator's "offline" state for an actual timeout,
      // not any other network failure this catch already handled
      // silently before this fix.
      if (err.name === "TimeoutError") onFetchTimeout();
    }
  }

  // Shared PATCH-one-field core, called by the My account page's own
  // toggle UI (#445, client/account-main.js) via setAthleteMode()/
  // setLogbookPublic() below -- no DOM lookup of any kind in here, so it
  // works identically regardless of where (or whether) a clickable
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

  // #443/#546 -- always a real boolean, never null: the modal only ever
  // submits a deliberate true/false choice (see server/api/settings.js's
  // own PATCH validation, which has no "reset to null" case either).
  async function setBetaOptIn(next) {
    const result = await patchSetting("betaOptIn", next);
    if (result.ok) betaOptIn = result.data.betaOptIn;
    updateAdminBar();
    return result;
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
    // #762 -- read optimistically, before the fetch even starts, not
    // only in the offline catch branch below: a slow-but-eventually-
    // successful request used to leave store.isLoggedIn() at its
    // hardcoded `false` default for the entire round trip, blocking
    // anything gated on it (the tab bar's show-performance attribute,
    // the account menu) from a correct first paint. Corrected below,
    // for real, once the fetch actually resolves either way.
    store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
    let res;
    try {
      res = await adminFetch(AUTH_SESSION_URL, { signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS) });
    } catch (err) {
      // Offline (or a genuine timeout) — the optimistic hint above is
      // already the best answer available; nothing further to do. See
      // fetchSettings()'s own comment on the err.name check below.
      if (err.name === "TimeoutError") onFetchTimeout();
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
    // #960 -- record who's signed in on this device (the ownership check's
    // offline reference), and if this owner page belongs to someone else
    // (only possible for a service-worker-served page -- the server checks
    // network loads itself), go to the signed-in user's own logbook.
    if (username) {
      writeSignedInUser(localStorage, username);
      const owner = ownerOfPath(window.location.pathname);
      if (owner && !isDemoUsername(owner) && owner !== username.toLowerCase()) {
        window.location.replace(`/${encodeURIComponent(username)}/log`);
      }
    }
  }

  // Shared by every one of #348's owner-only composition roots
  // (map-main.js, log-main.js, and all 7 performance-*-main.js files) --
  // default to whichever discipline actually has entries (boulder wins if
  // both/neither do), then let a persisted choice override that default.
  // This exact sequence was hand-copied identically across every
  // composition root (found via code review, 2026-08-09) -- exposed as
  // methods here rather than standalone functions since store/
  // persistedDiscipline are already in this factory's own closure,
  // nothing extra to inject.
  //
  // #762 -- split from the former resolveActiveType(): this half is
  // synchronous and safe to call before any network request starts, so
  // every composition root's boot() can call it first thing, letting the
  // very first render (triggered by store.setActiveType()'s own notify())
  // show the right discipline immediately instead of always starting
  // from the has-entries heuristic and flipping once settings resolve.
  function setInitialActiveType() {
    if (persistedDiscipline) {
      store.setActiveType(persistedDiscipline);
      return;
    }
    const hasBoulder = store.getEntries().some(e => e.type === "boulder");
    const hasSport = store.getEntries().some(e => e.type === "sport");
    store.setActiveType(hasBoulder || !hasSport ? "boulder" : "sport");
  }

  // #762 -- the network-gated half of the former resolveActiveType():
  // once both concurrent requests are known complete, override the
  // synchronous default above if the real persisted value disagrees with
  // it (a genuinely rare case now that setInitialActiveType() already
  // preferred the cache) -- unchanged behavior, just no longer also
  // doing the synchronous half's work.
  async function reconcileActiveType(sessionPromise, settingsPromise) {
    await Promise.all([sessionPromise, settingsPromise]);
    if (persistedDiscipline) store.setActiveType(persistedDiscipline);
  }

  loginToggleBtn.addEventListener("click", async () => {
    const wasLoggedIn = store.isLoggedIn();
    if (wasLoggedIn) {
      // A plain same-origin POST, not a dedicated logout URL/page like
      // Access's -- Better Auth doesn't need a redirect ceremony to
      // clear its session cookie, so this can just fetch() first, then
      // navigate away below (#561) rather than a dedicated full-page
      // logout endpoint.
      await fetch(AUTH_SIGN_OUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      store.setLoggedIn(false);
      localStorage.setItem(LOGIN_HINT_KEY, "0");
      // #960 -- nobody's signed in on this device any more. Their data stays
      // in their own namespace (an unsynced queue is never discarded).
      clearSignedInUser(localStorage);
      // #947 -- and the service worker's cached shells don't outlive the
      // session on a shared device (#80's scenario): the next launch gets
      // them from the network, through the server's own login check.
      await clearWorkerCaches();
    }
    // #561 -- every page this factory runs on (log/map/performance/sync/
    // account(/edit|/import)?) is owner-only, server-side gated
    // (owned-routes.js) on the *initial* request only -- once logged out
    // client-side, the visitor can no longer legitimately reach this page
    // at all (a refresh would bounce them straight to login), so navigate
    // there now rather than leaving them stranded on a page updated to
    // merely *look* logged-out. Same target the already-logged-out branch
    // used on its own before this fix -- both branches now end up here,
    // so updateAdminBar()'s in-place UI sync is no longer needed on the
    // logout path either.
    // #955 -- same-origin login (client/login-url.js). Logging out starts
    // over (no returnTo); logging in comes back to this page.
    window.location.href = wasLoggedIn ? LOGIN_PATH : loginPageUrl();
  });

  return {
    checkSession,
    fetchSettings,
    isAthleteMode: () => athleteMode,
    setAthleteMode,
    isLogbookPublic: () => logbookPublic,
    setLogbookPublic,
    getBetaOptIn: () => betaOptIn,
    setBetaOptIn,
    getUsername: () => username,
    getEmail: () => email,
    getPersistedDiscipline: () => persistedDiscipline,
    setInitialActiveType,
    reconcileActiveType,
  };
}
