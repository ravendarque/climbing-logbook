// Extracted from client/main.js (#206). Entry/place/location joins, plus
// filter/sort/group logic for the entries table.
//
// Every function here takes its data (entries/places/locations/filter
// criteria) as explicit parameters instead of reading main.js's module-
// global ALL_ENTRIES/ALL_PLACES/ALL_LOCATIONS/state directly -- that's
// what makes this testable without a DOM or the rest of the app. store.js
// keeps thin same-named wrapper methods (placeOf, locationOf, etc.)
// that close over its own state and call these, so none of the
// ~25 existing call sites throughout the codebase needed to change.
import { BOULDER_GRADES, LEAD_GRADES, gradeRank } from "./grade-data.js";
import { dateRank } from "./date-helpers.js";

// Entry -> Place -> Location join, degrading gracefully (never null,
// matching this file's existing lookup conventions like
// COUNTRY_BY_NAME) if placeId/locationId don't resolve to anything
// real -- rather than every call site needing its own null-check.
export function placeOf(entry, places) {
  return places.find(p => p.id === entry.placeId) ?? { locationId: "", area: "" };
}

export function locationOf(place, locations) {
  return locations.find(l => l.id === place.locationId) ?? { name: "", country: "" };
}

export function entryLocation(entry, places, locations) {
  return locationOf(placeOf(entry, places), locations);
}

export function entryMatchesStatusFilter(entry, filter) {
  if (filter === "flash") return entry.status === "send" && entry.firstAttempt;
  if (filter === "send")  return entry.status === "send" && !entry.firstAttempt;
  return entry.status === filter;
}

// Active discipline's own grade list -- BOULDER_GRADES/LEAD_GRADES, not
// the shared GRADE_ORDER/gradeRank table -- so the range filter's step
// count and bounds always match what the entry-form picker itself offers
// for this discipline (21 boulder grades vs. 14 lead grades) (#161).
export function activeGradeList(activeType) {
  return activeType === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
}

export function filteredEntries(entries, places, { activeType, statusFilters, gradeRange, search }) {
  const q = search.toLowerCase();
  return entries.filter(e => {
    if (e.type !== activeType) return false;
    if (statusFilters.size > 0 &&
        ![...statusFilters].some(f => entryMatchesStatusFilter(e, f))) return false;
    if (gradeRange) {
      const list = activeGradeList(activeType);
      const r = gradeRank(e.grade);
      if (r < gradeRank(list[gradeRange.min].g) || r > gradeRank(list[gradeRange.max].g)) return false;
    }
    if (q && !e.name.toLowerCase().includes(q) && !placeOf(e, places).area.toLowerCase().includes(q)) return false;
    return true;
  });
}

// Grouped by locationId, not placeId -- a location can have several
// distinct places/areas (different placeIds sharing one locationId),
// and they should still show together under one header with Area as a
// per-row column, same table UX as before Place existed. Grouping by
// location (rather than by raw location *name* text) is what makes two
// different real-world locations that happen to share a name honestly
// stay two separate groups instead of being silently merged (#157/#158).
//
// `allEntries` (not `entries`) drives the location ordering deliberately
// -- it preserves the order locations first appeared in the *unfiltered*
// data, so switching filters doesn't reshuffle which location's section
// appears first.
export function groupByPlace(entries, allEntries, places) {
  const map = new Map();
  for (const e of entries) {
    const locationId = placeOf(e, places).locationId;
    if (!map.has(locationId)) map.set(locationId, []);
    map.get(locationId).push(e);
  }
  const locationOrder = [...new Set(allEntries.map(e => placeOf(e, places).locationId))];
  return locationOrder
    .filter(id => map.has(id))
    .map(id => [id, map.get(id)]);
}

export function sortEntries(entries, { col, dir }, places) {
  const m = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (col === "grade")  return m * (gradeRank(a.grade) - gradeRank(b.grade));
    if (col === "date")   return m * (dateRank(a.date) - dateRank(b.date));
    if (col === "name")   return m * a.name.localeCompare(b.name);
    if (col === "area")   return m * placeOf(a, places).area.localeCompare(placeOf(b, places).area);
    return 0;
  });
}
