// Signs in on the apex and checks the session cookie really reaches my., matching Domain like a browser.
// Needs SYNTHETIC_USER_EMAIL and SYNTHETIC_USER_PASSWORD (infra/README.md). Read-only.
// APEX_URL/APP_URL override the hosts; locally the cookie is host-only, so the check rightly refuses it.
//   node scripts/synthetic-check.mjs

const APEX = process.env.APEX_URL || "https://climbinglogbook.com";
const APP = process.env.APP_URL || "https://my.climbinglogbook.com";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

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

// RFC 6265 §5.1.3 domain matching, as a browser does it.
function cookieAppliesTo(cookieDomain, requestHostname) {
  if (!cookieDomain) return false;
  const normalized = cookieDomain.replace(/^\./, "");
  return requestHostname === normalized || requestHostname.endsWith(`.${normalized}`);
}

async function main() {
  const email = requireEnv("SYNTHETIC_USER_EMAIL");
  const password = requireEnv("SYNTHETIC_USER_PASSWORD");

  console.log(`Signing in via ${APEX}/-/api/auth/sign-in/email ...`);
  const signInRes = await fetch(`${APEX}/-/api/auth/sign-in/email`, {
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

  console.log(`Reusing cookie against ${APP}/-/api/auth/get-session ...`);
  const sessionRes = await fetch(`${APP}/-/api/auth/get-session`, {
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

  console.log(`Checking read-only data endpoint ${APP}/-/api/entries ...`);
  const dataRes = await fetch(`${APP}/-/api/entries`, {
    headers: { Cookie: pair },
  });
  if (!dataRes.ok) {
    throw new Error(`GET /-/api/entries failed: ${dataRes.status} ${await dataRes.text()}`);
  }

  console.log("Synthetic check passed: session shares correctly across climbinglogbook.com -> my.climbinglogbook.com.");
}

main().catch(err => {
  console.error(`Synthetic check FAILED: ${err.message}`);
  process.exitCode = 1;
});
