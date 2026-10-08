-- Per-account row counts for the published limits (#1045), kept by triggers so a check reads one row.
CREATE TABLE account_usage (
  user_id   TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  entries   INTEGER NOT NULL DEFAULT 0,
  places    INTEGER NOT NULL DEFAULT 0,
  locations INTEGER NOT NULL DEFAULT 0
);

INSERT INTO account_usage (user_id, entries, places, locations)
  SELECT u.id,
         (SELECT count(*) FROM entries WHERE user_id = u.id),
         (SELECT count(*) FROM places WHERE user_id = u.id),
         (SELECT count(*) FROM locations WHERE user_id = u.id)
  FROM "user" u;

CREATE TRIGGER account_usage_entries_insert AFTER INSERT ON entries BEGIN
  INSERT INTO account_usage (user_id, entries) VALUES (NEW.user_id, 1)
    ON CONFLICT(user_id) DO UPDATE SET entries = entries + 1;
END;
CREATE TRIGGER account_usage_entries_delete AFTER DELETE ON entries BEGIN
  UPDATE account_usage SET entries = entries - 1 WHERE user_id = OLD.user_id;
END;
CREATE TRIGGER account_usage_places_insert AFTER INSERT ON places BEGIN
  INSERT INTO account_usage (user_id, places) VALUES (NEW.user_id, 1)
    ON CONFLICT(user_id) DO UPDATE SET places = places + 1;
END;
CREATE TRIGGER account_usage_places_delete AFTER DELETE ON places BEGIN
  UPDATE account_usage SET places = places - 1 WHERE user_id = OLD.user_id;
END;
CREATE TRIGGER account_usage_locations_insert AFTER INSERT ON locations BEGIN
  INSERT INTO account_usage (user_id, locations) VALUES (NEW.user_id, 1)
    ON CONFLICT(user_id) DO UPDATE SET locations = locations + 1;
END;
CREATE TRIGGER account_usage_locations_delete AFTER DELETE ON locations BEGIN
  UPDATE account_usage SET locations = locations - 1 WHERE user_id = OLD.user_id;
END;
