import { env } from "cloudflare:workers";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAuthedSession, fetchJson, jsonRequest, resetAuthTables } from "./support.js";

beforeAll(() => {
  env.BETA_GATE_ENABLED = "false";
});
afterAll(() => {
  env.BETA_GATE_ENABLED = "true";
});

let cookie;
let userId;
beforeEach(async () => {
  await resetAuthTables();
  ({ cookie, userId } = await createAuthedSession());
});

const as = (method, path, body, c = cookie) =>
  body === undefined
    ? fetchJson(path, { method, headers: { Cookie: c } })
    : jsonRequest(method, path, body, { Cookie: c });
const location = async (name, country = "France", c = cookie) =>
  (await (await as("POST", "/-/api/locations", { name, country }, c)).json()).location;
const place = async (locationId, area, c = cookie) =>
  (await (await as("POST", "/-/api/places", { locationId, area }, c)).json()).place;
const climb = async (placeId, name = "A climb") =>
  (await (await as("POST", "/-/api/entries", { placeId, name, type: "boulder", status: "send", grade: "6A" })).json())
    .entry;
const usage = () => env.LOGBOOK_DB.prepare(`SELECT * FROM account_usage WHERE user_id = ?`).bind(userId).first();
const entryPlace = async id =>
  (await env.LOGBOOK_DB.prepare(`SELECT place_id FROM entries WHERE id = ?`).bind(id).first()).place_id;

describe("renaming (#159)", () => {
  it("renames an area, and refuses a name its location already has", async () => {
    const font = await location("Fontainbleau");
    const cuvier = await place(font.id, "Bas Cuvier");
    await place(font.id, "Apremont");

    const res = await as("PUT", "/-/api/places", { id: cuvier.id, area: "Bas Cuvier Ouest" });
    expect(res.status).toBe(200);
    expect((await res.json()).place).toMatchObject({ id: cuvier.id, area: "Bas Cuvier Ouest" });

    const taken = await as("PUT", "/-/api/places", { id: cuvier.id, area: "apremont" });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toMatchObject({ code: "AREA_TAKEN" });
  });

  it("renames a location and changes its country, and refuses a name already used", async () => {
    const font = await location("Fontainbleau");
    await location("Magic Wood", "Switzerland");

    const res = await as("PUT", "/-/api/locations", { id: font.id, name: "Fontainebleau", country: "France" });
    expect((await res.json()).location).toMatchObject({ name: "Fontainebleau", country: "France" });
    expect((await as("PUT", "/-/api/locations", { id: font.id, name: "magic wood" })).status).toBe(409);
    expect((await as("PUT", "/-/api/locations", { id: font.id, name: "X", country: "Narnia" })).status).toBe(400);
  });

  it("can't rename another user's places", async () => {
    const other = await createAuthedSession();
    const theirs = await location("Theirs", "France", other.cookie);
    const theirArea = await place(theirs.id, "Area", other.cookie);
    expect((await as("PUT", "/-/api/locations", { id: theirs.id, name: "Mine now" })).status).toBe(404);
    expect((await as("PUT", "/-/api/places", { id: theirArea.id, area: "Mine now" })).status).toBe(404);
  });
});

describe("deleting an area (#160)", () => {
  it("needs somewhere to move its climbs, then moves them and deletes it", async () => {
    const font = await location("Fontainebleau");
    const wrong = await place(font.id, "Bas Cuiver");
    const right = await place(font.id, "Bas Cuvier");
    const moved = await climb(wrong.id);

    const refused = await as("DELETE", `/-/api/places?id=${wrong.id}`);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "MOVE_TARGET_REQUIRED" });

    const res = await as("DELETE", `/-/api/places?id=${wrong.id}&moveTo=${right.id}`);
    expect(await res.json()).toEqual({ moved: 1 });
    expect(await entryPlace(moved.id)).toBe(right.id);
    const { places } = await (await as("GET", "/-/api/places")).json();
    expect(places.map(p => p.id)).toEqual([right.id]);
    expect((await usage()).places).toBe(1);
  });

  it("deletes an empty area without a target", async () => {
    const font = await location("Fontainebleau");
    const empty = await place(font.id, "Nowhere");
    expect((await as("DELETE", `/-/api/places?id=${empty.id}`)).status).toBe(200);
  });

  it("won't move climbs into another user's area, or into the area being deleted", async () => {
    const font = await location("Fontainebleau");
    const area = await place(font.id, "Bas Cuvier");
    await climb(area.id);
    const other = await createAuthedSession();
    const theirs = await place((await location("Theirs", "France", other.cookie)).id, "Area", other.cookie);
    expect((await as("DELETE", `/-/api/places?id=${area.id}&moveTo=${theirs.id}`)).status).toBe(400);
    expect((await as("DELETE", `/-/api/places?id=${area.id}&moveTo=${area.id}`)).status).toBe(400);
  });

  it("tells other devices: the area comes back deleted, and the moved climb comes back too", async () => {
    const font = await location("Fontainebleau");
    const wrong = await place(font.id, "Wrong");
    const right = await place(font.id, "Right");
    const moved = await climb(wrong.id);
    const { cursor: placesCursor } = await (await as("GET", "/-/api/places?since=0")).json();
    const { cursor: entriesCursor } = await (await as("GET", "/-/api/entries?since=0")).json();

    await as("DELETE", `/-/api/places?id=${wrong.id}&moveTo=${right.id}`);
    const places = (await (await as("GET", `/-/api/places?since=${placesCursor + 1}`)).json()).places;
    expect(places).toEqual([expect.objectContaining({ id: wrong.id, deleted: true })]);
    const entries = (await (await as("GET", `/-/api/entries?since=${entriesCursor + 1}`)).json()).entries;
    expect(entries).toEqual([expect.objectContaining({ id: moved.id, placeId: right.id })]);
  });

  it("refuses a new climb at a deleted area", async () => {
    const font = await location("Fontainebleau");
    const gone = await place(font.id, "Gone");
    await as("DELETE", `/-/api/places?id=${gone.id}`);
    const res = await as("POST", "/-/api/entries", {
      placeId: gone.id,
      name: "Late",
      type: "boulder",
      status: "send",
      grade: "6A",
    });
    expect(res.status).toBe(400);
  });
});

describe("deleting a location (#160)", () => {
  it("moves the climbs from all its areas to one place elsewhere, then deletes them all", async () => {
    const wrong = await location("Fontainbleau");
    const right = await location("Fontainebleau");
    const target = await place(right.id, "Bas Cuvier");
    const a = await climb((await place(wrong.id, "Bas Cuvier")).id);
    const b = await climb((await place(wrong.id, "Apremont")).id);

    expect((await as("DELETE", `/-/api/locations?id=${wrong.id}`)).status).toBe(400);
    const res = await as("DELETE", `/-/api/locations?id=${wrong.id}&moveTo=${target.id}`);
    expect(await res.json()).toEqual({ moved: 2 });
    expect([await entryPlace(a.id), await entryPlace(b.id)]).toEqual([target.id, target.id]);
    const { locations } = await (await as("GET", "/-/api/locations")).json();
    expect(locations.map(l => l.id)).toEqual([right.id]);
    expect(await usage()).toMatchObject({ locations: 1, places: 1 });
  });

  it("won't move climbs into one of its own areas", async () => {
    const font = await location("Fontainebleau");
    const area = await place(font.id, "Bas Cuvier");
    await climb(area.id);
    expect((await as("DELETE", `/-/api/locations?id=${font.id}&moveTo=${area.id}`)).status).toBe(400);
  });

  it("lets a deleted location's name be used again", async () => {
    const font = await location("Fontainebleau");
    await as("DELETE", `/-/api/locations?id=${font.id}`);
    const again = await as("POST", "/-/api/locations", { name: "Fontainebleau", country: "France" });
    expect(again.status).toBe(201);
    expect((await again.json()).location.id).not.toBe(font.id);
  });
});
