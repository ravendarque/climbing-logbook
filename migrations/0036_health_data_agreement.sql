-- Demo personas are fictional, so they move straight to the Health Data Agreement (#1408).
UPDATE consents SET wording_version = '2026-10-14'
  WHERE purpose = 'pain_injury' AND superseded_at IS NULL AND withdrawn_at IS NULL
    AND user_id IN (SELECT user_id FROM settings WHERE is_demo = 1);
