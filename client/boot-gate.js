// #952/#960 -- the checks every owner page runs before its own boot():
// first that the page belongs to the signed-in user (ownership-guard.js),
// then, on the beta host, that they're enrolled (channel-guard.js, whose
// cached settings are that user's). Resolves true when boot() should run.
import { ownershipAllowsBoot } from "./ownership-guard.js";
import { enrollmentAllowsBoot } from "./channel-guard.js";

export async function pageAllowsBoot() {
  return (await ownershipAllowsBoot()) && enrollmentAllowsBoot();
}
