import { dateRank } from "./date-helpers.js";
import { MIN_TAG_COUNT, pluralizeHoldType } from "./tag-stats-helpers.js";

export { MIN_TAG_COUNT };

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

export function topPainCluster(entries, minCount = MIN_TAG_COUNT) {
  const eligible = painClusterCounts(entries).filter(c => c.count >= minCount);
  if (eligible.length === 0) return null;
  return eligible.reduce((max, c) => (c.count > max.count ? c : max));
}

export function painLogEntries(entries) {
  return entries
    .filter(e => (e.painMoves ?? []).length > 0)
    .sort((a, b) => dateRank(b.date) - dateRank(a.date));
}

export function describeCluster(cluster) {
  return `Your pain flags cluster on ${cluster.side} ${cluster.limb} ${pluralizeHoldType(cluster.holdType)}, ${cluster.wallAngle}.`;
}
