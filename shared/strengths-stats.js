import { MIN_TAG_COUNT, humanize, pluralizeHoldType } from "./tag-stats-helpers.js";

export { MIN_TAG_COUNT };

function cellKey(move) {
  return [move.limb, move.side, move.holdType, move.movementStyle, move.wallAngle].join("|");
}

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

export function rankedCells(entries, minCount = MIN_TAG_COUNT) {
  return cellCounts(entries)
    .filter(c => c.total >= minCount)
    .sort((a, b) => b.score - a.score);
}

export function topWeakness(entries, minCount = MIN_TAG_COUNT) {
  const ranked = rankedCells(entries, minCount);
  return ranked.length ? ranked[0] : null;
}

function limbSideLabel(limb, side) {
  return humanize(`${side}-${limb}`);
}

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
    add("holdType", cell.holdType, humanize(cell.holdType));
    add("movementStyle", cell.movementStyle, humanize(cell.movementStyle));
    add("wallAngle", cell.wallAngle, humanize(cell.wallAngle));
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

export function rankedForAnchor(entries, dimension, value, minCount = MIN_TAG_COUNT) {
  return cellCounts(entries)
    .filter(c => matchesAnchor(c, dimension, value))
    .filter(c => c.total >= minCount)
    .sort((a, b) => b.score - a.score);
}

const WALL_ANGLE_ADJECTIVE = { slab: "slab", vert: "vertical", overhang: "overhanging", roof: "roof" };

export function describeWeakness(cell) {
  return `Your ${cell.side} ${cell.limb} on ${WALL_ANGLE_ADJECTIVE[cell.wallAngle]} ${pluralizeHoldType(cell.holdType)} looks like a key weakness.`;
}
