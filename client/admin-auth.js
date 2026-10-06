import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";
import { LOGIN_PATH, loginPageUrl } from "./login-url.js";
import { clearSignedInUser, ownerOfPath, writeSignedInUser } from "./user-storage.js";
import { pullSettings, readSettingsCache, validDiscipline, writeSettingsCache } from "./settings-cache.js";
import { isDemoUsername } from "./demo-mode.js";
import { isWorkerCache } from "./sw/caches.js";
import { isUnauthorized } from "./api-fetch.js";

async function clearWorkerCaches() {
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(names.filter(isWorkerCache).map(name => caches.delete(name)));
  } catch {
    /* Cache Storage unavailable (private mode, blocked): nothing to clear */
  }
}

export function createAdminAuth({ store, apiFetch, settingsUrl, updateAdminBar, onFetchTimeout = () => {} }) {
  const AUTH_SESSION_URL = "/-/api/auth/get-session";
  const AUTH_SIGN_OUT_URL = "/-/api/auth/sign-out";
  const LOGIN_HINT_KEY = "logbook_logged_in_hint";

  const loginToggleBtn = document.getElementById("login-toggle-btn");

  // Cached so the first paint (tab bar, discipline) is right before the network answers.
  const cachedSettings = readSettingsCache();
  let athleteMode = !!cachedSettings?.athleteMode;
  let logbookPublic = cachedSettings ? !!cachedSettings.logbookPublic : true;
  let betaOptIn = cachedSettings?.betaOptIn === true;
  let onboardingCompleted = cachedSettings?.onboardingCompleted;
  let username = null;
  let email = null;

  // Applied by boot(), not here: settings and entries race, and the heuristic mustn't clobber it.
  let persistedDiscipline = validDiscipline(cachedSettings?.activeDiscipline);

  function persistSettingsCache() {
    writeSettingsCache({
      athleteMode,
      logbookPublic,
      betaOptIn,
      activeDiscipline: persistedDiscipline,
      onboardingCompleted,
    });
  }

  async function fetchSettings() {
    const settings = await pullSettings({ onTimeout: onFetchTimeout });
    if (!settings) return;
    athleteMode = settings.athleteMode;
    persistedDiscipline = settings.activeDiscipline;
    logbookPublic = settings.logbookPublic;
    betaOptIn = settings.betaOptIn;
    onboardingCompleted = settings.onboardingCompleted;
  }

  // A failed PATCH is a normal, displayable outcome, so it returns { ok } rather than throwing.
  async function patchSetting(field, value) {
    const res = await apiFetch(settingsUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (isUnauthorized(res)) {
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
      try {
        persistSettingsCache();
      } catch {
        /* storage full or blocked */
      }
    }
    updateAdminBar();
    return result;
  }

  async function completeOnboarding() {
    const result = await patchSetting("onboardingCompleted", true);
    if (result.ok) {
      onboardingCompleted = true;
      try {
        persistSettingsCache();
      } catch {
        /* storage full or blocked */
      }
    }
    return result;
  }

  async function checkSession() {
    // Optimistic, from the last session check, so login-gated chrome is right on first paint.
    store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
    let res;
    try {
      res = await apiFetch(AUTH_SESSION_URL, { signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS) });
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
    // Removed rather than set to "0", so a demo visitor's browser keeps nothing.
    if (store.isLoggedIn()) localStorage.setItem(LOGIN_HINT_KEY, "1");
    else localStorage.removeItem(LOGIN_HINT_KEY);
    // Recorded for the offline ownership check; a cached page for someone else redirects home.
    if (username) {
      writeSignedInUser(localStorage, username);
      // Asks the browser not to evict this origin's storage, which holds unsynced climbs.
      navigator.storage?.persist?.().catch(() => {});
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

  async function signOut() {
    await fetch(AUTH_SIGN_OUT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    store.setLoggedIn(false);
    localStorage.removeItem(LOGIN_HINT_KEY);
    // Their data stays in their own namespace: an unsynced queue is never discarded.
    clearSignedInUser(localStorage);
    // Cached shells mustn't outlive the session on a shared device.
    await clearWorkerCaches();
  }

  loginToggleBtn.addEventListener("click", async () => {
    const wasLoggedIn = store.isLoggedIn();
    if (wasLoggedIn) await signOut();
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
    completeOnboarding,
    isOnboardingCompleted: () => onboardingCompleted === true,
    getUsername: () => username,
    getEmail: () => email,
    getPersistedDiscipline: () => persistedDiscipline,
    signOut,
    setInitialActiveType,
    reconcileActiveType,
  };
}
