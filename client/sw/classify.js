// #962, ADR-0028 -- which handling a request gets from the service worker,
// as a pure function (unit-tested in test/client/sw/classify.test.js).
// The runtime (#947) maps each kind to a strategy; anything classified
// "passthrough" gets no respondWith at all, so the browser handles it
// exactly as if there were no worker.
import { matchOwnerRoute } from "../../shared/owner-routes.js";

// kinds:
//   owner-shell  an owner-page navigation (cache-first per build; carries
//                the matched page key)
//   immutable    content-addressed: /logbook/chunks/* or any ?v= URL
//   font         /logbook/fonts/* (unversioned, so stale-while-revalidate)
//   static       any other /logbook/ static file (network-first)
//   passthrough  everything else, including every API call
export function classifyRequest({ url, method, mode, workerOrigin }) {
  const u = new URL(url);
  if (method !== "GET" || u.origin !== workerOrigin) return { kind: "passthrough" };

  if (mode === "navigate") {
    const route = matchOwnerRoute(u.pathname);
    return route ? { kind: "owner-shell", page: route.page } : { kind: "passthrough" };
  }

  // Data belongs to client/store.js, never the worker (ADR-0028 decision 3).
  if (u.pathname.startsWith("/logbook/api/")) return { kind: "passthrough" };
  if (!u.pathname.startsWith("/logbook/")) return { kind: "passthrough" };
  if (u.pathname.startsWith("/logbook/chunks/") || u.searchParams.has("v")) return { kind: "immutable" };
  if (u.pathname.startsWith("/logbook/fonts/")) return { kind: "font" };
  return { kind: "static" };
}
