import { ownershipAllowsBoot } from "./ownership-guard.js";
import { enrollmentAllowsBoot } from "./channel-guard.js";
import { registerServiceWorker } from "./register-sw.js";

export async function pageAllowsBoot() {
  return (await ownershipAllowsBoot()) && enrollmentAllowsBoot();
}

export function startPage(boot) {
  pageAllowsBoot().then(allowed => {
    if (!allowed) return;
    const booted = boot();
    registerServiceWorker({ after: booted });
    if (new URLSearchParams(window.location.search).has("tour")) {
      Promise.resolve(booted)
        .then(() => import("./tour/tour.js"))
        .then(({ startTour }) => startTour());
    }
  });
}
