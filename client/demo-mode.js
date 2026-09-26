// A demo visitor has no session, so demo pages read the public endpoints instead.
import { DEMO_USERNAMES } from "../shared/demo-personas.js";

export function isDemoUsername(username) {
  return DEMO_USERNAMES.includes(username);
}

export function demoDataUrl(username, sessionScopedUrl, publicResource) {
  return isDemoUsername(username)
    ? `/-/api/public/${encodeURIComponent(username)}/${publicResource}`
    : sessionScopedUrl;
}
