import { DEMO_USERNAMES } from "../../shared/demo-personas.js";
import { safeReturnTo } from "../resolve-app-origin.js";
import { ownerOfPath } from "../user-storage.js";

export const TOUR_USER = "intermediatedemo";
export const TOUR_FIRST_PAGE = "log";

export function tourUrl({ user, page, step, returnTo }) {
  const params = new URLSearchParams({ tour: String(step + 1) });
  if (returnTo) params.set("returnTo", returnTo);
  return `/${encodeURIComponent(user)}/${page}?${params}`;
}

export function tourStartUrl(returnTo) {
  return tourUrl({ user: TOUR_USER, page: TOUR_FIRST_PAGE, step: 0, returnTo });
}

// Null unless the tour was asked for on a demo account's page: the tour never runs over someone's own logbook.
export function readTourRequest(loc = window.location, stepCount = Number.POSITIVE_INFINITY) {
  const params = new URLSearchParams(loc.search);
  if (!params.has("tour")) return null;
  const user = ownerOfPath(loc.pathname);
  if (!DEMO_USERNAMES.includes(user)) return null;

  const requested = Number.parseInt(params.get("tour"), 10);
  const step = Number.isInteger(requested) ? Math.min(Math.max(requested - 1, 0), stepCount - 1) : 0;
  return { user, step, returnTo: safeReturnTo(params.get("returnTo"), loc.origin) };
}
