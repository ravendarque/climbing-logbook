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
import { gradeRank, gradeTierForScale } from "../shared/grade-data.js";
import { dateRank } from "../shared/date-helpers.js";

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

// #708 -- as-logged grade-label search, deliberately literal string
// matching, not cross-scale/canonical (the tier facet below already
// covers cross-scale equivalence -- this is a small, predictable text
// feature, not a second conversion engine). `lowerQuery` is already
// lowercased by filteredEntries() below.
//
// A query WITHOUT a trailing +/- matches the grade's own base
// (number+letter, modifier stripped) -- searching "7a" matches "7A",
// "7a", "7A+", and "7a+" alike. A query WITH a trailing +/- matches the
// grade's full label, modifier included -- searching "7a+" matches only
// "7a+"/"7A+", not the bare "7a". Exact-equality after that
// normalization, not a substring test like the name/area predicate
// below -- "6" is deliberately not a match for "6A" (that's what the
// tier filter is for), only a real grade-shaped query does anything.
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
    // #63 -- deliberately no "empty statusFilters = show every status"
    // shortcut: statusFilters means exactly what it contains, full stop.
    // A caller wanting "no constraint from this facet" passes every
    // status it wants shown, not an empty set -- keeps a facet that
    // genuinely defaults to non-empty (climbing-entries-table.js's own
    // #statusFilters, since archived opts out by default) from being
    // indistinguishable, in this function's own semantics, from a facet
    // that's been emptied out entirely.
    if (![...statusFilters].some(f => entryMatchesStatusFilter(e, f))) return false;
    // #644 -- only meaningful for Sport (Boulder entries have no
    // sportStyle at all); optional so callers that don't have this facet
    // yet (allDisciplines mode, #460) or older tests keep working
    // unchanged, unlike statusFilters above -- omitting it isn't the
    // same footgun since it's genuinely inert for every non-sport entry.
    if (activeType === "sport" && sportStyleFilters && !sportStyleFilters.has(e.sportStyle)) return false;
    // #708 -- replaces the old min/max gradeRange facet: filters on the
    // canonical tier derived from (grade, grade_scale), same "means
    // exactly what it contains" convention statusFilters/sportStyleFilters
    // already established (an empty Set shows nothing, not everything) --
    // optional, same "inert for a caller with no such facet yet" carve-out
    // sportStyleFilters has, for allDisciplines mode (#460), which has no
    // per-discipline tier facet of its own yet.
    if (gradeTiers && !gradeTiers.has(gradeTierForScale(e.grade, e.gradeScale, activeType))) return false;
    if (q && !e.name.toLowerCase().includes(q) && !placeOf(e, places).area.toLowerCase().includes(q) && !gradeMatchesSearch(e.grade, q)) return false;
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

// #461 -- `type` is new: `entries` here is always already single-
// discipline (grouped by location+discipline before this is called --
// see climbing-entries-table.js's own #renderLocationSection), but
// gradeRank() needs telling which discipline's order to sort against,
// not left to its "boulder" default (which used to silently mis-sort
// Sport rows whenever their real rank diverged from Boulder's list).
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
