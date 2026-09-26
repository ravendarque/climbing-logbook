// Owner routes only resolve on my.localhost; bare localhost 404s with no hint why.
const PORT = 8787;

export function ownedRouteUrl(username, path) {
  return `http://my.localhost:${PORT}/${username}${path}`;
}

// The global session cookie is scoped to localhost, which my.localhost doesn't get.
export async function addOwnedRouteSessionCookie(context) {
  const [cookie] = await context.cookies("http://localhost:8787");
  await context.addCookies([{ ...cookie, domain: "my.localhost" }]);
}
