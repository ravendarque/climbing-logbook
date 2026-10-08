import { matchOwnerRoute } from "../../shared/owner-routes.js";

export const PUBLIC_DATA_PATH =
  /^\/-\/api\/public\/([^/]+)\/(entries\/counts|entries|places|locations|map\/counts|performance\/(?:pyramid|injury|strengths|volume|gap|rpe))$/;

// Templates only: a raw path can carry a username, an id or a token.
export function routeTemplate({ hostname, pathname }, resourcePaths) {
  if (hostname.startsWith("admin.")) {
    return `admin ${pathname.replace(/\/(users|entries|reports|feedback)\/[^/]+/, "/$1/:id")}`;
  }
  if (resourcePaths.includes(pathname)) return pathname;
  const auth = pathname.match(/^\/-\/api\/auth\/([a-z-]+)(\/.*)?$/);
  if (auth) return `/-/api/auth/${auth[1]}${auth[2] ? "/:param" : ""}`;
  const publicData = pathname.match(PUBLIC_DATA_PATH);
  if (publicData) return `/-/api/public/:username/${publicData[2]}`;
  const owner = matchOwnerRoute(pathname);
  if (owner) return `/:username/${owner.page}`;
  if (hostname.startsWith("my.") && /^\/[^/]+\/?$/.test(pathname)) return "/:username";
  if (pathname === "/" || pathname.startsWith("/-/")) return pathname;
  return "other";
}
