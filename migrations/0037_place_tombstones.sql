-- Locations and areas can be deleted (#159, #160): a deleted one stays as a sync tombstone so other devices drop it.
-- destructive-migration: the name and area indexes and the usage triggers are replaced in the same migration
ALTER TABLE locations ADD COLUMN deleted_at INTEGER;
ALTER TABLE places ADD COLUMN deleted_at INTEGER;

DROP INDEX idx_locations_user_name;
DROP INDEX idx_places_user_location_area;
CREATE UNIQUE INDEX idx_locations_user_name ON locations(user_id, LOWER(name)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_places_user_location_area ON places(user_id, location_id, LOWER(area)) WHERE deleted_at IS NULL;

DROP TRIGGER account_usage_places_delete;
DROP TRIGGER account_usage_locations_delete;
CREATE TRIGGER account_usage_places_delete AFTER DELETE ON places WHEN OLD.deleted_at IS NULL BEGIN
  UPDATE account_usage SET places = places - 1 WHERE user_id = OLD.user_id;
END;
CREATE TRIGGER account_usage_locations_delete AFTER DELETE ON locations WHEN OLD.deleted_at IS NULL BEGIN
  UPDATE account_usage SET locations = locations - 1 WHERE user_id = OLD.user_id;
END;
CREATE TRIGGER account_usage_places_soft_delete AFTER UPDATE OF deleted_at ON places
  WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
  UPDATE account_usage SET places = places - 1 WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER account_usage_places_resurrect AFTER UPDATE OF deleted_at ON places
  WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL BEGIN
  UPDATE account_usage SET places = places + 1 WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER account_usage_locations_soft_delete AFTER UPDATE OF deleted_at ON locations
  WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
  UPDATE account_usage SET locations = locations - 1 WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER account_usage_locations_resurrect AFTER UPDATE OF deleted_at ON locations
  WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL BEGIN
  UPDATE account_usage SET locations = locations + 1 WHERE user_id = NEW.user_id;
END;
