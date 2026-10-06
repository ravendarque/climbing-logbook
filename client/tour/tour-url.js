import { safeReturnTo } from "../resolve-app-origin.js";
import { matchOwnerRoute } from "../../shared/owner-routes.js";
import { normalizeUsername } from "../user-storage.js";
import { isDemoUsername } from "../demo-mode.js";

export const TOUR_FIRST_PAGE = "log";
export const TOUR_USER = "intermediatedemo";

const TOUR_PAGES = ["log", "view", "view/map", "performance"];

export function pagePath(user, page) {
  return `/${encodeURIComponent(user)}/${page}`;
}

export function tourUrl({ user, page, step, returnTo }) {
  const params = new URLSearchParams({ tour: String(step + 1) });
  if (returnTo) params.set("returnTo", returnTo);
  return `${pagePath(user, page)}?${params}`;
}

export function tourStartUrl(returnTo, user = TOUR_USER) {
  return tourUrl({ user, page: TOUR_FIRST_PAGE, step: 0, returnTo });
}

export function isOnPage(pathname, user, page) {
  return pathname.replace(/\/$/, "") === pagePath(user, page);
}

function tourPageOwner(pathname) {
  const route = matchOwnerRoute(pathname);
  const user = route && TOUR_PAGES.includes(route.page) ? normalizeUsername(route.username) : null;
  return isDemoUsername(user) ? user : null;
}

export function readTourRequest(loc = window.location, stepCount = Number.POSITIVE_INFINITY) {
  const params = new URLSearchParams(loc.search);
  if (!params.has("tour")) return null;
  const user = tourPageOwner(loc.pathname);
  if (!user) return null;

  const requested = Number.parseInt(params.get("tour"), 10);
  const step = Number.isInteger(requested) ? Math.min(Math.max(requested - 1, 0), stepCount - 1) : 0;
  return { user, step, returnTo: safeReturnTo(params.get("returnTo"), loc.origin) };
}
