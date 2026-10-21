-- Demo accounts exist to show the service, not to use it, so they're internal too (#1519).
UPDATE settings SET is_internal = 1 WHERE is_demo = 1;

CREATE TRIGGER demo_accounts_internal_on_insert AFTER INSERT ON settings
WHEN NEW.is_demo = 1 AND NEW.is_internal = 0
BEGIN
  UPDATE settings SET is_internal = 1 WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER demo_accounts_internal_on_update AFTER UPDATE OF is_demo, is_internal ON settings
WHEN NEW.is_demo = 1 AND NEW.is_internal = 0
BEGIN
  UPDATE settings SET is_internal = 1 WHERE user_id = NEW.user_id;
END;
