// Test-only entry point for e2e/fixtures/map-harness.html (#407 Tier 1).
// Bundled by `pnpm run e2e:build-fixtures` into
// public/e2e-fixtures/map-harness.js -- see .gitignore's own comment on
// why that output is never part of a real deploy.
//
// Reuses client/store.js and client/map-view.js completely unchanged --
// this proves the actual production code path (map-main.js's own
// boot()/render() wiring, minus the fetch/session layer #407 makes
// unreachable outside a real login), not a reimplementation of it.
import { createStore } from "../../client/store.js";
import { createMapView } from "../../client/map-view.js";

const store = createStore();
// France (Fontainebleau) alongside the UK crag -- e2e/component-harnesses.spec.js's
// pin-click test needs a second, real pinned country to click on.
store.setLocations([
  { id: "loc1", name: "Test Crag", country: "United Kingdom" },
  { id: "loc2", name: "Fontainebleau", country: "France" },
]);
store.setPlaces([
  { id: "place1", locationId: "loc1", area: "Test Area" },
  { id: "place2", locationId: "loc2", area: "Bas Cuvier" },
]);
store.setEntries([
  { id: "e1", placeId: "place1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Test Boulder 1" },
  { id: "e2", placeId: "place1", type: "boulder", status: "send", grade: "6B", date: "2026-05-02", name: "Test Boulder 2" },
  { id: "e3", placeId: "place2", type: "boulder", status: "send", grade: "6A", date: "2026-05-03", name: "Test Boulder 3" },
]);
store.setActiveType("boulder");
store.setActiveView("map");

createMapView({ store }).render();
