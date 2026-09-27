// Browsers name the error differently: Firefox's is NS_ERROR_DOM_QUOTA_REACHED, old WebKit reports code 22.
export function isQuotaError(err) {
  return err?.name === "QuotaExceededError" || err?.name === "NS_ERROR_DOM_QUOTA_REACHED" || err?.code === 22;
}

export const STORAGE_FULL_MESSAGE =
  "Your device's storage is full, so this couldn't be saved for later. Free up some space, or try again once you're back online.";

// Safari clears a site's storage after seven days of browsing without visiting it; an installed app is exempt.
export function isSafariTab(userAgent = navigator.userAgent, win = window) {
  const safari = /Safari\//.test(userAgent) && !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|Android)/.test(userAgent);
  const installed = win.navigator.standalone === true || win.matchMedia?.("(display-mode: standalone)").matches;
  return safari && !installed;
}
