// Tags needed before a combination is shown as a pattern rather than noise.
export const MIN_TAG_COUNT = 3;

export function pluralizeHoldType(holdType) {
  return holdType.endsWith("ch") ? `${holdType}es` : `${holdType}s`;
}

const WALL_ANGLE_ADJECTIVE = { slab: "slab", vert: "vertical", overhang: "overhanging", roof: "roof" };

// "left hand on overhanging crimps": one tagged move, as the insight cards name it.
export function describeMove({ side, limb, wallAngle, holdType }) {
  return `${side} ${limb} on ${WALL_ANGLE_ADJECTIVE[wallAngle] ?? wallAngle} ${pluralizeHoldType(holdType)}`;
}

// Sentence case over the whole string; per-word would Title Case it.
export function humanize(value) {
  const s = value.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
