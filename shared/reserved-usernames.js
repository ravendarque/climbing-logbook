// #997 -- names nobody can register, because they'd pass for part of the
// site or for an official account. shared/username-policy.js also rejects
// lookalikes of every name here (he1p, log_in, 0fficial), so list each
// word once, in plain form. To add one: a PR with a test in
// test/username-policy.test.js, then run scripts/audit-usernames.mjs to
// see whether any existing account already has it.

// Top-level pages on the apex. On my.<domain>, /:username is a profile
// URL, so a user called "help" would own a page that looks like the
// site's own /help (#985). Names with a hyphen (reset-password) can't be
// usernames anyway.
const APEX_PAGES = [
  "help", "login", "logout", "register", "signin", "signout", "signup",
  "resetpassword",
];

// The app's hosts, infrastructure and service names.
const APP_AND_INFRA = [
  "api", "app", "apps", "www", "my", "beta", "dev", "staging", "prod", "production",
  "test", "static", "assets", "cdn", "mail", "email", "smtp", "noreply",
  "postmaster", "hostmaster", "webmaster", "abuse", "status", "health",
  "docs", "blog", "news", "about", "contact", "terms", "privacy", "legal",
  "cookies", "settings", "account", "accounts", "dashboard", "launch", "sync",
  "feedback", "report", "search", "explore", "home", "index", "info",
  "root", "system", "sysadmin", "null", "undefined", "anonymous", "guest",
  "user", "users", "everyone", "me",
];

// Names that read as the site speaking. The ones in AUTHORITY_TOKENS below
// are also rejected as one part of a longer name (admin_raven).
const OFFICIAL = [
  "admin", "administrator", "moderator", "mod", "mods", "staff", "team",
  "official", "support", "helpdesk", "security", "trust", "safety", "owner",
  "founder",
];

// The brand. Any name containing "climbinglogbook" is rejected too
// (username-policy.js's BRAND_TERMS).
const BRAND = ["climbinglogbook", "logbook", "climbing", "logbookbeta"];

export const RESERVED_USERNAMES = [...APEX_PAGES, ...APP_AND_INFRA, ...OFFICIAL, ...BRAND];

// Rejected as any one part of a name split on "." and "_" (admin_raven,
// raven.support), not as a substring, so badmintonfan and supportertom
// still pass. Kept to words that are unambiguous as a part of a name.
export const AUTHORITY_TOKENS = [
  "admin", "administrator", "moderator", "mod", "staff", "official", "support",
  "helpdesk", "security",
];

// Rejected anywhere in a name, separators and lookalikes included
// (the_climbing.logbook, cl1mbinglogbookfan).
export const BRAND_TERMS = ["climbinglogbook"];
