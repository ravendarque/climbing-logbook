// username-policy.js also rejects lookalikes, so each word is listed once, plainly.

// On my., /:username is a profile URL, so these would look like the site's own pages.
const APEX_PAGES = [
  "help", "login", "logout", "register", "signin", "signout", "signup",
  "resetpassword",
];

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

const OFFICIAL = [
  "admin", "administrator", "moderator", "mod", "mods", "staff", "team",
  "official", "support", "helpdesk", "security", "trust", "safety", "owner",
  "founder",
];

const BRAND = ["climbinglogbook", "logbook", "climbing", "logbookbeta"];

export const RESERVED_USERNAMES = [...APEX_PAGES, ...APP_AND_INFRA, ...OFFICIAL, ...BRAND];

// Matched as a whole part split on . and _, not a substring, so badmintonfan passes.
export const AUTHORITY_TOKENS = [
  "admin", "administrator", "moderator", "mod", "staff", "official", "support",
  "helpdesk", "security",
];

export const BRAND_TERMS = ["climbinglogbook"];
