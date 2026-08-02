// Extracted from client/main.js (#206) -- the merge logic that reconciles
// the offline queue on top of already-loaded entries/places/locations.
// This is the applyPendingQueue/applyPendingToEntries function #26
// originally called out by name as the motivating example for wanting
// real test coverage on this app's client-side logic.
//
// Returns new { entries, places, locations } arrays rather than mutating
// the passed-in ones (#264, changed from the original mutate-in-place
// contract) -- store.js is now this function's sole caller (wrapped as
// its own applyPendingQueue() method, alongside placeOf/filteredEntries/
// etc.), and needs a return value it can reassign its own closure
// variables to and notify() subscribers from, the same pattern every
// other Store mutation follows.
//
// Queue items are { kind: "location"|"place"|"entry", op, record }.
// location/place items are always op:"add" (#158's add-place modal is
// the only thing that queues them, and editing/deleting either isn't
// implemented yet -- #159/#160) -- applied by just pushing the record
// in optimistically, no _pending badge, since neither is rendered as
// its own list row anywhere; entries get the full add/edit/delete +
// _pending treatment this already had.
export function applyPendingQueue(queue, entries, places, locations) {
  let nextEntries = entries;
  let nextPlaces = places;
  let nextLocations = locations;
  for (const item of queue) {
    if (item.kind === "location") {
      if (!nextLocations.some(l => l.id === item.record.id)) nextLocations = [...nextLocations, item.record];
    } else if (item.kind === "place") {
      if (!nextPlaces.some(p => p.id === item.record.id)) nextPlaces = [...nextPlaces, item.record];
    } else if (item.op === "add") {
      if (!nextEntries.some(e => e.id === item.record.id)) {
        nextEntries = [...nextEntries, { ...item.record, _pending: true }];
      }
    } else if (item.op === "delete") {
      // Stays visible (marked pending) until the delete actually syncs --
      // removing it here early is what made offline-queued deletes
      // vanish instead of showing as pending (see #61).
      const idx = nextEntries.findIndex(e => e.id === item.record.id);
      if (idx !== -1) {
        nextEntries = nextEntries.slice();
        nextEntries[idx] = { ...item.record, _pending: true, _pendingDelete: true };
      }
    } else {
      const idx = nextEntries.findIndex(e => e.id === item.record.id);
      if (idx !== -1) {
        nextEntries = nextEntries.slice();
        nextEntries[idx] = { ...item.record, _pending: true };
      }
    }
  }
  return { entries: nextEntries, places: nextPlaces, locations: nextLocations };
}
