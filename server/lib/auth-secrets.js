import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

const BATCH = 200;

// BETTER_AUTH_SECRETS is "<version>:<secret>,…", newest first; BETTER_AUTH_SECRET still reads values made before it.
export function parseAuthSecrets(value) {
  if (!value) return undefined;
  return value.split(",").map(entry => {
    const separator = entry.indexOf(":");
    const version = Number(entry.slice(0, separator).trim());
    const secret = entry.slice(separator + 1).trim();
    if (separator === -1 || !Number.isInteger(version) || version < 0 || !secret) {
      throw new Error('BETTER_AUTH_SECRETS must be "<version>:<secret>" entries separated by commas');
    }
    return { version, value: secret };
  });
}

export function authSecretOptions(env) {
  const secrets = parseAuthSecrets(env.BETTER_AUTH_SECRETS);
  return secrets ? { secret: env.BETTER_AUTH_SECRET, secrets } : { secret: env.BETTER_AUTH_SECRET };
}

function secretConfig(env) {
  const secrets = parseAuthSecrets(env.BETTER_AUTH_SECRETS);
  if (!secrets) return null;
  return {
    keys: new Map(secrets.map(({ version, value }) => [version, value])),
    currentVersion: secrets[0].version,
    legacySecret: env.BETTER_AUTH_SECRET || undefined,
  };
}

// After a rotation, puts every two-step setup key and backup code list under the newest secret, so the old one can go.
export async function reencryptTwoStepData(env) {
  const key = secretConfig(env);
  if (!key) return { count: 0, failed: 0 };
  const current = `$ba$${key.currentVersion}$%`;
  const { results } = await env.LOGBOOK_DB.prepare(
    `SELECT id, secret, "backupCodes" FROM "twoFactor" WHERE secret NOT LIKE ? OR "backupCodes" NOT LIKE ? LIMIT ${BATCH}`,
  )
    .bind(current, current)
    .all();
  const again = async data => symmetricEncrypt({ key, data: await symmetricDecrypt({ key, data }) });
  const updates = [];
  let failed = 0;
  for (const row of results) {
    try {
      updates.push(
        env.LOGBOOK_DB.prepare(`UPDATE "twoFactor" SET secret = ?, "backupCodes" = ? WHERE id = ?`).bind(
          await again(row.secret),
          await again(row.backupCodes),
          row.id,
        ),
      );
    } catch {
      failed++;
    }
  }
  if (updates.length) await env.LOGBOOK_DB.batch(updates);
  return { count: updates.length, failed };
}
