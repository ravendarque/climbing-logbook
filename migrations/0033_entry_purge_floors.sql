-- The newest sync cursor among each user's purged tombstones: a device that last synced before it must re-sync in full (#1051).
CREATE TABLE entry_purge_floors (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  cursor  INTEGER NOT NULL
);
