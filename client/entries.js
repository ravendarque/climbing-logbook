import { gradeRank, gradeTierForScale } from "../shared/grade-data.js";
import { dateRank } from "../shared/date-helpers.js";

// Never null, so call sites need no checks.
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

// Literal label matching, not cross-scale: without a trailing + or -, the query matches the base grade.
const GRADE_SEARCH_MODIFIER_RE = /[+-]$/;
export function gradeMatchesSearch(grade, lowerQuery) {
  const g = grade.toLowerCase();
  return GRADE_SEARCH_MODIFIER_RE.test(lowerQuery)
    ? g === lowerQuery
    : g.replace(GRADE_SEARCH_MODIFIER_RE, "") === lowerQuery;
}

export function filteredEntries(entries, places, { activeType, statusFilters, gradeTiers, search, sportStyleFilters }) {
  const q = search.toLowerCase();
  return entries.filter(e => {
    if (e.type !== activeType) return false;
    // No empty-means-all shortcut: the set means exactly what it contains.
    if (![...statusFilters].some(f => entryMatchesStatusFilter(e, f))) return false;
    if (activeType === "sport" && sportStyleFilters && !sportStyleFilters.has(e.sportStyle)) return false;
    if (gradeTiers && !gradeTiers.has(gradeTierForScale(e.grade, e.gradeScale, activeType))) return false;
    if (q && !e.name.toLowerCase().includes(q) && !placeOf(e, places).area.toLowerCase().includes(q) && !gradeMatchesSearch(e.grade, q)) return false;
    return true;
  });
}

// By location, not name, so two crags that share a name stay separate. Ordered by the
// unfiltered data, so filtering doesn't reshuffle sections.
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

export function sortEntries(entries, { col, dir }, places, type) {
  const m = dir === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (col === "grade")  return m * (gradeRank(a.grade, type) - gradeRank(b.grade, type));
    if (col === "date")   return m * (dateRank(a.date) - dateRank(b.date));
    if (col === "name")   return m * a.name.localeCompare(b.name);
    if (col === "area")   return m * placeOf(a, places).area.localeCompare(placeOf(b, places).area);
    return 0;
  });
}
