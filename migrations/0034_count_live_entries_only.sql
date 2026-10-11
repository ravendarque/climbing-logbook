-- Deleted climbs are soft-deleted tombstones, so the limit counts live rows only (#1345).
-- destructive-migration: the triggers are replaced in the same migration, and no code reads them
DROP TRIGGER account_usage_entries_insert;
DROP TRIGGER account_usage_entries_delete;

CREATE TRIGGER account_usage_entries_insert AFTER INSERT ON entries WHEN NEW.deleted_at IS NULL BEGIN
  INSERT INTO account_usage (user_id, entries) VALUES (NEW.user_id, 1)
    ON CONFLICT(user_id) DO UPDATE SET entries = entries + 1;
END;
CREATE TRIGGER account_usage_entries_delete AFTER DELETE ON entries WHEN OLD.deleted_at IS NULL BEGIN
  UPDATE account_usage SET entries = entries - 1 WHERE user_id = OLD.user_id;
END;
CREATE TRIGGER account_usage_entries_soft_delete AFTER UPDATE OF deleted_at ON entries
  WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
  UPDATE account_usage SET entries = entries - 1 WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER account_usage_entries_resurrect AFTER UPDATE OF deleted_at ON entries
  WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL BEGIN
  UPDATE account_usage SET entries = entries + 1 WHERE user_id = NEW.user_id;
END;

UPDATE account_usage
  SET entries = (SELECT count(*) FROM entries WHERE user_id = account_usage.user_id AND deleted_at IS NULL);
