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
store.setLocations([{ id: "loc1", name: "Test Crag", country: "United Kingdom" }]);
store.setPlaces([{ id: "place1", locationId: "loc1", area: "Test Area" }]);
store.setEntries([
  { id: "e1", placeId: "place1", type: "boulder", status: "send", grade: "6A", date: "2026-05-01", name: "Test Boulder 1" },
  { id: "e2", placeId: "place1", type: "boulder", status: "send", grade: "6B", date: "2026-05-02", name: "Test Boulder 2" },
]);
store.setActiveType("boulder");
store.setActiveView("map");

createMapView({ store }).render();
