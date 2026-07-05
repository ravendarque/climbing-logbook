// Reachable only via /logbook/api/admin/login, which Cloudflare Access
// gates at the edge. Visiting this path while unauthenticated triggers
// Access's hosted login flow; Access redirects back here once it succeeds,
// and we bounce straight on to the app itself.
export async function handleAdminLogin() {
  return Response.redirect(new URL("/logbook/", "https://ravendarque.com"), 302);
}
