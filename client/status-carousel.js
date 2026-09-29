export const COPIES = 3;

export function centreCopyIndex(statusIndex, count) {
  return count + statusIndex;
}

export function statusAt(position, count) {
  return ((Math.round(position) % count) + count) % count;
}

export function nearestCopyIndex(position, statusIndex, count) {
  const below = statusIndex + count * Math.floor((position - statusIndex) / count);
  return position - below <= count / 2 ? below : below + count;
}

export function recentre(position, count) {
  let p = position;
  while (p < count - 0.5) p += count;
  while (p >= 2 * count - 0.5) p -= count;
  return p;
}

export function itemLook(distance) {
  const d = Math.min(Math.abs(distance), 2);
  const near = Math.min(d, 1);
  const far = Math.max(d - 1, 0);
  return { scale: 1 - 0.2 * near - 0.1 * far, opacity: 1 - 0.4 * near - 0.3 * far, muted: near };
}

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}
