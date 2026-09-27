// infra.yml rewrites REAL_SITEKEY from Terraform's output after an apply.
const REAL_SITEKEY = "0x4AAAAAAEH3RghUN6KSc-uy";
// Cloudflare's always-passes test key, for hosts the real widget isn't registered on.
const TEST_SITEKEY = "1x00000000000000000000AA";
const REAL_SITEKEY_HOSTNAMES = ["climbinglogbook.com", "beta.climbinglogbook.com"];

export function turnstileSitekey(hostname) {
  return REAL_SITEKEY_HOSTNAMES.includes(hostname) ? REAL_SITEKEY : TEST_SITEKEY;
}
