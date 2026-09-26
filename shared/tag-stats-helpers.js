// Tags needed before a combination is shown as a pattern rather than noise.
export const MIN_TAG_COUNT = 3;

export function pluralizeHoldType(holdType) {
  return holdType.endsWith("ch") ? `${holdType}es` : `${holdType}s`;
}

// Sentence case over the whole string; per-word would Title Case it.
export function humanize(value) {
  const s = value.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
