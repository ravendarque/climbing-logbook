// Exercises places.js/locations.js/settings.js/admin-session.js/admin-login.js
// through the real Worker entrypoint, same rationale as logbook.test.js:
// the public HTTP contract is what's under test, not module internals.
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

const PLACES_KEY = "logbook:places";
const LOCATIONS_KEY = "logbook:locations";
const SETTINGS_KEY = "logbook:settings";

beforeEach(async () => {
  await env.LOGBOOK_KV.delete(PLACES_KEY);
  await env.LOGBOOK_KV.delete(LOCATIONS_KEY);
  await env.LOGBOOK_KV.delete(SETTINGS_KEY);
});

function fetchJson(path, init) {
  return exports.default.fetch(`https://example.com${path}`, init);
}
function postJson(path, body) {
  return fetchJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function putJson(path, body) {
  return fetchJson(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("places", () => {
  const VALID_PLACE = { locationId: "loc-1", area: "Sector 1" };

  it("returns an empty places array when KV is unset", async () => {
    const res = await fetchJson("/logbook/api/places");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ places: [] });
  });

  it("creates a place on the happy path", async () => {
    const res = await postJson("/logbook/api/admin/places", VALID_PLACE);
    expect(res.status).toBe(201);
    const { places } = await res.json();
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ locationId: "loc-1", area: "Sector 1" });
    expect(typeof places[0].id).toBe("string");
    expect(places[0].id.length).toBeGreaterThan(0);
  });

  it("defaults area to an empty string when omitted", async () => {
    const res = await postJson("/logbook/api/admin/places", { locationId: "loc-1" });
    const { places } = await res.json();
    expect(places[0].area).toBe("");
  });

  it("rejects malformed JSON", async () => {
    const res = await postJson("/logbook/api/admin/places", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("rejects a missing locationId", async () => {
    const res = await postJson("/logbook/api/admin/places", { area: "Sector 1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: locationId");
  });

  it("replays an existing id idempotently instead of erroring or duplicating", async () => {
    const placeWithId = { ...VALID_PLACE, id: "fixed-place-1" };
    const first = await postJson("/logbook/api/admin/places", placeWithId);
    expect(first.status).toBe(201);

    const second = await postJson("/logbook/api/admin/places", placeWithId);
    expect(second.status).toBe(200);
    const { places } = await second.json();
    expect(places).toHaveLength(1);
  });
});

describe("locations", () => {
  const VALID_LOCATION = { name: "Magic Wood", country: "Switzerland" };

  it("returns an empty locations array when KV is unset", async () => {
    const res = await fetchJson("/logbook/api/locations");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locations: [] });
  });

  it("creates a location on the happy path", async () => {
    const res = await postJson("/logbook/api/admin/locations", VALID_LOCATION);
    expect(res.status).toBe(201);
    const { locations } = await res.json();
    expect(locations).toHaveLength(1);
    expect(locations[0]).toMatchObject({ name: "Magic Wood", country: "Switzerland" });
    expect(typeof locations[0].id).toBe("string");
    expect(locations[0].id.length).toBeGreaterThan(0);
  });

  it("defaults country to an empty string when omitted", async () => {
    const res = await postJson("/logbook/api/admin/locations", { name: "Magic Wood" });
    const { locations } = await res.json();
    expect(locations[0].country).toBe("");
  });

  it("rejects malformed JSON", async () => {
    const res = await postJson("/logbook/api/admin/locations", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("rejects a missing name", async () => {
    const res = await postJson("/logbook/api/admin/locations", { country: "Switzerland" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required field: name");
  });

  it("replays an existing id idempotently instead of erroring or duplicating", async () => {
    const locationWithId = { ...VALID_LOCATION, id: "fixed-location-1" };
    const first = await postJson("/logbook/api/admin/locations", locationWithId);
    expect(first.status).toBe(201);

    const second = await postJson("/logbook/api/admin/locations", locationWithId);
    expect(second.status).toBe(200);
    const { locations } = await second.json();
    expect(locations).toHaveLength(1);
  });
});

describe("settings", () => {
  it("returns default settings when KV is unset", async () => {
    const res = await fetchJson("/logbook/api/settings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "boulder" });
  });

  it("updates athleteMode on the happy path", async () => {
    const res = await putJson("/logbook/api/admin/settings", { athleteMode: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: true, activeDiscipline: "boulder" });
  });

  it("updates activeDiscipline on the happy path", async () => {
    const res = await putJson("/logbook/api/admin/settings", { activeDiscipline: "lead" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ athleteMode: false, activeDiscipline: "lead" });
  });

  it("merges a partial update onto existing settings instead of overwriting", async () => {
    await putJson("/logbook/api/admin/settings", { athleteMode: true });
    const res = await putJson("/logbook/api/admin/settings", { activeDiscipline: "lead" });
    expect(await res.json()).toEqual({ athleteMode: true, activeDiscipline: "lead" });
  });

  it("rejects malformed JSON", async () => {
    const res = await putJson("/logbook/api/admin/settings", "{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("rejects a non-boolean athleteMode", async () => {
    const res = await putJson("/logbook/api/admin/settings", { athleteMode: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("athleteMode must be a boolean");
  });

  it("rejects an activeDiscipline outside boulder/lead", async () => {
    const res = await putJson("/logbook/api/admin/settings", { activeDiscipline: "sport" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("activeDiscipline must be 'boulder' or 'lead'");
  });
});

describe("admin-session", () => {
  it("echoes the Access-authenticated user's email", async () => {
    const res = await fetchJson("/logbook/api/admin/session", {
      headers: { "Cf-Access-Authenticated-User-Email": "nix@ravendarque.com" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ loggedIn: true, email: "nix@ravendarque.com" });
  });

  it("returns a null email when the header is absent", async () => {
    const res = await fetchJson("/logbook/api/admin/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ loggedIn: true, email: null });
  });
});

describe("admin-login", () => {
  it("redirects to the app", async () => {
    const res = await fetchJson("/logbook/api/admin/login", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://ravendarque.com/logbook/");
  });
});
