// Children before parents: D1 counts no writes for dropping a table nothing references, but a row per row otherwise.
export function dropOrder(tables) {
  const parents = new Map(
    tables.map(({ name, sql }) => [
      name,
      new Set([...sql.matchAll(/REFERENCES\s+"?(\w+)"?/gi)].map(match => match[1]).filter(parent => parent !== name)),
    ]),
  );
  const order = [];
  const remaining = new Set(parents.keys());
  while (remaining.size > 0) {
    const leaves = [...remaining].filter(name => ![...remaining].some(other => parents.get(other).has(name)));
    if (leaves.length === 0) throw new Error(`Foreign keys form a cycle: ${[...remaining].join(", ")}`);
    for (const name of leaves.toSorted()) {
      order.push(name);
      remaining.delete(name);
    }
  }
  return order;
}
