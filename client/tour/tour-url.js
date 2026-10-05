import { safeReturnTo } from "../resolve-app-origin.js";
import { resolveMyXUrl } from "../resolve-cross-hostname-url.js";
import { matchOwnerRoute } from "../../shared/owner-routes.js";
import { normalizeUsername } from "../user-storage.js";

export const TOUR_FIRST_PAGE = "log";

// The profile is the one page that only exists on the my. host.
export function pagePath(user, page) {
  const base = `/${encodeURIComponent(user)}`;
  return page === "profile" ? base : `${base}/${page}`;
}

export function tourUrl({ user, page, step, returnTo, hostname = globalThis.location?.hostname ?? "" }) {
  const params = new URLSearchParams({ tour: String(step + 1) });
  if (returnTo) params.set("returnTo", returnTo);
  const url = `${pagePath(user, page)}?${params}`;
  return page === "profile" ? resolveMyXUrl(hostname, url) : url;
}

export function tourStartUrl(user, returnTo) {
  return tourUrl({ user, page: TOUR_FIRST_PAGE, step: 0, returnTo });
}

export function isOnPage(pathname, user, page) {
  return pathname.replace(/\/$/, "") === pagePath(user, page);
}

const TOUR_PAGES = ["log", "map", "performance"];

// Only the pages the tour shows: /sync and the account pages carry their own returnTo.
function tourPageOwner(pathname) {
  const route = matchOwnerRoute(pathname);
  if (route) return TOUR_PAGES.includes(route.page) ? normalizeUsername(route.username) : null;
  const profile = pathname.match(/^\/([^/]+)\/?$/);
  return profile ? normalizeUsername(profile[1]) : null;
}

// Whose pages the tour is on is whose pages these are: a demo account's for a visitor, or the signed-in owner's own.
export function readTourRequest(loc = window.location, stepCount = Number.POSITIVE_INFINITY) {
  const params = new URLSearchParams(loc.search);
  if (!params.has("tour")) return null;
  const user = tourPageOwner(loc.pathname);
  if (!user) return null;

  const requested = Number.parseInt(params.get("tour"), 10);
  const step = Number.isInteger(requested) ? Math.min(Math.max(requested - 1, 0), stepCount - 1) : 0;
  return { user, step, returnTo: safeReturnTo(params.get("returnTo"), loc.origin) };
}

// A device that has never synced goes to /sync first, which returns to a fixed path, so the tour's request rides along.
export function carryTourParams(search) {
  const params = new URLSearchParams(search);
  const tour = params.get("tour");
  if (!/^\d{1,2}$/.test(tour ?? "")) return "";
  const carried = new URLSearchParams({ tour });
  if (params.get("returnTo")) carried.set("tourReturnTo", params.get("returnTo"));
  return `&${carried}`;
}

export function restoreTourParams(searchParams, origin) {
  const tour = searchParams.get("tour");
  if (!/^\d{1,2}$/.test(tour ?? "")) return "";
  const restored = new URLSearchParams({ tour });
  const returnTo = safeReturnTo(searchParams.get("tourReturnTo"), origin);
  if (returnTo) restored.set("returnTo", returnTo);
  return `?${restored}`;
}
