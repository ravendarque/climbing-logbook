-- #924 -- public "Report an issue" form storage.
--
-- user_id ON DELETE SET NULL, not CASCADE: a report is still useful
-- context (the bug it describes doesn't stop existing) even if the
-- reporting account is later deleted -- #922's own account-deletion work
-- shouldn't silently destroy report history as a side effect.
CREATE TABLE issue_reports (
  id            TEXT PRIMARY KEY,
  message       TEXT NOT NULL,
  contact_email TEXT,
  user_id       TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  -- Silently captured from document.referrer at submit time (server/api/
  -- report-issue.js), not user-entered -- which page the report link was
  -- clicked from.
  source_page   TEXT,
  -- Optional, user-picked from a fixed dropdown (server/api/
  -- report-issue.js's own SECTIONS list) -- a manual supplement for when
  -- source_page is generic (e.g. clicked from the footer, present on
  -- every page) or the user wants to point at a different part of the
  -- app than where they happened to click from.
  section       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Generic, reusable D1-backed rate limiter for any public, unauthenticated
-- write endpoint that never goes through Better Auth's own request
-- pipeline -- #889's own rate limiting (migrations/0017) is entirely
-- Better Auth's internal feature (rateLimit: { storage: "database" },
-- its own private "rateLimit" table, keyed and managed by that library
-- itself), not a reusable module; endpoints outside Better Auth's
-- pipeline get none of it for free. This is new, and deliberately not
-- report-issue-specific -- #925's "Tell us what you think" form reuses
-- this same table with its own key prefix ("feedback:<ip>" vs.
-- "report-issue:<ip>"), not a second copy.
--
-- Fixed window (not sliding), server/lib/rate-limit.js's own choice --
-- simple, and more than adequate for "block obvious spam," not a
-- precision-critical limit. window_start is epoch ms, matching
-- entries.sync_cursor's own existing "store time as an integer ms epoch"
-- convention rather than inventing a second time representation.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
