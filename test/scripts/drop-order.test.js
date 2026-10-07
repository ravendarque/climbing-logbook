import { describe, expect, it } from "vitest";
import { dropOrder } from "../../scripts/lib/drop-order.mjs";

const table = (name, ...parents) => ({
  name,
  sql: `CREATE TABLE "${name}" (id TEXT${parents.map(parent => `, ${parent}_id TEXT REFERENCES "${parent}"(id)`).join("")})`,
});

describe("dropOrder", () => {
  it("drops every table after the tables that reference it", () => {
    const order = dropOrder([
      table("user"),
      table("locations", "user"),
      table("places", "user", "locations"),
      table("entries", "user", "places"),
      table("d1_migrations"),
    ]);
    expect(order).toHaveLength(5);
    expect(order.indexOf("entries")).toBeLessThan(order.indexOf("places"));
    expect(order.indexOf("places")).toBeLessThan(order.indexOf("locations"));
    expect(order.indexOf("locations")).toBeLessThan(order.indexOf("user"));
  });

  it("ignores a table's references to itself", () => {
    expect(dropOrder([table("comments", "comments")])).toEqual(["comments"]);
  });

  it("refuses a cycle rather than dropping a referenced table", () => {
    expect(() => dropOrder([table("a", "b"), table("b", "a")])).toThrow("cycle");
  });
});
