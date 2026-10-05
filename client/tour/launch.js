export function launchTourWhenRequested(booted) {
  if (!new URLSearchParams(window.location.search).has("tour")) return;
  Promise.resolve(booted)
    .then(() => import("./tour.js"))
    .then(({ startTour }) => startTour());
}
