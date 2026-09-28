CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_user_name ON locations(user_id, LOWER(name));
CREATE UNIQUE INDEX IF NOT EXISTS idx_places_user_location_area ON places(user_id, location_id, LOWER(area));

CREATE TRIGGER IF NOT EXISTS places_insert_same_user_as_location BEFORE INSERT ON places
WHEN NEW.user_id IS NOT (SELECT user_id FROM locations WHERE id = NEW.location_id)
BEGIN
  SELECT RAISE(ABORT, 'A place must belong to the same user as its location');
END;

CREATE TRIGGER IF NOT EXISTS places_update_same_user_as_location BEFORE UPDATE OF user_id, location_id ON places
WHEN NEW.user_id IS NOT (SELECT user_id FROM locations WHERE id = NEW.location_id)
BEGIN
  SELECT RAISE(ABORT, 'A place must belong to the same user as its location');
END;

CREATE TRIGGER IF NOT EXISTS entries_insert_same_user_as_place BEFORE INSERT ON entries
WHEN NEW.user_id IS NOT (SELECT user_id FROM places WHERE id = NEW.place_id)
BEGIN
  SELECT RAISE(ABORT, 'An entry must belong to the same user as its place');
END;

CREATE TRIGGER IF NOT EXISTS entries_update_same_user_as_place BEFORE UPDATE OF user_id, place_id ON entries
WHEN NEW.user_id IS NOT (SELECT user_id FROM places WHERE id = NEW.place_id)
BEGIN
  SELECT RAISE(ABORT, 'An entry must belong to the same user as its place');
END;
