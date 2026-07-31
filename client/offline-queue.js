// Extracted from client/main.js (#206) -- the merge logic that reconciles
// the offline queue on top of already-loaded entries/places/locations.
// This is the applyPendingQueue/applyPendingToEntries function #26
// originally called out by name as the motivating example for wanting
// real test coverage on this app's client-side logic.
//
// Mutates entries/places/locations in place (push / index-assignment)
// rather than returning new arrays -- matches main.js's call sites, all
// of which rely on ALL_ENTRIES/ALL_PLACES/ALL_LOCATIONS being mutated by
// reference, not reassigned from a return value.
//
// Queue items are { kind: "location"|"place"|"entry", op, record }.
// location/place items are always op:"add" (#158's add-place modal is
// the only thing that queues them, and editing/deleting either isn't
// implemented yet -- #159/#160) -- applied by just pushing the record
// in optimistically, no _pending badge, since neither is rendered as
// its own list row anywhere; entries get the full add/edit/delete +
// _pending treatment this already had.
export function applyPendingQueue(queue, entries, places, locations) {
  for (const item of queue) {
    if (item.kind === "location") {
      if (!locations.some(l => l.id === item.record.id)) locations.push(item.record);
    } else if (item.kind === "place") {
      if (!places.some(p => p.id === item.record.id)) places.push(item.record);
    } else if (item.op === "add") {
      if (!entries.some(e => e.id === item.record.id)) {
        entries.push({ ...item.record, _pending: true });
      }
    } else if (item.op === "delete") {
      // Stays visible (marked pending) until the delete actually syncs --
      // removing it here early is what made offline-queued deletes
      // vanish instead of showing as pending (see #61).
      const idx = entries.findIndex(e => e.id === item.record.id);
      if (idx !== -1) entries[idx] = { ...item.record, _pending: true, _pendingDelete: true };
    } else {
      const idx = entries.findIndex(e => e.id === item.record.id);
      if (idx !== -1) entries[idx] = { ...item.record, _pending: true };
    }
  }
}
