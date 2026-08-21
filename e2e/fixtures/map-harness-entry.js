// Test-only entry point for e2e/fixtures/map-harness.html (#407 Tier 1).
// Bundled by `pnpm run e2e:build-fixtures` into
// public/e2e-fixtures/map-harness.js -- see .gitignore's own comment on
// why that output is never part of a real deploy.
//
// Reuses client/store.js and client/map-view.js completely unchanged --
// this proves the actual production code path (map-main.js's own
// boot()/render() wiring, minus the fetch/session layer #407 makes
// unreachable outside a real login), not a reimplementation of it.
//
// #497 -- map-view.js no longer joins raw entries against places/
// locations itself; it takes the server's own already-computed
// aggregate via setCounts(). Hand-built here to the exact shape
// server/api/map.js returns, matching this fixture's original 3 boulder
// sends (2 in the UK, 1 in France) -- France (Fontainebleau) alongside
// the UK crag so e2e/component-harnesses.spec.js's pin-click test still
// has a second, real pinned country to click on.
import { createStore } from "../../client/store.js";
import { createMapView } from "../../client/map-view.js";

const store = createStore();
store.setActiveType("boulder");
store.setActiveView("map");

const mapView = createMapView({ store });
mapView.setCounts({
  "United Kingdom": { boulder: { total: 2, flash: 0, send: 2, project: 0 } },
  "France": { boulder: { total: 1, flash: 0, send: 1, project: 0 } },
});
