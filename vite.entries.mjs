// #761/#774 -- the one shared list of client entry points, imported by
// both vite.config.js (dev server + devEntryRewrite, #775) and
// vite.deploy.config.js (the real production/preview/beta build). Kept
// in its own file rather than duplicated across the two configs --
// exactly the "one list, not two copies that silently drift" lesson
// this project already learned the hard way (#391/#224, and again when
// scripts/dev.mjs's own hand-copied watch list turned out to be missing
// beta-gate entirely).
export const CLIENT_ENTRIES = {
  log: "client/log-main.js",
  map: "client/map-main.js",
  "performance-hub": "client/performance-hub-main.js",
  "performance-pyramid": "client/performance-pyramid-main.js",
  "performance-trends": "client/performance-trends-main.js",
  "performance-gap": "client/performance-gap-main.js",
  "performance-rpe": "client/performance-rpe-main.js",
  "performance-injury": "client/performance-injury-main.js",
  "performance-strengths": "client/performance-strengths-main.js",
  profile: "client/profile-main.js",
  account: "client/account-main.js",
  "account-edit": "client/account-edit-main.js",
  "account-import": "client/account-import-main.js",
  sync: "client/sync-main.js",
  "beta-gate": "client/beta-gate-main.js",
  help: "client/help-main.js",
};
