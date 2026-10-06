import { firstDemoVisitTourUrl } from "./tour-url.js";

export function startsFirstDemoTour() {
  const url = firstDemoVisitTourUrl();
  if (url) window.location.replace(url);
  return !!url;
}

export function launchTourWhenRequested(booted) {
  if (!new URLSearchParams(window.location.search).has("tour")) return;
  Promise.resolve(booted)
    .then(() => import("./tour.js"))
    .then(({ startTour }) => startTour());
}
