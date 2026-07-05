// Reachable only via /logbook/api/admin/session, which Cloudflare Access
// gates at the edge — by the time this runs, Access has already
// authenticated the caller and attached their identity as a header.
export async function handleAdminSession(request) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  return new Response(JSON.stringify({ loggedIn: true, email }), {
    headers: { "Content-Type": "application/json" },
  });
}
