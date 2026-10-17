// Returns new arrays.
export function applyPendingQueue(queue, entries, places, locations) {
  let nextEntries = entries;
  let nextPlaces = places;
  let nextLocations = locations;

  // A deleted place's climbs move with it (#160), and show as pending until the move syncs.
  const moveEntries = (fromPlaceIds, toPlaceId) => {
    nextEntries = nextEntries.map(e =>
      fromPlaceIds.includes(e.placeId) ? { ...e, placeId: toPlaceId, _pending: true } : e,
    );
  };

  for (const item of queue) {
    const { id } = item.record;
    if (item.kind === "location") {
      if (item.op === "edit") {
        nextLocations = nextLocations.map(l => (l.id === id ? { ...l, ...item.record, _pending: true } : l));
      } else if (item.op === "delete") {
        const gone = nextPlaces.filter(p => p.locationId === id).map(p => p.id);
        nextLocations = nextLocations.filter(l => l.id !== id);
        nextPlaces = nextPlaces.filter(p => !gone.includes(p.id));
        if (item.record.moveTo) moveEntries(gone, item.record.moveTo);
      } else if (!nextLocations.some(l => l.id === id)) {
        nextLocations = [...nextLocations, item.record];
      }
    } else if (item.kind === "place") {
      if (item.op === "edit") {
        nextPlaces = nextPlaces.map(p => (p.id === id ? { ...p, ...item.record, _pending: true } : p));
      } else if (item.op === "delete") {
        nextPlaces = nextPlaces.filter(p => p.id !== id);
        if (item.record.moveTo) moveEntries([id], item.record.moveTo);
      } else if (!nextPlaces.some(p => p.id === id)) {
        nextPlaces = [...nextPlaces, item.record];
      }
    } else if (item.op === "add") {
      if (!nextEntries.some(e => e.id === id)) {
        nextEntries = [...nextEntries, { ...item.record, _pending: true }];
      }
    } else if (item.op === "delete") {
      // Stays visible, marked pending, until the delete syncs.
      const idx = nextEntries.findIndex(e => e.id === id);
      if (idx !== -1) {
        nextEntries = nextEntries.slice();
        nextEntries[idx] = { ...item.record, _pending: true, _pendingDelete: true };
      }
    } else {
      const idx = nextEntries.findIndex(e => e.id === id);
      if (idx !== -1) {
        nextEntries = nextEntries.slice();
        nextEntries[idx] = { ...item.record, _pending: true };
      }
    }
  }
  return { entries: nextEntries, places: nextPlaces, locations: nextLocations };
}
