// #997 -- the one decision on whether a username can be registered or
// changed to. server/lib/auth.js's usernameValidator calls it, and Better
// Auth's username plugin runs that on sign-up, update-user and the user
// create/update database hooks, so no path skips it.
//
// Rules, in order:
// 1. Format (#341, #983): lowercase letters, digits, "." and "_", 1-30
//    characters. No hyphen ever, which keeps /-/ and /service-worker.js
//    collision-proof on the app hosts (#982).
// 2. Not a demo account's name (#251).
// 3. Not a reserved name or a lookalike of one (shared/reserved-usernames.js),
//    compared by skeleton (below).
// 4. No part of the name, split on "." and "_", is an authority word
//    (admin_raven, raven.support).
// 5. Doesn't contain the brand anywhere (the_climbinglogbook).
//
// A rejection is reported only as "unavailable" to the person registering
// (static/register/register.js), so the lists can't be probed rule by rule.
import { DEMO_USERNAMES } from "./demo-personas.js";
import { AUTHORITY_TOKENS, BRAND_TERMS, RESERVED_USERNAMES } from "./reserved-usernames.js";

export const USERNAME_MIN_LENGTH = 1;
export const USERNAME_MAX_LENGTH = 30;
const FORMAT = /^[a-z0-9._]+$/;

// Digits people use for letters. "1" reads as either i or l, so it's
// resolved both ways (skeletons() below).
const LEET = { 0: "o", 3: "e", 4: "a", 5: "s", 7: "t" };

// The forms a name can be mistaken for: lowercase, separators dropped,
// leet digits read as letters, and the two classic letter-pair lookalikes
// (rn reads as m, vv as w). Two names with a skeleton in common look alike.
export function skeletons(name) {
  const base = name
    .toLowerCase()
    .replace(/[._]/g, "")
    .replace(/[03457]/g, digit => LEET[digit])
    .replace(/rn/g, "m")
    .replace(/vv/g, "w");
  return base.includes("1") ? [base.replace(/1/g, "i"), base.replace(/1/g, "l")] : [base];
}

const skeletonSet = names => new Set(names.flatMap(skeletons));
const RESERVED = skeletonSet(RESERVED_USERNAMES);
const AUTHORITY = skeletonSet(AUTHORITY_TOKENS);
const BRAND = BRAND_TERMS.flatMap(skeletons);

// { ok: true } or { ok: false, reason } -- reason is for tests and
// scripts/audit-usernames.mjs, never shown to the person registering.
export function checkUsername(candidate) {
  if (typeof candidate !== "string" || !FORMAT.test(candidate)
    || candidate.length < USERNAME_MIN_LENGTH || candidate.length > USERNAME_MAX_LENGTH) {
    return { ok: false, reason: "format" };
  }
  if (DEMO_USERNAMES.includes(candidate)) return { ok: false, reason: "demo" };
  const forms = skeletons(candidate);
  if (forms.some(form => RESERVED.has(form))) return { ok: false, reason: "reserved" };
  const parts = candidate.split(/[._]/).filter(Boolean);
  if (parts.some(part => skeletons(part).some(form => AUTHORITY.has(form)))) return { ok: false, reason: "authority" };
  if (forms.some(form => BRAND.some(brand => form.includes(brand)))) return { ok: false, reason: "brand" };
  return { ok: true };
}
