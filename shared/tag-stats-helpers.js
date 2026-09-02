// #591 -- extracted from shared/injury-stats.js (#39) and
// shared/strengths-stats.js (#13), which had independently defined the
// exact same threshold and pluralization helper for the same five-key
// tag-clustering pattern (limb, side, holdType, movementStyle, wallAngle --
// shared/entry-schema.js's own vocabulary). Scoped to only these two
// byte-identical pieces per #591's own reasoning -- painClusterCounts/
// cellCounts stay unextracted since their accumulator shapes genuinely
// differ, and capitalize() was never actually duplicated across these two
// files in the first place.

// Placeholder threshold (design doc's own "tune once there's real data"
// framing) -- a cluster/cell needs at least this many total tags across the
// user's whole logbook before it's presented as a real pattern rather than
// noise from one or two climbs.
export const MIN_TAG_COUNT = 5;

// Only "pinch" in the current hold-type vocabulary (shared/entry-
// schema.js's HOLD_TYPES_BY_LIMB) needs the "es" branch -- a plain
// trailing "s" is correct for every other current word (crimp, jug,
// pocket, sloper, edge, toe-hook, heel-hook, kneebar). Not a general
// pluralization library -- scoped to what this fixed vocabulary actually
// needs, same "don't build for words that don't exist yet" discipline
// entry-schema.js's own vocabulary comments already follow.
export function pluralizeHoldType(holdType) {
  return holdType.endsWith("ch") ? `${holdType}es` : `${holdType}s`;
}

// #597 -- sentence case (not Title Case): hyphens become spaces, only the
// first letter is capitalized. Originally client/move-tagging.js-only;
// moved here (#614) once shared/strengths-stats.js and client/
// performance-strengths-main.js needed the exact same casing convention
// for the same tag vocabulary -- same "extract once genuinely shared,
// not duplicated a third time" reasoning MIN_TAG_COUNT/pluralizeHoldType
// above already followed (#591). Run over a whole multi-word string as
// one unit (e.g. "left-hand"), not each word separately -- humanizing
// words independently would Title-Case every one of them again.
export function humanize(value) {
  const s = value.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
