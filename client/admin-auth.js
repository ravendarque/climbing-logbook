import { VALID_TYPES } from "../shared/entry-schema.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";
import { LOGIN_PATH, loginPageUrl } from "./login-url.js";
import { clearSignedInUser, ownerOfPath, userKey, writeSignedInUser } from "./user-storage.js";
import { isDemoUsername } from "./demo-mode.js";
import { isWorkerCache } from "./sw/caches.js";

async function clearWorkerCaches() {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(names.filter(isWorkerCache).map(name => caches.delete(name)));
  } catch {
    /* Cache Storage unavailable (private mode, blocked): nothing to clear */
  }
}

export function createAdminAuth({ store, adminFetch, isAuthRedirect, settingsUrl, updateAdminBar, onFetchTimeout = () => {} }) {
  const AUTH_SESSION_URL = "/-/api/auth/get-session";
  const AUTH_SIGN_OUT_URL = "/-/api/auth/sign-out";
  const SETTINGS_URL = "/-/api/settings";
  const LOGIN_HINT_KEY = "logbook_logged_in_hint";
  // Cached so the first paint (tab bar, discipline) is right before the network answers.
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
  let betaOptIn = cachedSettings?.betaOptIn === true;
  let username = null;
  let email = null;

  // Applied by boot(), not here: settings and entries race, and the heuristic mustn't clobber it.
  let persistedDiscipline = cachedSettings && VALID_TYPES.includes(cachedSettings.activeDiscipline)
    ? cachedSettings.activeDiscipline
    : null;

  function persistSettingsCache() {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
      athleteMode, logbookPublic, betaOptIn, activeDiscipline: persistedDiscipline,
    }));
  }

  async function fetchSettings() {
    try {
      const res = await fetch(SETTINGS_URL, { signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS) });
      const data = await res.json();
      if (!res.ok) return;
      athleteMode = !!data.athleteMode;
      if (VALID_TYPES.includes(data.activeDiscipline)) {
        persistedDiscipline = data.activeDiscipline;
      }
      logbookPublic = !!data.logbookPublic;
      betaOptIn = data.betaOptIn === true;
      persistSettingsCache();
    } catch (err) {
      // Offline: keep the last known values. Only a real timeout (TimeoutError) flags the indicator.
      if (err.name === "TimeoutError") onFetchTimeout();
    }
  }

  // A failed PATCH is a normal, displayable outcome, so it returns { ok } rather than throwing.
  async function patchSetting(field, value) {
    const res = await adminFetch(settingsUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.status === 401 || isAuthRedirect(res)) {
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

  async function setBetaOptIn(next) {
    const result = await patchSetting("betaOptIn", next);
    if (result.ok) {
      betaOptIn = result.data.betaOptIn;
      // Cached now, so leaving from beta takes effect there immediately.
      try { persistSettingsCache(); } catch { /* storage full or blocked */ }
    }
    updateAdminBar();
    return result;
  }

  async function checkSession() {
    // Optimistic, from the last session check, so login-gated chrome is right on first paint.
    store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
    let res;
    try {
      res = await adminFetch(AUTH_SESSION_URL, { signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS) });
    } catch (err) {
      // Offline or timed out: the optimistic hint stands.
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
    // Recorded for the offline ownership check; a cached page for someone else redirects home.
    if (username) {
      writeSignedInUser(localStorage, username);
      const owner = ownerOfPath(window.location.pathname);
      if (owner && !isDemoUsername(owner) && owner !== username.toLowerCase()) {
        window.location.replace(`/${encodeURIComponent(username)}/log`);
      }
    }
  }

  function setInitialActiveType() {
    if (persistedDiscipline) {
      store.setActiveType(persistedDiscipline);
      return;
    }
    const hasBoulder = store.getEntries().some(e => e.type === "boulder");
    const hasSport = store.getEntries().some(e => e.type === "sport");
    store.setActiveType(hasBoulder || !hasSport ? "boulder" : "sport");
  }

  async function reconcileActiveType(sessionPromise, settingsPromise) {
    await Promise.all([sessionPromise, settingsPromise]);
    if (persistedDiscipline) store.setActiveType(persistedDiscipline);
  }

  loginToggleBtn.addEventListener("click", async () => {
    const wasLoggedIn = store.isLoggedIn();
    if (wasLoggedIn) {
      await fetch(AUTH_SIGN_OUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      store.setLoggedIn(false);
      localStorage.setItem(LOGIN_HINT_KEY, "0");
      // Their data stays in their own namespace: an unsynced queue is never discarded.
      clearSignedInUser(localStorage);
      // Cached shells mustn't outlive the session on a shared device.
      await clearWorkerCaches();
    }
    // The page is owner-only, so a logged-out visitor goes to login rather than a page that only looks logged out.
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
