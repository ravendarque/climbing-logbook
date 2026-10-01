// The same counts as server/api/map.js's SQL, which test/map.test.js holds it to (ADR-0031).
export function mapCounts(entries, places, locations) {
  const placeById = new Map(places.map(place => [place.id, place]));
  const countryByLocation = new Map(locations.map(location => [location.id, location.country]));
  const counts = {};
  for (const entry of entries) {
    const place = placeById.get(entry.placeId);
    if (!place || !countryByLocation.has(place.locationId)) continue;
    const country = countryByLocation.get(place.locationId);
    counts[country] ??= {};
    counts[country][entry.type] ??= { total: 0, flash: 0, send: 0, project: 0 };
    const bucket = counts[country][entry.type];
    bucket.total++;
    if (entry.status === "send") bucket[entry.firstAttempt ? "flash" : "send"]++;
    else if (entry.status === "project") bucket.project++;
  }
  return counts;
}
