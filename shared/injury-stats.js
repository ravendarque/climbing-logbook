// #39 (epic #5 Phase 2) -- pure, DOM-free aggregation over entry_pain_moves
// data, following shared/pyramid-stats.js's own precedent for why this
// lives in shared/ rather than client/: server/api/performance.js runs
// this server-side (the design doc's own "online-only" rule for every
// Performance Insight, mirroring how the Grade Pyramid is computed), and
// the same functions are reusable client-side if a future view ever needs
// them without a round-trip.
import { dateRank } from "./date-helpers.js";

// Placeholder threshold (design doc's own "tune once there's real data"
// framing, matching #13's identical placeholder) -- a cluster needs at
// least this many total pain-tags across the user's whole logbook before
// it's presented as a real pattern rather than noise from one or two
// climbs.
export const MIN_TAG_COUNT = 5;

// One "cluster" = one full 5-value combination (limb, side, holdType,
// movementStyle, wallAngle) -- the same five tagging dimensions
// entry_pain_moves rows carry (shared/entry-schema.js's own vocabulary).
// Counts every pain-tagged move across every entry, not just one per
// entry -- a single climb tagging the same combination twice (rare, but
// the data model allows it) counts twice, since each row is a real,
// separate reported pain event.
export function painClusterCounts(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    for (const move of entry.painMoves ?? []) {
      const key = [move.limb, move.side, move.holdType, move.movementStyle, move.wallAngle].join("|");
      const existing = byKey.get(key);
      if (existing) {
        existing.count++;
      } else {
        byKey.set(key, { limb: move.limb, side: move.side, holdType: move.holdType, movementStyle: move.movementStyle, wallAngle: move.wallAngle, count: 1 });
      }
    }
  }
  return [...byKey.values()];
}

// null when nothing clears the confidence gate -- the composition root
// renders a "not enough data yet" state in that case, never a
// false-confidence ranked callout from one or two tags.
export function topPainCluster(entries, minCount = MIN_TAG_COUNT) {
  const eligible = painClusterCounts(entries).filter(c => c.count >= minCount);
  if (eligible.length === 0) return null;
  return eligible.reduce((max, c) => (c.count > max.count ? c : max));
}

// Most-recent-first, same dateRank() a missing/malformed date already
// sorts oldest exactly like every other date-sorted list in this app.
export function painLogEntries(entries) {
  return entries
    .filter(e => (e.painMoves ?? []).length > 0)
    .sort((a, b) => dateRank(b.date) - dateRank(a.date));
}

// Only "pinch" in the current hold-type vocabulary (shared/entry-
// schema.js's HOLD_TYPES_BY_LIMB) needs the "es" branch -- a plain
// trailing "s" is correct for every other current word (crimp, jug,
// pocket, sloper, edge, toe-hook, heel-hook, kneebar). Not a general
// pluralization library -- scoped to what this fixed vocabulary actually
// needs, same "don't build for words that don't exist yet" discipline
// entry-schema.js's own vocabulary comments already follow.
function pluralizeHoldType(holdType) {
  return holdType.endsWith("ch") ? `${holdType}es` : `${holdType}s`;
}

// Structured data in, one prose sentence out -- kept here (not inline in
// the composition root) so it's unit-testable without a DOM, same
// separation shared/pyramid-stats.js models for its own structured-data-
// vs-rendering split.
export function describeCluster(cluster) {
  return `Your pain flags cluster on ${cluster.side} ${cluster.limb} ${pluralizeHoldType(cluster.holdType)}, ${cluster.wallAngle}.`;
}
