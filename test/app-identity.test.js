// #956 -- Logbook Beta's own PWA identity (server/api/app-identity.js):
// the same manifest and apple-touch-icon URLs serve different files on
// beta.<domain>, through the real Worker entrypoint with an explicit host.
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const get = (host, path, init) => exports.default.fetch(`https://${host}${path}`, init);

describe("per-host app identity (#956)", () => {
  it("serves the main app's manifest on my.<domain> and the apex, and Logbook Beta's on beta.<domain>", async () => {
    const prod = await (await get("my.climbinglogbook.com", "/logbook/manifest.json")).json();
    const apex = await (await get("climbinglogbook.com", "/logbook/manifest.json")).json();
    const beta = await (await get("beta.climbinglogbook.com", "/logbook/manifest.json")).json();

    expect(prod.name).toBe("Climbing Logbook");
    expect(apex).toEqual(prod);
    expect(beta).toMatchObject({ name: "Climbing Logbook Beta", short_name: "Logbook Beta", start_url: "/launch/", scope: "/" });
    expect(beta.theme_color).not.toBe(prod.theme_color);
    expect(beta.icons.map(icon => icon.src)).toEqual(expect.arrayContaining(["/logbook/beta/icon-512.png", "/logbook/beta/icon-maskable-512.png"]));
    // Nobody's logbook in either (#949).
    for (const manifest of [prod, beta]) expect(JSON.stringify(manifest)).not.toMatch(/devuser|raven/i);
  });

  it("every icon the beta manifest names is a real file", async () => {
    const beta = await (await get("beta.climbinglogbook.com", "/logbook/manifest.json")).json();
    // (Plain static files are served before the Worker runs, so ask the
    // asset binding directly.)
    for (const { src } of beta.icons) {
      const res = await env.ASSETS.fetch(`https://assets.local${src}`);
      expect(res.status, src).toBe(200);
    }
  });

  it("serves Logbook Beta's apple-touch-icon on beta.<domain> only", async () => {
    const bytes = async host => new Uint8Array(await (await get(host, "/logbook/apple-touch-icon.png")).arrayBuffer());
    const prod = await bytes("my.climbinglogbook.com");
    const beta = await bytes("beta.climbinglogbook.com");
    const betaFile = new Uint8Array(await (await env.ASSETS.fetch("https://assets.local/logbook/beta/apple-touch-icon.png")).arrayBuffer());
    expect(beta).toEqual(betaFile);
    expect(prod).not.toEqual(beta);
  });

  it("answers conditional requests like any static file", async () => {
    const first = await get("beta.climbinglogbook.com", "/logbook/manifest.json");
    const etag = first.headers.get("ETag");
    expect(etag).toBeTruthy();
    const again = await get("beta.climbinglogbook.com", "/logbook/manifest.json", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);
  });
});
