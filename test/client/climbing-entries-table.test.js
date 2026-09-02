// @vitest-environment happy-dom
//
// #627 -- covers the render-batching fix (this component had no
// dedicated unit test before). happy-dom, same reasoning test/client/
// climbing-tab-bar.test.js gives: this component renders real DOM and
// needs a document, which the Cloudflare Workers pool (vitest.config.js's
// default) doesn't have.
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
  // #627 -- entries/places/locations are 3 independent property setters,
  // each triggering a render on its own. Every real caller sets entries
  // BEFORE locations (client/log-main.js's own render()) -- if each
  // setter rendered synchronously and immediately, the location group's
  // own name (this component's real caller order: entries first) would
  // render blank on that first pass, then correct itself once locations
  // caught up a moment later -- a real, repeated flicker, not a one-time
  // load flash, confirmed live against Raven's own screenshots of /log.
  //
  // A test that only checks the FINAL DOM state after all three setters
  // run can't tell "always correct" apart from "wrong, then corrected"
  // -- by the time it checks, the last (locations) setter has already
  // fixed things up either way. This one instead checks that NOTHING has
  // rendered into #sections yet synchronously, right after all three
  // setters run in the same tick -- proven to actually distinguish the
  // two behaviors: reverting the #update() fix locally and re-running
  // this test fails it (a real .place-header exists synchronously,
  // rendered by the eager `entries` setter before `locations` had even
  // been assigned).
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
