ALTER TABLE settings ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT 0 CHECK (onboarding_completed IN (0,1));
UPDATE settings SET onboarding_completed = 1;
