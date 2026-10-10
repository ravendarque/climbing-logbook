// Prints a new beta invite code, the command that stores it, and the link to send: node scripts/mint-invite.mjs [--email <address>]
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

// 128 random bits as lowercase base32, so a code can't be guessed (#1073).
export function mintInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bits = 0;
  let value = 0;
  let code = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      code += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) code += ALPHABET[(value << (5 - bits)) & 31];
  return code;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--email");
  const email = i === -1 ? null : process.argv[i + 1]?.toLowerCase();
  if (email !== null && !/^[^\s'@]+@[^\s'@]+\.[^\s'@]+$/.test(email ?? "")) {
    console.error("Usage: node scripts/mint-invite.mjs [--email <address>]");
    process.exit(1);
  }
  const code = mintInviteCode();
  const values = email ? `('${code}', '${email}')` : `('${code}')`;
  const columns = email ? "(code, email)" : "(code)";
  console.log(`Code: ${code}`);
  console.log(
    `Store it: pnpm exec wrangler d1 execute climbing-logbook --remote --command "INSERT INTO beta_invites ${columns} VALUES ${values}"`,
  );
  console.log(`Send: https://climbinglogbook.com/register/?code=${code}`);
}
