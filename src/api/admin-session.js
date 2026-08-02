import { json } from "../lib/json.js";

// Reachable only via /logbook/api/admin/session, which Cloudflare Access
// gates at the edge — by the time this runs, Access has already
// authenticated the caller and attached their identity as a header.
export async function handleAdminSession(request) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  return json({ loggedIn: true, email }, 200, { "Cache-Control": "no-store" });
}
