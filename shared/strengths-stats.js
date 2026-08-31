// #13 (epic #5 Phase 2) -- pure, DOM-free aggregation over entry_moves
// data, following shared/injury-stats.js's own precedent from #39 (which
// itself follows shared/pyramid-stats.js's): server/api/performance.js
// runs this server-side (this epic's own "online-only" convention).
// MIN_TAG_COUNT/pluralizeHoldType: shared with injury-stats.js (#39),
// extracted to shared/tag-stats-helpers.js (#591) since both files had
// independently defined byte-identical copies of these two.
import { MIN_TAG_COUNT, pluralizeHoldType } from "./tag-stats-helpers.js";

export { MIN_TAG_COUNT };

function cellKey(move) {
  return [move.limb, move.side, move.holdType, move.movementStyle, move.wallAngle].join("|");
}

// One "cell" = one full 5-value combination (limb, side, holdType,
// movementStyle, wallAngle) -- the same five tagging dimensions
// entry_moves rows carry. hardestCount/easiestCount track the two
// difficulty buckets separately so the score (hardest share) can be
// derived; total is their sum, the value the confidence gate checks.
export function cellCounts(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    for (const move of entry.moves ?? []) {
      const key = cellKey(move);
      const existing = byKey.get(key);
      if (existing) {
        if (move.difficulty === "hardest") existing.hardestCount++;
        else if (move.difficulty === "easiest") existing.easiestCount++;
      } else {
        byKey.set(key, {
          limb: move.limb, side: move.side, holdType: move.holdType, movementStyle: move.movementStyle, wallAngle: move.wallAngle,
          hardestCount: move.difficulty === "hardest" ? 1 : 0,
          easiestCount: move.difficulty === "easiest" ? 1 : 0,
        });
      }
    }
  }
  return [...byKey.values()].map(c => ({
    ...c,
    total: c.hardestCount + c.easiestCount,
    score: c.hardestCount / (c.hardestCount + c.easiestCount),
  }));
}

// Weakest (highest hardest-share) first. Cells below MIN_TAG_COUNT never
// appear at all -- a 1-tag cell scoring 100% "weakness" would be a false-
// confidence ranking, the same evidence-honesty concern the design doc
// raises for this exact gate.
export function rankedCells(entries, minCount = MIN_TAG_COUNT) {
  return cellCounts(entries)
    .filter(c => c.total >= minCount)
    .sort((a, b) => b.score - a.score);
}

// null when nothing clears the gate -- the composition root renders a
// "not enough data yet" state in that case.
export function topWeakness(entries, minCount = MIN_TAG_COUNT) {
  const ranked = rankedCells(entries, minCount);
  return ranked.length ? ranked[0] : null;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// e.g. "Left Hand" -- matches client/move-tagging.js's own LIMB_SIDE_OPTIONS
// label convention exactly (#584), so a limbSide anchor reads the same way
// the entry form's own Limb dropdown already does.
function limbSideLabel(limb, side) {
  return `${capitalize(side)} ${capitalize(limb)}`;
}

// The flattened, single-value anchor list a drill-down can pick from --
// deliberately scoped to values that actually appear in this user's own
// tagged data (cellCounts' own output), not the full theoretical
// vocabulary -- no point offering "Right Knee" as pickable if the user
// never tagged anything with it.
export function availableAnchors(entries) {
  const cells = cellCounts(entries);
  const anchors = [];
  const seen = new Set();
  function add(dimension, value, label) {
    const key = `${dimension}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push({ dimension, value, label });
  }
  for (const cell of cells) {
    add("limbSide", `${cell.limb}-${cell.side}`, limbSideLabel(cell.limb, cell.side));
    add("holdType", cell.holdType, cell.holdType);
    add("movementStyle", cell.movementStyle, cell.movementStyle);
    add("wallAngle", cell.wallAngle, cell.wallAngle);
  }
  return anchors;
}

function matchesAnchor(cell, dimension, value) {
  if (dimension === "limbSide") return `${cell.limb}-${cell.side}` === value;
  if (dimension === "holdType") return cell.holdType === value;
  if (dimension === "movementStyle") return cell.movementStyle === value;
  if (dimension === "wallAngle") return cell.wallAngle === value;
  return false;
}

// Ranks every combination of the *other three* dimensions for one fixed
// anchor value -- e.g. dimension="holdType", value="crimp" ranks every
// limb+side x movementStyle x wallAngle combination that involves crimp,
// weakest first, still subject to the same confidence gate.
export function rankedForAnchor(entries, dimension, value, minCount = MIN_TAG_COUNT) {
  return cellCounts(entries)
    .filter(c => matchesAnchor(c, dimension, value))
    .filter(c => c.total >= minCount)
    .sort((a, b) => b.score - a.score);
}

// Plan-author's own reading of natural English for each of the four fixed
// wall-angle values (the design doc gives one worked example, not a
// general rule) -- see this plan's own Global Constraints for the ruling.
const WALL_ANGLE_ADJECTIVE = { slab: "slab", vert: "vertical", overhang: "overhanging", roof: "roof" };

// Structured data in, one prose sentence out -- same separation
// shared/injury-stats.js's describeCluster models for its own headline.
export function describeWeakness(cell) {
  return `Your ${cell.side} ${cell.limb} on ${WALL_ANGLE_ADJECTIVE[cell.wallAngle]} ${pluralizeHoldType(cell.holdType)} looks like a key weakness.`;
}
