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
  return { scale: 1 - 0.2 * near - 0.1 * far, opacity: 1 - 0.25 * near - 0.25 * far, muted: near };
}

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function releaseTarget({ position, samples, releaseX, releaseTime, slot, flickMs }) {
  const first = samples.find(sample => releaseTime - sample.t <= flickMs);
  const elapsed = first ? releaseTime - first.t : 0;
  const velocity = elapsed > 0 ? (releaseX - first.x) / elapsed : 0;
  const projected = position - (velocity * flickMs) / slot;
  return Math.round(Math.max(position - 2, Math.min(position + 2, projected)));
}
