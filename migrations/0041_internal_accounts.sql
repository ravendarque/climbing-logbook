-- An account that exists to run the service, such as the synthetic monitor, not someone using it (#1514).
ALTER TABLE settings ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0;
