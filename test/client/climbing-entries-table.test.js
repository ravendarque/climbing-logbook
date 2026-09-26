// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../client/components/climbing-entries-table.js";

let el;

function entry(overrides = {}) {
  return { id: "e1", placeId: "p1", type: "boulder", status: "send", grade: "6A", date: "2026-01-01", name: "Test", ...overrides };
}

beforeEach(() => {
  el = document.createElement("climbing-entries-table");
  document.body.append(el);
});

afterEach(() => {
  el.remove();
});

describe("ClimbingEntriesTable render batching", () => {
  it("defers rendering until microtasks flush -- nothing renders synchronously from entries/places/locations setters", () => {
    el.places = [{ id: "p1", locationId: "loc1", area: "" }];
    el.entries = [entry()];
    el.locations = [{ id: "loc1", name: "Fontainebleau", country: "France" }];
    expect(el.querySelector(".place-header")).toBeNull();
  });

  it("renders exactly once, already with the final correct state, once the coalesced microtask flushes", async () => {
    el.places = [{ id: "p1", locationId: "loc1", area: "" }];
    el.entries = [entry()];
    el.locations = [{ id: "loc1", name: "Fontainebleau", country: "France" }];
    await Promise.resolve(); // flush the coalesced microtask
    const header = el.querySelector(".place-header span");
    expect(header.textContent).toBe("Fontainebleau");
  });
});

describe("focus restoration after a re-render (#805)", () => {
  async function seedOneEntry() {
    el.editable = true;
    el.places = [{ id: "p1", locationId: "loc1", area: "" }];
    el.entries = [entry()];
    el.locations = [{ id: "loc1", name: "Fontainebleau", country: "France" }];
    await Promise.resolve();
  }

  it("keeps focus on the place header after a collapse/expand click", async () => {
    await seedOneEntry();
    const header = el.querySelector(".place-header");
    header.focus();
    header.click();
    await Promise.resolve();
    const newHeader = el.querySelector('.place-header[data-location-id="loc1"]');
    expect(document.activeElement).toBe(newHeader);
    expect(newHeader).not.toBe(header); // genuinely a new DOM node, not the old one surviving
  });

  it("keeps focus on the sortable column header after a sort-toggle click", async () => {
    await seedOneEntry();
    const sortTh = el.querySelector('th[data-sort="grade"]');
    sortTh.focus();
    sortTh.click();
    await Promise.resolve();
    const newSortTh = el.querySelector('th[data-sort="grade"][data-location-id="loc1"]');
    expect(document.activeElement).toBe(newSortTh);
    expect(newSortTh).not.toBe(sortTh);
  });

  it("keeps focus on the Show more button after revealing another page", async () => {
    el.editable = true;
    el.places = [{ id: "p1", locationId: "loc1", area: "" }];
    el.entries = Array.from({ length: 101 }, (_, i) => entry({ id: `e${i}`, date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
    el.locations = [{ id: "loc1", name: "Fontainebleau", country: "France" }];
    await Promise.resolve();

    const showMoreBtn = el.querySelector(".show-more-btn");
    expect(showMoreBtn).not.toBeNull();
    showMoreBtn.focus();
    showMoreBtn.click();
    await Promise.resolve();

    expect(el.querySelector(".show-more-btn")).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('.place-header[data-location-id="loc1"]'));
  });

  it("falls back to the place header when Show all removes its own button", async () => {
    el.editable = true;
    el.places = [{ id: "p1", locationId: "loc1", area: "" }];
    el.entries = Array.from({ length: 150 }, (_, i) => entry({ id: `e${i}`, date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
    el.locations = [{ id: "loc1", name: "Fontainebleau", country: "France" }];
    await Promise.resolve();

    const showAllBtn = el.querySelector(".show-all-btn");
    showAllBtn.focus();
    showAllBtn.click();
    await Promise.resolve();

    expect(el.querySelector(".show-all-btn")).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('.place-header[data-location-id="loc1"]'));
  });

  it("doesn't steal focus onto the component when nothing inside it was focused beforehand", async () => {
    await seedOneEntry();
    const outsideBtn = document.createElement("button");
    document.body.append(outsideBtn);
    outsideBtn.focus();

    el.entries = [entry({ grade: "6B" })]; // any change that triggers #update()
    await Promise.resolve();

    expect(document.activeElement).toBe(outsideBtn);
    outsideBtn.remove();
  });
});
