// beta_invites' references to a user don't cascade, so they're cleared before the user goes.
export function releaseInvites(env, userId) {
  return [
    env.LOGBOOK_DB.prepare(`UPDATE beta_invites SET used_by = NULL WHERE used_by = ?`).bind(userId),
    env.LOGBOOK_DB.prepare(`UPDATE beta_invites SET created_by = NULL WHERE created_by = ?`).bind(userId),
  ];
}
