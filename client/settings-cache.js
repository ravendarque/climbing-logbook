import { VALID_TYPES } from "../shared/entry-schema.js";
import { BACKGROUND_FETCH_TIMEOUT_MS } from "./sync-status-icon.js";
import { userKey } from "./user-storage.js";

export const SETTINGS_CACHE_KEY = userKey("logbook_settings_cache");
const SETTINGS_URL = "/-/api/settings";

export function validDiscipline(value) {
  return VALID_TYPES.includes(value) ? value : null;
}

export function readSettingsCache(storage = localStorage) {
  try {
    return JSON.parse(storage.getItem(SETTINGS_CACHE_KEY));
  } catch {
    return null;
  }
}

export function writeSettingsCache(
  { athleteMode, logbookPublic, betaOptIn, activeDiscipline, onboardingCompleted },
  storage = localStorage,
) {
  storage.setItem(
    SETTINGS_CACHE_KEY,
    JSON.stringify({ athleteMode, logbookPublic, betaOptIn, activeDiscipline, onboardingCompleted }),
  );
}

export function needsOnboarding(storage = localStorage) {
  return readSettingsCache(storage)?.onboardingCompleted === false;
}

export async function pullSettings({ onTimeout = () => {} } = {}) {
  try {
    const res = await fetch(SETTINGS_URL, { signal: AbortSignal.timeout(BACKGROUND_FETCH_TIMEOUT_MS) });
    const data = await res.json();
    if (!res.ok) return null;
    const settings = {
      athleteMode: !!data.athleteMode,
      logbookPublic: !!data.logbookPublic,
      betaOptIn: data.betaOptIn === true,
      onboardingCompleted: data.onboardingCompleted === true,
      activeDiscipline:
        validDiscipline(data.activeDiscipline) ?? validDiscipline(readSettingsCache()?.activeDiscipline),
    };
    try {
      writeSettingsCache(settings);
    } catch {}
    return settings;
  } catch (err) {
    if (err.name === "TimeoutError") onTimeout();
    return null;
  }
}
