// Returns new arrays. Location and place items are only ever adds.
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
      // Stays visible, marked pending, until the delete syncs.
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
