// Upserts by id, keeping existing rows in place, and drops rows flagged deleted. Returns a new array.
export function mergeDelta(current, deltaRows) {
  const byId = new Map(current.map(row => [row.id, row]));
  for (const row of deltaRows) {
    if (row.deleted) {
      byId.delete(row.id);
      continue;
    }
    // The flag is dropped so delta and full-sync rows have the same shape.
    const { deleted, ...rest } = row;
    byId.set(row.id, rest);
  }
  return [...byId.values()];
}
