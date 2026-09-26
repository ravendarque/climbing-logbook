import { ownershipAllowsBoot } from "./ownership-guard.js";
import { enrollmentAllowsBoot } from "./channel-guard.js";

export async function pageAllowsBoot() {
  return (await ownershipAllowsBoot()) && enrollmentAllowsBoot();
}
