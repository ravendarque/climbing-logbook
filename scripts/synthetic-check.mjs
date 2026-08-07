/**
 * Synthetic production check (#361): catches the exact class of bug that
 * shipped undetected in #354 -- a session cookie the server issues that a
 * real browser would never actually send cross-subdomain, because its
 * Domain attribute doesn't match the requesting hostname. A script that
 * just blindly re-sends whatever cookie sign-in returned would pass even
 * when a real user's browser wouldn't -- this replicates the browser's
 * own Domain-matching instead of trusting the raw header.
 *
 * Narrowly scoped to climbinglogbook.com/my.climbinglogbook.com session
 * sharing, not general app testing -- the Playwright E2E suite already
 * covers that, but only ever against PR previews on a single origin
 * (ADR-0011), which is exactly why this class of bug got through.
 *
 * Requires SYNTHETIC_USER_EMAIL / SYNTHETIC_USER_PASSWORD in the
 * environment -- a dedicated account (logbook_public: false) created
 * once by hand, see infra/README.md's "Synthetic monitoring account"
 * section. Never written to by this script (no entries/places/locations
 * are ever created), read-only against production.
 *
 * Usage: node scripts/synthetic-check.mjs
 *
 * APEX_URL/APP_URL env vars override the production defaults below --
 * same escape hatch scripts/migrate-kv-to-d1.mjs uses for its own
 * production defaults, here letting this script's request/response
 * plumbing be exercised against a local `wrangler dev` before ever
 * running it for real. Locally both resolve to the same single origin
 * (no real subdomain split), so Better Auth issues a host-only cookie
 * with no Domain attribute at all -- the Domain-matching check below
 * will correctly refuse to reuse it, which is the check doing its job,
 * not a bug.
 */

const APEX = process.env.APEX_URL || "https://climbinglogbook.com";
const APP = process.env.APP_URL || "https://my.climbinglogbook.com";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Parses one Set-Cookie header down to the name=value pair and its
// Domain attribute -- same attribute-parsing shape as
// scripts/lib/dev-session.mjs's toPlaywrightCookie(), narrowed to just
// what this check needs.
function parseSetCookie(setCookieHeader) {
  const [pair, ...attrs] = setCookieHeader.split(";").map(s => s.trim());
  const attrMap = Object.fromEntries(
    attrs.map(attr => {
      const eq = attr.indexOf("=");
      return eq === -1 ? [attr.toLowerCase(), true] : [attr.slice(0, eq).toLowerCase(), attr.slice(eq + 1)];
    })
  );
  return { pair, domain: attrMap.domain };
}

// Real Domain-attribute matching (RFC 6265 §5.1.3): a cookie scoped to
// example.com is sent to example.com and any subdomain of it, never to
// an unrelated host, and never at all if the cookie has no Domain
// attribute (host-only, single-origin only). This is the actual browser
// behavior #354's bug depended on nothing checking -- the manual check
// that missed it just glanced at the app and moved on.
function cookieAppliesTo(cookieDomain, requestHostname) {
  if (!cookieDomain) return false;
  const normalized = cookieDomain.replace(/^\./, "");
  return requestHostname === normalized || requestHostname.endsWith(`.${normalized}`);
}

async function main() {
  const email = requireEnv("SYNTHETIC_USER_EMAIL");
  const password = requireEnv("SYNTHETIC_USER_PASSWORD");

  console.log(`Signing in via ${APEX}/logbook/api/auth/sign-in/email ...`);
  const signInRes = await fetch(`${APEX}/logbook/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: APEX },
    body: JSON.stringify({ email, password }),
  });
  if (!signInRes.ok) {
    throw new Error(`Sign-in failed: ${signInRes.status} ${await signInRes.text()}`);
  }
  const setCookieHeader = signInRes.headers.get("set-cookie");
  if (!setCookieHeader) throw new Error("Sign-in succeeded but returned no Set-Cookie header.");

  const { pair, domain } = parseSetCookie(setCookieHeader);
  console.log(`Got session cookie scoped to Domain=${domain ?? "(host-only, no Domain attribute)"}`);

  const appHostname = new URL(APP).hostname;
  if (!cookieAppliesTo(domain, appHostname)) {
    throw new Error(
      `Session cookie's Domain attribute (${domain}) would NOT be sent by a real browser to ${appHostname} -- this is exactly the #354 bug class. Refusing to reuse it.`
    );
  }

  console.log(`Reusing cookie against ${APP}/logbook/api/auth/get-session ...`);
  const sessionRes = await fetch(`${APP}/logbook/api/auth/get-session`, {
    headers: { Cookie: pair },
  });
  if (!sessionRes.ok) {
    throw new Error(`get-session failed: ${sessionRes.status} ${await sessionRes.text()}`);
  }
  const session = await sessionRes.json();
  if (!session?.user) {
    throw new Error(`get-session returned no user -- the session did not resolve across the domain split. Body: ${JSON.stringify(session)}`);
  }
  console.log(`Session resolved for ${session.user.email} on ${appHostname}.`);

  console.log(`Checking read-only data endpoint ${APP}/logbook/api/logbook ...`);
  const dataRes = await fetch(`${APP}/logbook/api/logbook`, {
    headers: { Cookie: pair },
  });
  if (!dataRes.ok) {
    throw new Error(`GET /logbook/api/logbook failed: ${dataRes.status} ${await dataRes.text()}`);
  }

  console.log("Synthetic check passed: session shares correctly across climbinglogbook.com -> my.climbinglogbook.com.");
}

main().catch(err => {
  console.error(`Synthetic check FAILED: ${err.message}`);
  process.exitCode = 1;
});
