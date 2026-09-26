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
