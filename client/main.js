// Bundled by esbuild into public/logbook/app.js (#206) -- this file used to
// be inline in index.html's <script type="module">. Moved verbatim as step
// one of the modularization; the pure-logic extractions (grade data, offline
// queue, etc.) happen incrementally from here in follow-up work, each with
// its own Vitest coverage.
//
// status-icons.js/escape-html.js/floating-ui-dom.js stay external (see the
// --external flags on the client:build/client:watch scripts in
// package.json) -- they're unchanged, already-vendored/precached files
// served directly from public/logbook/, not part of this bundle.
import { STATUS_ICONS } from "./status-icons.js";
import { escapeHtml } from "./escape-html.js";
import { computePosition, autoUpdate, offset, flip, shift } from "./floating-ui-dom.js";
import { gradeRank, gradeColor, BOULDER_GRADES, LEAD_GRADES } from "./grade-data.js";
import { formatDate, dateRank } from "./date-helpers.js";
import { flashLabel, sendLabel, nameLabel, statusBadge } from "./status.js";
import { applyPendingQueue } from "./offline-queue.js";
import { createStore } from "./store.js";
import { createLogbookView } from "./logbook-view.js";
import {
  PYRAMID_IDEAL_BY_POSITION,
  pyramidSplitRows as pyramidSplitRowsPure,
} from "./pyramid-stats.js";
import {
  MAP_WIDTH,
  MAP_MIN_W,
  MAP_VIEW_EPS,
  mapViewportAspect as mapViewportAspectPure,
  mapMaxW as mapMaxWPure,
  defaultMapView as defaultMapViewPure,
  clampMapView as clampMapViewPure,
  panView,
  computeZoomedView,
  mapClientDeltaToUserSpace as mapClientDeltaToUserSpacePure,
  mapClientPointToUserSpace as mapClientPointToUserSpacePure,
} from "./map-geometry.js";

  // ── Config ───────────────────────────────────────────────────────────
  const DATA_URL = "/logbook/api/logbook";
  const ADMIN_DATA_URL = "/logbook/api/admin/logbook";
  const PLACES_URL = "/logbook/api/places";
  const ADMIN_PLACES_URL = "/logbook/api/admin/places";
  const LOCATIONS_URL = "/logbook/api/locations";
  const ADMIN_LOCATIONS_URL = "/logbook/api/admin/locations";
  const ADMIN_SESSION_URL = "/logbook/api/admin/session";
  const ADMIN_LOGIN_URL = "/logbook/api/admin/login";
  const SETTINGS_URL = "/logbook/api/settings";
  const ADMIN_SETTINGS_URL = "/logbook/api/admin/settings";
  const ACCESS_LOGOUT_URL = "https://ravendarque.com/cdn-cgi/access/logout";
  const LOGIN_HINT_KEY    = "logbook_logged_in_hint";
  const QUEUE_KEY         = "logbook_pending_queue";

  // Cloudflare Access gates every /logbook/api/admin/* route at the edge --
  // an unauthenticated request never reaches this app's own Worker code at
  // all (see src/index.js). Instead Access responds with a redirect to its
  // own hosted login page on a *different* origin (<team>.cloudflareaccess.com).
  // A normal fetch() tries to follow that redirect and gets blocked by CORS
  // (Access's login domain doesn't grant this origin access), which throws
  // a generic network error -- indistinguishable from actually being
  // offline. redirect: "manual" stops fetch from following it at all: the
  // response comes back as an opaque, unreadable "opaqueredirect" instead
  // of throwing, which is how every admin-authenticated fetch below tells
  // "the Access session expired" apart from "genuinely offline".
  function adminFetch(url, options) {
    return fetch(url, { ...options, redirect: "manual" });
  }
  function isAuthRedirect(res) {
    return res.type === "opaqueredirect";
  }

  // ── Country dataset (#153) ────────────────────────────────────────────
  // Canonical world country list -- flag + geographic-center coordinates.
  // Bundled inline per the Connectivity Resilience standard
  // (docs/coding-standards.md): small, static, rarely-changing, so it
  // belongs in the shipped app rather than a fetch-on-open. Regenerate
  // via `node scripts/generate-countries.mjs` if country metadata
  // changes.
  //
  // Deliberate exclusions/inclusions, not incidental omissions: Israel,
  // Russia, and Belarus are excluded -- all three currently excluded from
  // world climbing events over international law/human rights violations
  // (Russia/Belarus: invasion of Ukraine; Israel: occupation). Palestine
  // is included (present in the source data as a non-UN-member state --
  // no override needed to keep it in). Replaces the old PLACE_COUNTRY
  // (place name -> flag+country string) lookup,
  // which silently had no entry for any place nobody remembered to add by
  // hand -- a real country list only ever has "United Kingdom" as an
  // entry, not England/Wales/Scotland as if they were separate countries,
  // which resolves that old edge case for free rather than needing
  // special-casing.
  //
  // Each country's map-projected {x, y} pin position is NOT here -- it
  // varies per Equal Earth projection variant (#169: Greenwich/Americas/
  // Oceania), so it lives in the per-variant world-map-<variant>.json
  // files fetched on demand by the Map tab instead (see the "World map"
  // section below), joined against this list by country name at render
  // time for flag/label.
  const COUNTRIES = [
    { name: "Afghanistan", flag: "🇦🇫", lat: 33, lng: 65 },
    { name: "Åland Islands", flag: "🇦🇽", lat: 60.12, lng: 19.9 },
    { name: "Albania", flag: "🇦🇱", lat: 41, lng: 20 },
    { name: "Algeria", flag: "🇩🇿", lat: 28, lng: 3 },
    { name: "American Samoa", flag: "🇦🇸", lat: -14.33, lng: -170 },
    { name: "Andorra", flag: "🇦🇩", lat: 42.5, lng: 1.5 },
    { name: "Angola", flag: "🇦🇴", lat: -12.5, lng: 18.5 },
    { name: "Anguilla", flag: "🇦🇮", lat: 18.25, lng: -63.17 },
    { name: "Antarctica", flag: "🇦🇶", lat: -90, lng: 0 },
    { name: "Antigua and Barbuda", flag: "🇦🇬", lat: 17.05, lng: -61.8 },
    { name: "Argentina", flag: "🇦🇷", lat: -34, lng: -64 },
    { name: "Armenia", flag: "🇦🇲", lat: 40, lng: 45 },
    { name: "Aruba", flag: "🇦🇼", lat: 12.5, lng: -69.97 },
    { name: "Australia", flag: "🇦🇺", lat: -27, lng: 133 },
    { name: "Austria", flag: "🇦🇹", lat: 47.33, lng: 13.33 },
    { name: "Azerbaijan", flag: "🇦🇿", lat: 40.5, lng: 47.5 },
    { name: "Bahamas", flag: "🇧🇸", lat: 24.25, lng: -76 },
    { name: "Bahrain", flag: "🇧🇭", lat: 26, lng: 50.55 },
    { name: "Bangladesh", flag: "🇧🇩", lat: 24, lng: 90 },
    { name: "Barbados", flag: "🇧🇧", lat: 13.17, lng: -59.53 },
    { name: "Belgium", flag: "🇧🇪", lat: 50.83, lng: 4 },
    { name: "Belize", flag: "🇧🇿", lat: 17.25, lng: -88.75 },
    { name: "Benin", flag: "🇧🇯", lat: 9.5, lng: 2.25 },
    { name: "Bermuda", flag: "🇧🇲", lat: 32.33, lng: -64.75 },
    { name: "Bhutan", flag: "🇧🇹", lat: 27.5, lng: 90.5 },
    { name: "Bolivia", flag: "🇧🇴", lat: -17, lng: -65 },
    { name: "Bosnia and Herzegovina", flag: "🇧🇦", lat: 44, lng: 18 },
    { name: "Botswana", flag: "🇧🇼", lat: -22, lng: 24 },
    { name: "Bouvet Island", flag: "🇧🇻", lat: -54.43, lng: 3.4 },
    { name: "Brazil", flag: "🇧🇷", lat: -10, lng: -55 },
    { name: "British Indian Ocean Territory", flag: "🇮🇴", lat: -6, lng: 71.5 },
    { name: "British Virgin Islands", flag: "🇻🇬", lat: 18.43, lng: -64.62 },
    { name: "Brunei", flag: "🇧🇳", lat: 4.5, lng: 114.67 },
    { name: "Bulgaria", flag: "🇧🇬", lat: 43, lng: 25 },
    { name: "Burkina Faso", flag: "🇧🇫", lat: 13, lng: -2 },
    { name: "Burundi", flag: "🇧🇮", lat: -3.5, lng: 30 },
    { name: "Cambodia", flag: "🇰🇭", lat: 13, lng: 105 },
    { name: "Cameroon", flag: "🇨🇲", lat: 6, lng: 12 },
    { name: "Canada", flag: "🇨🇦", lat: 60, lng: -95 },
    { name: "Cape Verde", flag: "🇨🇻", lat: 16, lng: -24 },
    { name: "Caribbean Netherlands", flag: "", lat: 12.18, lng: -68.25 },
    { name: "Cayman Islands", flag: "🇰🇾", lat: 19.5, lng: -80.5 },
    { name: "Central African Republic", flag: "🇨🇫", lat: 7, lng: 21 },
    { name: "Chad", flag: "🇹🇩", lat: 15, lng: 19 },
    { name: "Chile", flag: "🇨🇱", lat: -30, lng: -71 },
    { name: "China", flag: "🇨🇳", lat: 35, lng: 105 },
    { name: "Christmas Island", flag: "🇨🇽", lat: -10.5, lng: 105.67 },
    { name: "Cocos (Keeling) Islands", flag: "🇨🇨", lat: -12.5, lng: 96.83 },
    { name: "Colombia", flag: "🇨🇴", lat: 4, lng: -72 },
    { name: "Comoros", flag: "🇰🇲", lat: -12.17, lng: 44.25 },
    { name: "Cook Islands", flag: "🇨🇰", lat: -21.23, lng: -159.77 },
    { name: "Costa Rica", flag: "🇨🇷", lat: 10, lng: -84 },
    { name: "Croatia", flag: "🇭🇷", lat: 45.17, lng: 15.5 },
    { name: "Cuba", flag: "🇨🇺", lat: 21.5, lng: -80 },
    { name: "Curaçao", flag: "🇨🇼", lat: 12.12, lng: -68.93 },
    { name: "Cyprus", flag: "🇨🇾", lat: 35, lng: 33 },
    { name: "Czechia", flag: "🇨🇿", lat: 49.75, lng: 15.5 },
    { name: "Denmark", flag: "🇩🇰", lat: 56, lng: 10 },
    { name: "Djibouti", flag: "🇩🇯", lat: 11.5, lng: 43 },
    { name: "Dominica", flag: "🇩🇲", lat: 15.42, lng: -61.33 },
    { name: "Dominican Republic", flag: "🇩🇴", lat: 19, lng: -70.67 },
    { name: "DR Congo", flag: "🇨🇩", lat: 0, lng: 25 },
    { name: "Ecuador", flag: "🇪🇨", lat: -2, lng: -77.5 },
    { name: "Egypt", flag: "🇪🇬", lat: 27, lng: 30 },
    { name: "El Salvador", flag: "🇸🇻", lat: 13.83, lng: -88.92 },
    { name: "Equatorial Guinea", flag: "🇬🇶", lat: 2, lng: 10 },
    { name: "Eritrea", flag: "🇪🇷", lat: 15, lng: 39 },
    { name: "Estonia", flag: "🇪🇪", lat: 59, lng: 26 },
    { name: "Eswatini", flag: "🇸🇿", lat: -26.5, lng: 31.5 },
    { name: "Ethiopia", flag: "🇪🇹", lat: 8, lng: 38 },
    { name: "Falkland Islands", flag: "🇫🇰", lat: -51.75, lng: -59 },
    { name: "Faroe Islands", flag: "🇫🇴", lat: 62, lng: -7 },
    { name: "Fiji", flag: "🇫🇯", lat: -18, lng: 175 },
    { name: "Finland", flag: "🇫🇮", lat: 64, lng: 26 },
    { name: "France", flag: "🇫🇷", lat: 46, lng: 2 },
    { name: "French Guiana", flag: "🇬🇫", lat: 4, lng: -53 },
    { name: "French Polynesia", flag: "🇵🇫", lat: -15, lng: -140 },
    { name: "French Southern and Antarctic Lands", flag: "🇹🇫", lat: -49.25, lng: 69.17 },
    { name: "Gabon", flag: "🇬🇦", lat: -1, lng: 11.75 },
    { name: "Gambia", flag: "🇬🇲", lat: 13.47, lng: -16.57 },
    { name: "Georgia", flag: "🇬🇪", lat: 42, lng: 43.5 },
    { name: "Germany", flag: "🇩🇪", lat: 51, lng: 9 },
    { name: "Ghana", flag: "🇬🇭", lat: 8, lng: -2 },
    { name: "Gibraltar", flag: "🇬🇮", lat: 36.13, lng: -5.35 },
    { name: "Greece", flag: "🇬🇷", lat: 39, lng: 22 },
    { name: "Greenland", flag: "🇬🇱", lat: 72, lng: -40 },
    { name: "Grenada", flag: "🇬🇩", lat: 12.12, lng: -61.67 },
    { name: "Guadeloupe", flag: "🇬🇵", lat: 16.25, lng: -61.58 },
    { name: "Guam", flag: "🇬🇺", lat: 13.47, lng: 144.78 },
    { name: "Guatemala", flag: "🇬🇹", lat: 15.5, lng: -90.25 },
    { name: "Guernsey", flag: "🇬🇬", lat: 49.47, lng: -2.58 },
    { name: "Guinea", flag: "🇬🇳", lat: 11, lng: -10 },
    { name: "Guinea-Bissau", flag: "🇬🇼", lat: 12, lng: -15 },
    { name: "Guyana", flag: "🇬🇾", lat: 5, lng: -59 },
    { name: "Haiti", flag: "🇭🇹", lat: 19, lng: -72.42 },
    { name: "Heard Island and McDonald Islands", flag: "🇭🇲", lat: -53.1, lng: 72.52 },
    { name: "Honduras", flag: "🇭🇳", lat: 15, lng: -86.5 },
    { name: "Hong Kong", flag: "🇭🇰", lat: 22.27, lng: 114.19 },
    { name: "Hungary", flag: "🇭🇺", lat: 47, lng: 20 },
    { name: "Iceland", flag: "🇮🇸", lat: 65, lng: -18 },
    { name: "India", flag: "🇮🇳", lat: 20, lng: 77 },
    { name: "Indonesia", flag: "🇮🇩", lat: -5, lng: 120 },
    { name: "Iran", flag: "🇮🇷", lat: 32, lng: 53 },
    { name: "Iraq", flag: "🇮🇶", lat: 33, lng: 44 },
    { name: "Ireland", flag: "🇮🇪", lat: 53, lng: -8 },
    { name: "Isle of Man", flag: "🇮🇲", lat: 54.25, lng: -4.5 },
    { name: "Italy", flag: "🇮🇹", lat: 42.83, lng: 12.83 },
    { name: "Ivory Coast", flag: "🇨🇮", lat: 8, lng: -5 },
    { name: "Jamaica", flag: "🇯🇲", lat: 18.25, lng: -77.5 },
    { name: "Japan", flag: "🇯🇵", lat: 36, lng: 138 },
    { name: "Jersey", flag: "🇯🇪", lat: 49.25, lng: -2.17 },
    { name: "Jordan", flag: "🇯🇴", lat: 31, lng: 36 },
    { name: "Kazakhstan", flag: "🇰🇿", lat: 48, lng: 68 },
    { name: "Kenya", flag: "🇰🇪", lat: 1, lng: 38 },
    { name: "Kiribati", flag: "🇰🇮", lat: 1.42, lng: 173 },
    { name: "Kosovo", flag: "🇽🇰", lat: 42.67, lng: 21.17 },
    { name: "Kuwait", flag: "🇰🇼", lat: 29.5, lng: 45.75 },
    { name: "Kyrgyzstan", flag: "🇰🇬", lat: 41, lng: 75 },
    { name: "Laos", flag: "🇱🇦", lat: 18, lng: 105 },
    { name: "Latvia", flag: "🇱🇻", lat: 57, lng: 25 },
    { name: "Lebanon", flag: "🇱🇧", lat: 33.83, lng: 35.83 },
    { name: "Lesotho", flag: "🇱🇸", lat: -29.5, lng: 28.5 },
    { name: "Liberia", flag: "🇱🇷", lat: 6.5, lng: -9.5 },
    { name: "Libya", flag: "🇱🇾", lat: 25, lng: 17 },
    { name: "Liechtenstein", flag: "🇱🇮", lat: 47.27, lng: 9.53 },
    { name: "Lithuania", flag: "🇱🇹", lat: 56, lng: 24 },
    { name: "Luxembourg", flag: "🇱🇺", lat: 49.75, lng: 6.17 },
    { name: "Macau", flag: "🇲🇴", lat: 22.17, lng: 113.55 },
    { name: "Madagascar", flag: "🇲🇬", lat: -20, lng: 47 },
    { name: "Malawi", flag: "🇲🇼", lat: -13.5, lng: 34 },
    { name: "Malaysia", flag: "🇲🇾", lat: 2.5, lng: 112.5 },
    { name: "Maldives", flag: "🇲🇻", lat: 3.25, lng: 73 },
    { name: "Mali", flag: "🇲🇱", lat: 17, lng: -4 },
    { name: "Malta", flag: "🇲🇹", lat: 35.83, lng: 14.58 },
    { name: "Marshall Islands", flag: "🇲🇭", lat: 9, lng: 168 },
    { name: "Martinique", flag: "🇲🇶", lat: 14.67, lng: -61 },
    { name: "Mauritania", flag: "🇲🇷", lat: 20, lng: -12 },
    { name: "Mauritius", flag: "🇲🇺", lat: -20.28, lng: 57.55 },
    { name: "Mayotte", flag: "🇾🇹", lat: -12.83, lng: 45.17 },
    { name: "Mexico", flag: "🇲🇽", lat: 23, lng: -102 },
    { name: "Micronesia", flag: "🇫🇲", lat: 6.92, lng: 158.25 },
    { name: "Moldova", flag: "🇲🇩", lat: 47, lng: 29 },
    { name: "Monaco", flag: "🇲🇨", lat: 43.73, lng: 7.4 },
    { name: "Mongolia", flag: "🇲🇳", lat: 46, lng: 105 },
    { name: "Montenegro", flag: "🇲🇪", lat: 42.5, lng: 19.3 },
    { name: "Montserrat", flag: "🇲🇸", lat: 16.75, lng: -62.2 },
    { name: "Morocco", flag: "🇲🇦", lat: 32, lng: -5 },
    { name: "Mozambique", flag: "🇲🇿", lat: -18.25, lng: 35 },
    { name: "Myanmar", flag: "🇲🇲", lat: 22, lng: 98 },
    { name: "Namibia", flag: "🇳🇦", lat: -22, lng: 17 },
    { name: "Nauru", flag: "🇳🇷", lat: -0.53, lng: 166.92 },
    { name: "Nepal", flag: "🇳🇵", lat: 28, lng: 84 },
    { name: "Netherlands", flag: "🇳🇱", lat: 52.5, lng: 5.75 },
    { name: "New Caledonia", flag: "🇳🇨", lat: -21.5, lng: 165.5 },
    { name: "New Zealand", flag: "🇳🇿", lat: -41, lng: 174 },
    { name: "Nicaragua", flag: "🇳🇮", lat: 13, lng: -85 },
    { name: "Niger", flag: "🇳🇪", lat: 16, lng: 8 },
    { name: "Nigeria", flag: "🇳🇬", lat: 10, lng: 8 },
    { name: "Niue", flag: "🇳🇺", lat: -19.03, lng: -169.87 },
    { name: "Norfolk Island", flag: "🇳🇫", lat: -29.03, lng: 167.95 },
    { name: "North Korea", flag: "🇰🇵", lat: 40, lng: 127 },
    { name: "North Macedonia", flag: "🇲🇰", lat: 41.83, lng: 22 },
    { name: "Northern Mariana Islands", flag: "🇲🇵", lat: 15.2, lng: 145.75 },
    { name: "Norway", flag: "🇳🇴", lat: 62, lng: 10 },
    { name: "Oman", flag: "🇴🇲", lat: 21, lng: 57 },
    { name: "Pakistan", flag: "🇵🇰", lat: 30, lng: 70 },
    { name: "Palau", flag: "🇵🇼", lat: 7.5, lng: 134.5 },
    { name: "Palestine", flag: "🇵🇸", lat: 31.9, lng: 35.2 },
    { name: "Panama", flag: "🇵🇦", lat: 9, lng: -80 },
    { name: "Papua New Guinea", flag: "🇵🇬", lat: -6, lng: 147 },
    { name: "Paraguay", flag: "🇵🇾", lat: -23, lng: -58 },
    { name: "Peru", flag: "🇵🇪", lat: -10, lng: -76 },
    { name: "Philippines", flag: "🇵🇭", lat: 13, lng: 122 },
    { name: "Pitcairn Islands", flag: "🇵🇳", lat: -25.07, lng: -130.1 },
    { name: "Poland", flag: "🇵🇱", lat: 52, lng: 20 },
    { name: "Portugal", flag: "🇵🇹", lat: 39.5, lng: -8 },
    { name: "Puerto Rico", flag: "🇵🇷", lat: 18.25, lng: -66.5 },
    { name: "Qatar", flag: "🇶🇦", lat: 25.5, lng: 51.25 },
    { name: "Republic of the Congo", flag: "🇨🇬", lat: -1, lng: 15 },
    { name: "Réunion", flag: "🇷🇪", lat: -21.15, lng: 55.5 },
    { name: "Romania", flag: "🇷🇴", lat: 46, lng: 25 },
    { name: "Rwanda", flag: "🇷🇼", lat: -2, lng: 30 },
    { name: "Saint Barthélemy", flag: "🇧🇱", lat: 18.5, lng: -63.42 },
    { name: "Saint Helena, Ascension and Tristan da Cunha", flag: "🇸🇭", lat: -15.95, lng: -5.72 },
    { name: "Saint Kitts and Nevis", flag: "🇰🇳", lat: 17.33, lng: -62.75 },
    { name: "Saint Lucia", flag: "🇱🇨", lat: 13.88, lng: -60.97 },
    { name: "Saint Martin", flag: "🇲🇫", lat: 18.08, lng: -63.95 },
    { name: "Saint Pierre and Miquelon", flag: "🇵🇲", lat: 46.83, lng: -56.33 },
    { name: "Saint Vincent and the Grenadines", flag: "🇻🇨", lat: 13.25, lng: -61.2 },
    { name: "Samoa", flag: "🇼🇸", lat: -13.58, lng: -172.33 },
    { name: "San Marino", flag: "🇸🇲", lat: 43.77, lng: 12.42 },
    { name: "São Tomé and Príncipe", flag: "🇸🇹", lat: 1, lng: 7 },
    { name: "Saudi Arabia", flag: "🇸🇦", lat: 25, lng: 45 },
    { name: "Senegal", flag: "🇸🇳", lat: 14, lng: -14 },
    { name: "Serbia", flag: "🇷🇸", lat: 44, lng: 21 },
    { name: "Seychelles", flag: "🇸🇨", lat: -4.58, lng: 55.67 },
    { name: "Sierra Leone", flag: "🇸🇱", lat: 8.5, lng: -11.5 },
    { name: "Singapore", flag: "🇸🇬", lat: 1.37, lng: 103.8 },
    { name: "Sint Maarten", flag: "🇸🇽", lat: 18.03, lng: -63.05 },
    { name: "Slovakia", flag: "🇸🇰", lat: 48.67, lng: 19.5 },
    { name: "Slovenia", flag: "🇸🇮", lat: 46.12, lng: 14.82 },
    { name: "Solomon Islands", flag: "🇸🇧", lat: -8, lng: 159 },
    { name: "Somalia", flag: "🇸🇴", lat: 10, lng: 49 },
    { name: "South Africa", flag: "🇿🇦", lat: -29, lng: 24 },
    { name: "South Georgia", flag: "🇬🇸", lat: -54.5, lng: -37 },
    { name: "South Korea", flag: "🇰🇷", lat: 37, lng: 127.5 },
    { name: "South Sudan", flag: "🇸🇸", lat: 7, lng: 30 },
    { name: "Spain", flag: "🇪🇸", lat: 40, lng: -4 },
    { name: "Sri Lanka", flag: "🇱🇰", lat: 7, lng: 81 },
    { name: "Sudan", flag: "🇸🇩", lat: 15, lng: 30 },
    { name: "Suriname", flag: "🇸🇷", lat: 4, lng: -56 },
    { name: "Svalbard and Jan Mayen", flag: "🇸🇯", lat: 78, lng: 20 },
    { name: "Sweden", flag: "🇸🇪", lat: 62, lng: 15 },
    { name: "Switzerland", flag: "🇨🇭", lat: 47, lng: 8 },
    { name: "Syria", flag: "🇸🇾", lat: 35, lng: 38 },
    { name: "Taiwan", flag: "🇹🇼", lat: 23.5, lng: 121 },
    { name: "Tajikistan", flag: "🇹🇯", lat: 39, lng: 71 },
    { name: "Tanzania", flag: "🇹🇿", lat: -6, lng: 35 },
    { name: "Thailand", flag: "🇹🇭", lat: 15, lng: 100 },
    { name: "Timor-Leste", flag: "🇹🇱", lat: -8.83, lng: 125.92 },
    { name: "Togo", flag: "🇹🇬", lat: 8, lng: 1.17 },
    { name: "Tokelau", flag: "🇹🇰", lat: -9, lng: -172 },
    { name: "Tonga", flag: "🇹🇴", lat: -20, lng: -175 },
    { name: "Trinidad and Tobago", flag: "🇹🇹", lat: 11, lng: -61 },
    { name: "Tunisia", flag: "🇹🇳", lat: 34, lng: 9 },
    { name: "Türkiye", flag: "🇹🇷", lat: 39, lng: 35 },
    { name: "Turkmenistan", flag: "🇹🇲", lat: 40, lng: 60 },
    { name: "Turks and Caicos Islands", flag: "🇹🇨", lat: 21.75, lng: -71.58 },
    { name: "Tuvalu", flag: "🇹🇻", lat: -8, lng: 178 },
    { name: "Uganda", flag: "🇺🇬", lat: 1, lng: 32 },
    { name: "Ukraine", flag: "🇺🇦", lat: 49, lng: 32 },
    { name: "United Arab Emirates", flag: "🇦🇪", lat: 24, lng: 54 },
    { name: "United Kingdom", flag: "🇬🇧", lat: 54, lng: -2 },
    { name: "United States", flag: "🇺🇸", lat: 38, lng: -97 },
    { name: "United States Minor Outlying Islands", flag: "🇺🇲", lat: 19.3, lng: 166.63 },
    { name: "United States Virgin Islands", flag: "🇻🇮", lat: 18.35, lng: -64.93 },
    { name: "Uruguay", flag: "🇺🇾", lat: -33, lng: -56 },
    { name: "Uzbekistan", flag: "🇺🇿", lat: 41, lng: 64 },
    { name: "Vanuatu", flag: "🇻🇺", lat: -16, lng: 167 },
    { name: "Vatican City", flag: "🇻🇦", lat: 41.9, lng: 12.45 },
    { name: "Venezuela", flag: "🇻🇪", lat: 8, lng: -66 },
    { name: "Vietnam", flag: "🇻🇳", lat: 16.17, lng: 107.83 },
    { name: "Wallis and Futuna", flag: "🇼🇫", lat: -13.3, lng: -176.2 },
    { name: "Western Sahara", flag: "🇪🇭", lat: 24.5, lng: -13 },
    { name: "Yemen", flag: "🇾🇪", lat: 15, lng: 48 },
    { name: "Zambia", flag: "🇿🇲", lat: -15, lng: 30 },
    { name: "Zimbabwe", flag: "🇿🇼", lat: -20, lng: 30 },
  ];

  // Location.country stores the plain name only (a clean key into this
  // lookup) -- never a pre-formatted "flag + name" string that display
  // code would then have to re-parse apart via string splitting to get
  // either piece back out.
  const COUNTRY_BY_NAME = Object.fromEntries(COUNTRIES.map(c => [c.name, c]));

  // ── State ────────────────────────────────────────────────────────────
  // Owned by the Store module (#234) -- statusFilters/gradeRange/activeType/
  // activeView/search/sortByPlace/collapsed/entries/places/locations/
  // isLoggedIn all live behind store.*, not raw fields. athleteMode,
  // editingId, and lowerGradesExpanded stay local module `let`s here --
  // each is read/written by exactly one section below (admin bar, entry
  // form, Grade Pyramid respectively), so they'll move into that section's
  // own module in #235-#242 rather than the shared Store now.
  const store = createStore();

  let athleteMode  = false;
  let editingId    = null; // null = add mode
  let lowerGradesExpanded = false;

  // ── Offline queue ──────────────────────────────────────────────────
  function getQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) ?? []; }
    catch { return []; }
  }
  function setQueue(queue) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    updateSyncButton();
  }
  function updateSyncButton() {
    const n = getQueue().length;
    // A sync while logged out is a guaranteed no-op (Access rejects it) --
    // same rule as addBtn/athleteModeBtn in updateAdminBar(). The pending
    // entries themselves still show their own badges, so this doesn't hide
    // the fact that changes are queued, just the button that can't act on
    // them yet.
    syncBtn.hidden = n === 0 || !store.isLoggedIn();
    syncBtnLabel.textContent = n ? `Sync (${n})` : "Sync";
  }

  // One request for a single queue item, whichever kind it is -- kept
  // separate from the replay loop below so that loop stays readable
  // regardless of how many kinds of queueable write this app ends up
  // with.
  function syncOne(item) {
    if (item.kind === "location") {
      return adminFetch(ADMIN_LOCATIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.record),
      });
    }
    if (item.kind === "place") {
      return adminFetch(ADMIN_PLACES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.record),
      });
    }
    return item.op === "delete"
      ? adminFetch(`${ADMIN_DATA_URL}?id=${encodeURIComponent(item.record.id)}`, { method: "DELETE" })
      : adminFetch(ADMIN_DATA_URL, {
          method: item.op === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.record),
        });
  }

  async function syncPending() {
    const queue = getQueue();
    if (!queue.length) return;
    syncBtn.disabled = true;
    syncBtnIcon.classList.add("animate-spin");

    try {
      const remaining = [];
      let lastEntries = null, lastPlaces = null, lastLocations = null;
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        try {
          const res = await syncOne(item);
          if (res.status === 401 || isAuthRedirect(res)) {
            // queue.slice(i), not [item] -- every item from here on was
            // never attempted and must be preserved too, or a mid-sync
            // 401/network failure silently drops the rest of the queue.
            // This also naturally preserves a location/place/entry
            // dependency chain's relative order in `remaining`, since
            // they're always pushed onto the queue in that order to
            // begin with (#158).
            remaining.push(...queue.slice(i));
            store.setLoggedIn(false);
            updateAdminBar();
            break;
          }
          if (!res.ok) { remaining.push(item); continue; }
          const data = await res.json();
          if (item.kind === "location") lastLocations = data.locations;
          else if (item.kind === "place") lastPlaces = data.places;
          else lastEntries = data.entries;
        } catch {
          remaining.push(...queue.slice(i));
          break; // still offline — stop, preserve order for next attempt
        }
      }

      setQueue(remaining);
      if (lastLocations) store.setLocations(lastLocations);
      if (lastPlaces) store.setPlaces(lastPlaces);
      if (lastEntries) store.setEntries(lastEntries);
      // Re-apply whatever's still queued on top of the just-confirmed
      // server state, for any of the three arrays that changed.
      if (lastLocations || lastPlaces || lastEntries) {
        applyPendingQueue(getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());
      }
    } finally {
      syncBtn.disabled = false;
      syncBtnIcon.classList.remove("animate-spin");
      render();
    }
  }

  // ── Data ─────────────────────────────────────────────────────────────
  // Thin wrappers over store's own thin wrappers over client/entries.js's
  // pure functions -- kept bare-named so every existing call site
  // throughout this file (dozens, for placeOf/entryLocation especially)
  // keeps calling these same names with the same signatures, same
  // risk-managed extraction pattern #206 used for many-call-site
  // functions. Unlike those, the *state itself* (activeType, ALL_ENTRIES,
  // etc.) is not re-wrapped this way below -- every direct state
  // read/write site now calls store.* explicitly instead, since hiding
  // that behind another layer of bare functions would just recreate the
  // "any function can reach in and change any field" problem #234 exists
  // to fix, one level removed.
  function placeOf(entry) {
    return store.placeOf(entry);
  }
  function locationOf(place) {
    return store.locationOf(place);
  }
  function entryLocation(entry) {
    return store.entryLocation(entry);
  }
  function activeGradeList() {
    return store.activeGradeList();
  }
  function filteredEntries() {
    return store.filteredEntries();
  }
  function groupByPlace(entries) {
    return store.groupByPlace(entries);
  }
  function sortEntries(entries, locationId) {
    return store.sortEntries(entries, locationId);
  }
  function getSort(locationId) {
    return store.getSort(locationId);
  }

  // ── Logbook table view (#235) -- entries table + search/filter/sort/
  // collapse controls; see client/logbook-view.js. `createDisclosure` and
  // `render` are injected since neither is its own module yet (createDisclosure
  // is #241, render is main.js's own top-level composition, defined below
  // via a hoisted function declaration so the reference is already valid
  // here).
  const logbookView = createLogbookView({ store, createDisclosure, render, COUNTRY_BY_NAME });

  const DISCIPLINE_LABEL = { boulder: "Boulder", lead: "Lead" };
  function updateDisciplinePicker() {
    document.getElementById("discipline-btn-label").textContent = DISCIPLINE_LABEL[store.getActiveType()];
    // Kept in sync even though the visible label above covers most widths --
    // aria-label always wins over visible text content for the accessible
    // name, so this is what a screen reader announces once the label span
    // itself is hidden below the icon-collapse breakpoint (#114).
    disciplineBtn.setAttribute("aria-label", `Discipline: ${DISCIPLINE_LABEL[store.getActiveType()]}`);
    document.querySelectorAll(".discipline-option").forEach(opt =>
      opt.setAttribute("aria-selected", String(opt.dataset.discipline === store.getActiveType()))
    );
  }

  function render() {
    updateDisciplinePicker();
    const entries = filteredEntries();
    logbookView.render(entries);
    updateSubtitle(entries);
    updateAdminBar();
    if (store.getActiveView() === "pyramid") renderPyramid();
    if (store.getActiveView() === "map") renderMap();
  }

  function updateSubtitle(entries) {
    // Scoped to the active tab's type only (see #97) -- these are "your
    // Boulder stats" / "your Lead stats", not a global summary, now that
    // the two disciplines have their own separate views.
    const typeEntries = store.getEntries().filter(e => e.type === store.getActiveType());
    const countries = new Set(typeEntries.map(e => entryLocation(e).country).filter(Boolean)).size;
    const flashes   = typeEntries.filter(e => e.status === "send" && e.firstAttempt).length;
    const sends     = typeEntries.filter(e => e.status === "send" && !e.firstAttempt).length;
    const projects  = typeEntries.filter(e => e.status === "project").length;

    const stat = (n, singular, plural) =>
      `<span class="text-foreground font-semibold">${n}</span> <span class="text-muted">${n === 1 ? singular : plural}</span>`;

    document.getElementById("subtitle").innerHTML = [
      stat(countries, "Country", "Countries"),
      stat(flashes, flashLabel(store.getActiveType()), flashLabel(store.getActiveType(), true)),
      stat(sends, sendLabel(store.getActiveType()), sendLabel(store.getActiveType(), true)),
      stat(projects, "Project", "Projects"),
    ].join(`<span class="text-muted"> · </span>`);
    document.getElementById("footer").textContent = "";
  }

  // ── Grade Pyramid (#12) ─────────────────────────────────────────────
  const PYRAMID_ICON_GOOD     = `<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 5-5"></path>`;
  const PYRAMID_ICON_LOW      = `<path d="M12 3 2 20h20L12 3Z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`;
  const PYRAMID_ICON_MISSING  = `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v6"></path><path d="M12 16.5h.01"></path>`;
  const PYRAMID_ICON_PROMOTED = `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path>`;
  const PYRAMID_GOLD = "#eab308"; // achievement/celebratory accent (#131) -- literal hex, matching the existing good/missing icons' style rather than a CSS var

  // Thin wrapper over client/pyramid-stats.js's pure pyramidSplitRows --
  // closes over the Store's entries so renderPyramid's one call site is
  // unchanged.
  function pyramidSplitRows(type) {
    return pyramidSplitRowsPure(type, store.getEntries());
  }

  // Evidence-tier claims mark the claim's own words bold + tier-colored
  // and clickable (rather than a separate icon badge appended after the
  // text, which read as visually heavy and disturbed the paragraph's line
  // height, #147 v2) -- plain inline text styling wraps normally across
  // lines and can never inflate the line box it sits in. `data-evidence-
  // tier` is wired up generically elsewhere (querySelectorAll), so this
  // works wherever it's dropped into rendered HTML without extra plumbing.
  function evidenceTierText(text) {
    return `<button type="button" class="text-[.82rem] font-bold text-tier-heuristic bg-transparent border-0 p-0 m-0 cursor-pointer hover:brightness-90" data-evidence-tier aria-label="${text} -- evidence tier: coaching heuristic, tap to learn more">${text}</button>`;
  }
  // Reads like a superscript because it uses the actual browser-native
  // superscript mechanism (`align-super`, i.e. `vertical-align: super`)
  // rather than a hand-measured position -- the browser computes the
  // raise amount from real font metrics, so this stays correct across
  // any font/font-size/browser without per-context tuning. The badge's
  // own font-size is a plain fixed rem value (not relative to the
  // surrounding paragraph), so it doesn't depend on inheritance either.
  // window-note's own leading was bumped from 1.6 to 1.7 to give the
  // raised badge comfortable headroom -- at 1.6 the fit was borderline
  // enough that per-line text-rendering rounding occasionally tipped one
  // specific line into visibly growing by ~2px, which the extra leading
  // absorbs (any remaining ±1px line-to-line variance afterwards is
  // ordinary sub-pixel rendering noise, present in any paragraph).
  const CITATION_MARKER = `<button type="button" class="align-super ml-[.3em] inline-flex items-center justify-center px-[.35em] py-[.1em] rounded-[.3em] border border-[color-mix(in_srgb,var(--color-accent)_35%,transparent)] text-accent bg-[color-mix(in_srgb,var(--color-accent)_14%,var(--color-surface))] text-[.65rem] font-bold leading-none cursor-pointer hover:brightness-95" data-citation aria-label="View sources">1</button>`;

  function pyramidStatusIcon(actual, ideal, promoted) {
    if (promoted) return { cls: "promoted", color: PYRAMID_GOLD, svg: PYRAMID_ICON_PROMOTED, label: "Ready to push -- you've logged enough at the tier below to attempt this grade" };
    if (actual === 0) return { cls: "missing", color: "#ef4444", svg: PYRAMID_ICON_MISSING, label: "No sends at this tier" };
    if (actual < ideal) return { cls: "low", color: "var(--color-tier-heuristic)", svg: PYRAMID_ICON_LOW, label: `${actual} of ${ideal} for a full 8-4-2-1 tier` };
    return { cls: "good", color: "#22c55e", svg: PYRAMID_ICON_GOOD, label: `Meets or exceeds the ${ideal}-send tier` };
  }

  // Bars center on a shared vertical midline (rather than left-align) so
  // the row naturally tapers like a pyramid based on relative send counts.
  // The dashed ideal-outline is plain CSS border (not SVG -- an SVG
  // viewBox stretched non-uniformly per row's width would distort its own
  // corner radius along with the width) with a same-background-color
  // drop-shadow halo so it stays legible over any grade color underneath,
  // regardless of whether the bar happens to be wider or narrower than it.
  function pyramidBarRow(row, { ideal = null, scaleMax, lower = false, type, promoted = false } = {}) {
    const actualPct = row.count === 0 ? 0 : (row.count / scaleMax) * 100;
    const barColor = gradeColor(row.grade, type);
    const barStyle = lower
      ? `width:${actualPct}%; background:${barColor}; filter:saturate(.18) brightness(1.12)`
      : `width:${actualPct}%; background:${barColor}`;
    // The promoted (achievement/celebratory, #131) tier's outline goes
    // gold instead of the usual neutral dashed border -- filled with a
    // translucent gold wash and a soft glow, not just an empty dashed
    // box, since its actual bar is always 0-width (no sends there yet)
    // and would otherwise leave the tier looking empty rather than
    // "waiting to be claimed". Both branches are written out as complete
    // literal class strings (not built from the PYRAMID_GOLD JS
    // constant) -- Tailwind's build scans this file's raw source text
    // for whole class names, so an interpolated `border-[${PYRAMID_GOLD}]`
    // would never be found or generated.
    const idealOutline = ideal !== null
      ? promoted
        ? `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-[#eab308] bg-[color-mix(in_srgb,#eab308_22%,transparent)] shadow-[0_0_10px_-1px_#eab308] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`
        : `<div class="absolute top-0 left-1/2 -translate-x-1/2 h-full box-border rounded-[4px] border-[1.25px] border-dashed border-[color-mix(in_srgb,var(--color-foreground)_65%,transparent)] [filter:drop-shadow(0_0_1px_var(--color-surface))_drop-shadow(0_0_1px_var(--color-surface))] pointer-events-none" style="width:${(ideal / scaleMax) * 100}%"></div>`
      : "";
    const icon = ideal !== null ? pyramidStatusIcon(row.count, ideal, promoted) : null;
    // The status is conveyed by icon shape+color for sighted users, but a
    // `title` tooltip requires hover (unavailable on touch, unreliable for
    // screen readers) -- sr-only text covers both.
    const iconHtml = icon
      ? `<svg class="w-[1.15rem] h-[1.15rem] shrink-0" viewBox="0 0 24 24" fill="none" stroke="${icon.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.svg}</svg>
         <span class="sr-only">${icon.label}</span>`
      : "";
    // The promoted row gets a soft gold spotlight band behind it (extends
    // slightly past the bar itself via negative margin/padding) so the
    // achievement reads at a glance scrolling past, not just up close.
    const rowClasses = lower
      ? "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px] opacity-[.82]"
      : promoted
        ? "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px] -mx-[.5rem] px-[.5rem] py-[.25rem] rounded-[8px] bg-[color-mix(in_srgb,#eab308_10%,transparent)]"
        : "grid grid-cols-[3.2rem_1fr_4.2rem] max-[480px]:grid-cols-[2rem_1fr_3.4rem] items-center gap-[10px] max-[480px]:gap-[8px] mb-[14px]";
    const countClasses = lower
      ? "flex items-center gap-[.35rem] text-[.82rem] font-semibold tabular-nums text-muted"
      : "flex items-center gap-[.35rem] text-[.82rem] font-bold tabular-nums text-foreground";
    // Actual/ideal (e.g. "1/4", "3/2") only where there's an ideal to
    // compare against -- lower-grade rows (outside the 8-4-2-1 window)
    // have no defined target, so they keep showing the bare count.
    const countText = ideal !== null ? `${row.count}/${ideal}` : `${row.count}`;
    return `
      <div class="${rowClasses}">
        <div class="text-[.8rem] font-bold text-right tabular-nums text-muted">${escapeHtml(row.grade)}</div>
        <div class="relative h-[1.3rem]">
          <div class="absolute top-0 left-1/2 -translate-x-1/2 h-full rounded-[4px] transition-[width] duration-300" style="${barStyle}"></div>
          ${idealOutline}
        </div>
        <div class="${countClasses}">${countText}${iconHtml}</div>
      </div>`;
  }

  function renderPyramid() {
    const type = store.getActiveType();
    const { top4, lower, hasSends, promotedGrade } = pyramidSplitRows(type);
    const pyramidEl = document.getElementById("pyramid");
    const healthEl = document.getElementById("health-card");

    if (!hasSends) {
      pyramidEl.innerHTML = `<p class="text-[.9rem] text-muted">No ${DISCIPLINE_LABEL[type]} sends logged in the last 12 months yet -- log a send to see your pyramid.</p>`;
      healthEl.innerHTML = "";
      document.getElementById("window-note").innerHTML = "";
      return;
    }

    const top4Scale = Math.max(8, ...top4.map(r => r.count));
    const top4Html = top4.map((r, i) => pyramidBarRow(r, { ideal: PYRAMID_IDEAL_BY_POSITION[i], scaleMax: top4Scale, type, promoted: r.grade === promotedGrade })).join("");

    let lowerHtml = "";
    if (lower.length) {
      const lowerScale = Math.max(1, ...lower.map(r => r.count));
      lowerHtml = `
        <div class="text-center my-1 mb-[14px]">
          <button type="button" class="font-sans text-[.8rem] font-semibold text-muted bg-transparent border-b-0 border-l-0 border-r-0 border-t border-border py-[14px] min-h-[2.75rem] w-full cursor-pointer hover:text-accent" id="show-lower-link" aria-expanded="${lowerGradesExpanded}" aria-controls="lower-rows">${lowerGradesExpanded ? "Hide lower grades ▴" : "Show lower grades ▾"}</button>
        </div>
        <div id="lower-rows">${lowerGradesExpanded ? lower.map(r => pyramidBarRow(r, { scaleMax: lowerScale, lower: true, type })).join("") : ""}</div>`;
    }

    pyramidEl.innerHTML = top4Html + lowerHtml;

    if (lower.length) {
      const link = document.getElementById("show-lower-link");
      link.addEventListener("click", () => {
        lowerGradesExpanded = !lowerGradesExpanded;
        renderPyramid();
        // Re-focus after the innerHTML rebuild above destroys the old node
        // -- otherwise focus silently drops to <body> on every toggle
        // (same bug class as the #95 type-tabs re-render fix).
        document.getElementById("show-lower-link").focus();
      });
    }

    document.getElementById("window-note").innerHTML =
      `Sends from the <strong class="text-foreground font-semibold">last 12 months only</strong>${CITATION_MARKER}, showing your
       <strong class="text-foreground font-semibold">8-4-2-1 window</strong> — four grade tiers anchored to your progress so far, including any with zero sends, projecting one tier higher once you've logged enough to be ready to push for it. Dashed outlines mark the
       ideal count for each tier. The ratio itself is a ${evidenceTierText("widely used coaching heuristic")}${CITATION_MARKER}, not a proven ratio.`;
    document.querySelectorAll("[data-citation]").forEach(btn =>
      btn.addEventListener("click", () => openModal(citationsOverlay))
    );
    document.querySelectorAll("[data-evidence-tier]").forEach(btn =>
      btn.addEventListener("click", () => openModal(evidenceOverlay))
    );

    if (promotedGrade) {
      // Achievement/celebratory styling (#131) -- gold instead of the
      // usual tier-heuristic teal. Written as complete literal classes
      // (not built from the PYRAMID_GOLD JS constant) for the same
      // reason as pyramidBarRow's dashed-outline branch above: Tailwind
      // scans this file's raw source text for whole class names.
      healthEl.className = "flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0 bg-[color-mix(in_srgb,#eab308_10%,var(--color-surface))] border border-[color-mix(in_srgb,#eab308_35%,transparent)] text-[#eab308]";
      // A promoted tier can still have plain-empty aspirational tiers
      // above it (Scenario C: building from the base, several grades
      // still out of reach) -- worth a different message than a clean
      // Scenario B promotion, where the promoted tier is the only gap.
      const stillBuilding = top4.some(r => r.count === 0 && r.grade !== promotedGrade);
      healthEl.innerHTML = stillBuilding
        ? `
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PYRAMID_ICON_PROMOTED}</svg>
          <div>
            <p class="text-[.86rem] leading-[1.5] text-foreground">Still building your pyramid from the base up — but you've already got enough mileage to give ${escapeHtml(promotedGrade)} a go.</p>
            <p class="text-[.8rem] leading-[1.5] text-muted mt-[6px]">Keep adding sends at your lower tiers too — a full 8-4-2-1 pyramid needs volume all the way down, not just at the top.</p>
          </div>`
        : `
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PYRAMID_ICON_PROMOTED}</svg>
          <div>
            <p class="text-[.86rem] leading-[1.5] text-foreground">You've logged enough at every tier below to be ready to push into ${escapeHtml(promotedGrade)}.</p>
            <p class="text-[.8rem] leading-[1.5] text-muted mt-[6px]">Heuristic guidance, not diagnosis — the volume says you're ready, only you know if the moves suit you.</p>
          </div>`;
      return;
    }

    const gapRow = top4.find(r => r.count === 0);
    if (gapRow) {
      healthEl.className = "flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0 bg-[color-mix(in_srgb,var(--color-tier-heuristic)_8%,var(--color-surface))] border border-[color-mix(in_srgb,var(--color-tier-heuristic)_30%,transparent)] text-tier-heuristic";
      healthEl.innerHTML = `
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
        <div>
          <p class="text-[.86rem] leading-[1.5] text-foreground">No sends logged at ${escapeHtml(gapRow.grade)} in the last 12 months, right in the middle of your pyramid window.</p>
          <p class="text-[.8rem] leading-[1.5] text-muted mt-[6px]">Heuristic guidance, not diagnosis — might be worth spending more mileage there before pushing your top grade again.</p>
        </div>`;
    } else {
      healthEl.className = "flex gap-3 px-4 py-[14px] rounded-app mb-7 [&_svg]:w-[1.2rem] [&_svg]:h-[1.2rem] [&_svg]:stroke-current [&_svg]:fill-none [&_svg]:mt-[2px] [&_svg]:shrink-0 bg-[color-mix(in_srgb,var(--color-tier-heuristic)_8%,var(--color-surface))] border border-[color-mix(in_srgb,var(--color-tier-heuristic)_30%,transparent)] text-tier-heuristic";
      healthEl.innerHTML = `
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
        <div><p class="text-[.86rem] leading-[1.5] text-foreground">No gaps in this window — every tier from your base to your max has sends behind it.</p></div>`;
    }
  }

  // ── World map (#17, #169) ─────────────────────────────────────────────
  // One pin per country with >=1 logged entry (not per-place), scoped to
  // the active discipline like every other tab (the header discipline
  // picker "applies to all tabs" -- see the view-tabs comment above).
  //
  // The world's landmass/border/graticule paths and each country's
  // projected {x, y} pin position are pre-computed at generation time
  // (Equal Earth, #6, via scripts/generate-world-map.mjs) -- this only
  // draws the static path and positions pins, no projection math
  // client-side. Zoom/pan (#168) is pure viewBox arithmetic on that same
  // static SVG.
  //
  // #169: Equal Earth ships three official central-meridian variants --
  // Greenwich, Americas (90degW), and Oceania (150degE), each recentring
  // the map on a different part of the world (see the explainer text
  // below the map). Unlike the country list above, these are NOT bundled
  // inline -- shipping all three upfront (~80KB each) would nearly triple
  // this file for two variants most visits never use. That's a
  // deliberate, narrow exception to the Connectivity Resilience
  // standard's "don't fetch on demand" rule (docs/coding-standards.md):
  // the map is a nice-to-have never needed at the crag (#111's bad-signal
  // concern is about logging climbs, not this), so it gets its own
  // tradeoff -- fetch on demand, show real load progress so a slow
  // connection is a visible, informed wait rather than a silent hang, and
  // fail with a plain "you need to be online" message instead of
  // pretending to work offline. MAP_WIDTH imported from map-geometry.js.

  const MAP_VARIANTS = {
    greenwich: { label: "Greenwich" },
    americas: { label: "Americas" },
    oceania: { label: "Oceania" },
  };
  // Each variant's exact UNCOMPRESSED byte size, printed by
  // generate-world-map.mjs on every regeneration -- the client needs its
  // own copy of this number because the response's Content-Length header
  // isn't a usable source for it: any real browser fetch sends
  // Accept-Encoding: gzip, and this server (both wrangler dev locally and
  // Cloudflare's edge in production -- streaming gzip can't know its own
  // compressed size upfront) responds Transfer-Encoding: chunked with no
  // Content-Length at all once compression kicks in (confirmed via curl
  // -H "Accept-Encoding: gzip"). What IS reliably available is the
  // DEcompressed byte count fetchWithProgress's reader loop measures --
  // fetch()'s body stream is always already-decompressed, browsers
  // transparently undo Content-Encoding before JS ever sees the bytes --
  // so comparing that running count against this known-upfront total
  // gives a real percentage, with no header dependency at all.
  const MAP_VARIANT_SIZES = {"greenwich":83027,"americas":82148,"oceania":82354};
  const MAP_VARIANT_STORAGE_KEY = "mapProjectionVariant";

  // Best-effort only -- picks a reasonable *default* the first time the
  // map's opened; the user can always switch explicitly afterward, and
  // that choice then persists (see getActiveMapVariant). Buckets the
  // browser's current local UTC offset into whichever of the three
  // central meridians (0deg/-90deg/150deg) is geographically closest,
  // using today's actual offset (Date's own getTimezoneOffset, not a
  // full IANA timezone->region table) so DST is naturally accounted for.
  // Wrong for plenty of real timezones near the bucket edges -- fine,
  // it's only ever a starting point.
  function guessMapVariant() {
    const offsetHours = -new Date().getTimezoneOffset() / 60;
    if (offsetHours >= -3 && offsetHours < 5) return "greenwich";
    if (offsetHours >= -10 && offsetHours < -3) return "americas";
    return "oceania";
  }

  function getActiveMapVariant() {
    const stored = localStorage.getItem(MAP_VARIANT_STORAGE_KEY);
    return stored && MAP_VARIANTS[stored] ? stored : guessMapVariant();
  }

  function setActiveMapVariant(name) {
    localStorage.setItem(MAP_VARIANT_STORAGE_KEY, name);
    // Pixel coordinates from the old variant mean nothing under the new
    // projection -- reset to the new variant's own default view instead
    // of carrying over a viewBox that would point at the wrong part of
    // the map (or land outside it entirely).
    mapUserHasInteracted = false;
    mapView = null;
    renderMap();
  }

  const mapDataCache = new Map(); // variant name -> loaded {height, worldLandPath, countryBordersPath, graticulePath, pins, pinsByName}
  const mapLoadingVariants = new Set(); // variant names with a fetch currently in flight
  let mapData = null; // the active variant's loaded data, once available
  let mapLoadProgress = null; // 0-1, or null while total size is unknown
  let mapLoadError = null;

  // Reads the response body as it streams in (rather than the simpler
  // `res.json()`) so onProgress can report real bytes-loaded against the
  // known total -- see MAP_VARIANT_SIZES for why that total has to be
  // passed in rather than read off the response.
  async function fetchWithProgress(url, total, onProgress) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      // Clamped, not just divided -- MAP_VARIANT_SIZES is a snapshot from
      // whenever generate-world-map.mjs last ran, so a rounding quirk or
      // stale value could in principle put loaded a byte or two past
      // total before the stream itself reports done.
      onProgress(total ? Math.min(1, loaded / total) : null);
    }
    return JSON.parse(await new Blob(chunks).text());
  }

  function updateMapLoadProgressUI(frac) {
    mapLoadProgress = frac;
    const bar = document.getElementById("map-load-progress-bar");
    const label = document.getElementById("map-load-progress-label");
    if (!bar || !label) return; // loading UI isn't the one currently painted
    if (frac === null) {
      // Only reachable if MAP_VARIANT_SIZES is ever missing an entry --
      // every real variant has a known size, so this is a defensive
      // fallback, not the expected path.
      bar.style.width = "100%";
      bar.classList.add("animate-pulse");
      label.textContent = "Loading map…";
      return;
    }
    bar.style.width = `${Math.round(frac * 100)}%`;
    bar.classList.remove("animate-pulse");
    label.textContent = `Loading map… ${Math.round(frac * 100)}%`;
  }

  // Kicks off (or joins) a variant's fetch without blocking the caller --
  // renderMap() calls this and then immediately paints a loading/error
  // state, re-rendering for real once the promise below settles. Guarded
  // by mapLoadingVariants so switching tabs back and forth, or re-picking
  // the same variant, never starts a second concurrent fetch for it.
  function ensureMapVariantLoading(variant) {
    if (mapLoadingVariants.has(variant)) return;
    mapLoadingVariants.add(variant);
    mapLoadError = null;
    mapLoadProgress = null;
    loadMapVariant(variant)
      .then(() => {
        mapLoadingVariants.delete(variant);
        if (getActiveMapVariant() === variant && store.getActiveView() === "map") renderMap();
      })
      .catch(err => {
        mapLoadingVariants.delete(variant);
        mapLoadError = err;
        if (getActiveMapVariant() === variant && store.getActiveView() === "map") renderMap();
      });
  }

  async function loadMapVariant(name) {
    if (mapDataCache.has(name)) return mapDataCache.get(name);
    const data = await fetchWithProgress(`world-map-${name}.json`, MAP_VARIANT_SIZES[name] ?? 0, frac => {
      // A background fetch for a variant the user's since switched away
      // from shouldn't fight the currently-displayed one for the shared
      // progress UI.
      if (getActiveMapVariant() === name) updateMapLoadProgressUI(frac);
    });
    data.pinsByName = new Map(data.pins.map(p => [p.name, p]));
    mapDataCache.set(name, data);
    return data;
  }

  // Viewport aspect (#17 follow-up): showing the *entire* world by
  // default means most of a typical user's actual pins (clustered in one
  // region) render tiny, surrounded by ocean/continents nobody's ever
  // climbed in, which read as dead space around the sides (especially
  // pronounced on a narrow mobile viewport, where the rendered map is
  // short as well as letterboxed). Instead the viewport keeps its own
  // fixed aspect -- narrower/taller on narrow viewports, wider/shorter on
  // wide ones, matching the app's existing 600px narrow/wide breakpoint
  // (see the country-name-display comment elsewhere in this file) -- and
  // the *default* (max zoomed-out) view shows the full vertical extent
  // (pole to pole) but only a horizontal slice, centered, panned left/
  // right to see the rest. This trades "see the whole world at once" for
  // "see your own region at a readable size by default," which is the
  // actually useful default for a personal climbing map.
  const mapNarrowQuery = window.matchMedia("(max-width: 600px)");
  // Thin wrappers over client/map-geometry.js's pure functions -- they
  // close over mapData/mapNarrowQuery so every existing call site below
  // keeps calling these same zero-arg names. Only callable once mapData
  // has loaded -- every caller below is reachable only from the "loaded"
  // render path or from interactions the loading/error states don't
  // expose (the zoom/pan controls stay hidden until then).
  function mapViewportAspect() {
    return mapViewportAspectPure(mapNarrowQuery.matches);
  }
  function mapMaxW() {
    return mapMaxWPure(mapData.height, mapViewportAspect());
  }
  // Pins are sized in the same user-space units as the map itself, so
  // without correction they'd grow on screen as the viewBox shrinks while
  // zooming in (same user-space radius, but now spanning a much bigger
  // fraction of the same rendered width). These are each pin's radius/
  // stroke/font at the default (max zoomed-out) view; applyPinScale()
  // below rescales every pin by mapView.w / mapMaxW() on every zoom
  // change so they stay a constant apparent size on screen.
  const PIN_BASE_R = 9;
  const PIN_BASE_STROKE = 1.5;
  const PIN_BASE_FONT = 9;

  // Default view: full height, width set by the current viewport aspect
  // (see above), horizontally centered on the world (not on the current
  // discipline's pinned countries -- tried that per #17/#169, but it
  // meant every projection switch, and even a plain default load, could
  // clamp hard to an edge depending on where your pins happened to land
  // under that rotation, reading as a broken/panned map rather than
  // "here's this projection." World-centered is simple and predictable
  // regardless of your data or which variant is active.)
  function defaultMapView() {
    return defaultMapViewPure(MAP_WIDTH, mapMaxW(), mapViewportAspect());
  }
  // Deliberately not initialized to defaultMapView() here -- that needs
  // mapData.height, which isn't available until the active variant has
  // loaded. renderMap() computes it lazily on first successful load (and
  // again on every variant switch, see setActiveMapVariant).
  let mapView = null;
  // Sticks at false until the user's first real zoom/pan (see
  // setMapView) -- renderMap() re-centers on the current pins every time
  // while this is still false (so switching discipline before ever
  // touching the map re-centers on that discipline's own pins too), then
  // leaves mapView alone once the user's taken control, consistent with
  // the "never reset on re-render" behavior described above.
  let mapUserHasInteracted = false;
  let mapDrag = null; // { pointerId, lastClientX, lastClientY } while a drag is in progress

  function getMapSvg() {
    return document.querySelector("#map-container svg");
  }

  function clampMapView(view) {
    return clampMapViewPure(view, {
      maxW: mapMaxW(),
      minW: MAP_MIN_W,
      viewportAspect: mapViewportAspect(),
      mapHeight: mapData.height,
    });
  }

  function applyPinScale() {
    const scale = mapView.w / mapMaxW();
    document.querySelectorAll("#map-container [data-pin-country] circle").forEach(c => {
      c.setAttribute("r", PIN_BASE_R * scale);
      c.setAttribute("stroke-width", PIN_BASE_STROKE * scale);
    });
    document.querySelectorAll("#map-container [data-pin-country] text").forEach(t => {
      t.style.fontSize = `${PIN_BASE_FONT * scale}px`;
    });
  }

  function applyMapView() {
    const svg = getMapSvg();
    if (!svg) return;
    svg.setAttribute("viewBox", `${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`);
    applyPinScale();

    const zoomInBtn  = document.getElementById("map-zoom-in");
    const zoomOutBtn = document.getElementById("map-zoom-out");
    zoomInBtn.disabled  = mapView.w <= MAP_MIN_W + MAP_VIEW_EPS;
    zoomOutBtn.disabled = mapView.w >= mapMaxW() - MAP_VIEW_EPS;

    document.getElementById("map-pan-up").disabled    = mapView.y <= MAP_VIEW_EPS;
    document.getElementById("map-pan-down").disabled  = mapView.y >= mapData.height - mapView.h - MAP_VIEW_EPS;
    document.getElementById("map-pan-left").disabled  = mapView.x <= MAP_VIEW_EPS;
    document.getElementById("map-pan-right").disabled = mapView.x >= MAP_WIDTH - mapView.w - MAP_VIEW_EPS;
  }

  function setMapView(view) {
    mapUserHasInteracted = true;
    mapView = clampMapView(view);
    applyMapView();
    closePinPopover();
  }

  // Crossing the narrow/wide breakpoint (window resize, orientation
  // change) changes mapMaxW()/mapViewportAspect() -- reset to the fresh
  // default for the new shape rather than leaving mapView locked to
  // whatever aspect was current when the user last zoomed/panned, which
  // would otherwise never self-correct. No-op before any variant has
  // ever loaded (mapData null) -- nothing to resize yet.
  mapNarrowQuery.addEventListener("change", () => {
    if (!mapData) return;
    mapView = defaultMapView();
    applyMapView();
    closePinPopover();
  });

  // Keeps (cx, cy) fixed in place on screen while the view scales around
  // it -- centered zoom for the buttons (cx/cy omitted below), cursor-
  // anchored zoom for the wheel (cx/cy = pointer position), same as any
  // map UI. See client/map-geometry.js's computeZoomedView for the
  // over-zoom-drift rationale behind clamping inline before applying it.
  function zoomMapBy(factor, cx, cy) {
    if (cx === undefined) cx = mapView.x + mapView.w / 2;
    if (cy === undefined) cy = mapView.y + mapView.h / 2;
    setMapView(computeZoomedView(mapView, factor, cx, cy, {
      maxW: mapMaxW(),
      minW: MAP_MIN_W,
      viewportAspect: mapViewportAspect(),
    }));
  }

  function panMapBy(dx, dy) {
    setMapView(panView(mapView, dx, dy));
  }

  // Client-pixel <-> viewBox-user-space conversions, both needed because
  // the map scales with its container (w-full h-auto) and the ratio
  // between rendered pixels and user-space units changes with both
  // viewport width and the current zoom level.
  function mapClientDeltaToUserSpace(svg, dxClient, dyClient) {
    return mapClientDeltaToUserSpacePure(svg.getBoundingClientRect(), mapView, dxClient, dyClient);
  }
  function mapClientPointToUserSpace(svg, clientX, clientY) {
    return mapClientPointToUserSpacePure(svg.getBoundingClientRect(), mapView, clientX, clientY);
  }

  function endMapDrag(e) {
    if (!mapDrag || e.pointerId !== mapDrag.pointerId) return;
    mapDrag = null;
    const svg = getMapSvg();
    if (svg) { svg.classList.remove("cursor-grabbing"); svg.classList.add("cursor-grab"); }
  }
  // Bound once at module scope, not inside renderMap() -- a drag can
  // legitimately move the pointer outside the SVG's bounds mid-gesture,
  // so these have to listen on the document rather than the (regularly
  // recreated) SVG element itself.
  document.addEventListener("pointermove", e => {
    if (!mapDrag || e.pointerId !== mapDrag.pointerId) return;
    const svg = getMapSvg();
    if (!svg) return;
    const { dx, dy } = mapClientDeltaToUserSpace(svg, e.clientX - mapDrag.lastClientX, e.clientY - mapDrag.lastClientY);
    mapDrag.lastClientX = e.clientX;
    mapDrag.lastClientY = e.clientY;
    panMapBy(-dx, -dy);
  });
  document.addEventListener("pointerup", endMapDrag);
  document.addEventListener("pointercancel", endMapDrag);

  document.getElementById("map-zoom-in").addEventListener("click", () => zoomMapBy(1.6));
  document.getElementById("map-zoom-out").addEventListener("click", () => zoomMapBy(1 / 1.6));
  document.getElementById("map-pan-up").addEventListener("click", () => panMapBy(0, -mapView.h * 0.25));
  document.getElementById("map-pan-down").addEventListener("click", () => panMapBy(0, mapView.h * 0.25));
  document.getElementById("map-pan-left").addEventListener("click", () => panMapBy(-mapView.w * 0.25, 0));
  document.getElementById("map-pan-right").addEventListener("click", () => panMapBy(mapView.w * 0.25, 0));

  const mapVariantSelect = document.getElementById("map-variant-select");
  mapVariantSelect.addEventListener("change", () => setActiveMapVariant(mapVariantSelect.value));

  // ── World map: pin popover (#18) ──────────────────────────────────────
  // Reuses the exact same flash/send/project categories the subtitle stat
  // line shows (flashLabel/sendLabel included), just scoped to one
  // country instead of every logged entry.
  function countryStatusBreakdown(countryName) {
    const entries = store.getEntries().filter(e => e.type === store.getActiveType() && entryLocation(e).country === countryName);
    return {
      flashes:  entries.filter(e => e.status === "send" && e.firstAttempt).length,
      sends:    entries.filter(e => e.status === "send" && !e.firstAttempt).length,
      projects: entries.filter(e => e.status === "project").length,
    };
  }

  function renderPinPopoverContent(countryName) {
    const c = COUNTRY_BY_NAME[countryName];
    const { flashes, sends, projects } = countryStatusBreakdown(countryName);
    // Reuses STATUS_ICONS/STATUS_ICON_CLASS's icon markup, same as the
    // table's own statusBadge() -- just a smaller icon size to fit a
    // compact popover row.
    const statRow = (icon, title, n, singular, plural) => `
      <div class="flex items-center gap-[.45rem]">
        <span class="inline-flex align-middle shrink-0 cursor-default [&_svg]:w-[1.1rem] [&_svg]:h-[1.1rem]" title="${escapeHtml(title)}">${icon}</span>
        <span><span class="text-foreground font-semibold">${n}</span> <span class="text-muted">${n === 1 ? singular : plural}</span></span>
      </div>`;
    return `
      <div class="flex items-center justify-between gap-3 mb-[.5rem]">
        <span class="font-semibold text-foreground flex items-center gap-[.35rem]">
          ${c ? `<span role="img" aria-label="${escapeHtml(c.name)}">${escapeHtml(c.flag)}</span>` : ""}
          ${escapeHtml(countryName)}
        </span>
        <button type="button" class="bg-transparent border-0 text-muted cursor-pointer p-0 leading-none text-[1rem] hover:text-foreground" id="map-pin-popover-close" aria-label="Close">✕</button>
      </div>
      <div class="flex flex-col gap-[.35rem] text-[.82rem]">
        ${statRow(STATUS_ICONS.flash, flashLabel(store.getActiveType()), flashes, flashLabel(store.getActiveType()), flashLabel(store.getActiveType(), true))}
        ${statRow(STATUS_ICONS.send, sendLabel(store.getActiveType()), sends, sendLabel(store.getActiveType()), sendLabel(store.getActiveType(), true))}
        ${statRow(STATUS_ICONS.project, "Project", projects, "Project", "Projects")}
      </div>`;
  }

  let pinPopoverCleanup = null; // floating-ui autoUpdate teardown for the currently-open popover, if any
  let activePinCountry = null;

  function openPinPopover(pinEl, countryName) {
    const popover = document.getElementById("map-pin-popover");
    activePinCountry = countryName;
    popover.innerHTML = renderPinPopoverContent(countryName);
    popover.hidden = false;
    document.getElementById("map-pin-popover-close").addEventListener("click", closePinPopover);

    if (pinPopoverCleanup) pinPopoverCleanup();
    pinPopoverCleanup = autoUpdate(pinEl, popover, () => {
      computePosition(pinEl, popover, {
        strategy: "fixed",
        placement: "top",
        middleware: [offset(10), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(popover.style, { left: `${x}px`, top: `${y}px` });
      });
    });
  }

  function closePinPopover() {
    if (!activePinCountry) return;
    activePinCountry = null;
    document.getElementById("map-pin-popover").hidden = true;
    if (pinPopoverCleanup) { pinPopoverCleanup(); pinPopoverCleanup = null; }
  }

  function togglePinPopover(pinEl) {
    const country = pinEl.dataset.pinCountry;
    if (activePinCountry === country) closePinPopover();
    else openPinPopover(pinEl, country);
  }

  document.addEventListener("click", e => {
    if (activePinCountry && !e.target.closest("#map-pin-popover") && !e.target.closest("[data-pin-country]")) {
      closePinPopover();
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && activePinCountry) closePinPopover();
  });

  function renderMap() {
    closePinPopover();

    const variant = getActiveMapVariant();
    mapVariantSelect.value = variant;

    const typeEntries = store.getEntries().filter(e => e.type === store.getActiveType());

    const countsByCountry = new Map();
    for (const entry of typeEntries) {
      const country = entryLocation(entry).country;
      if (!country) continue;
      countsByCountry.set(country, (countsByCountry.get(country) ?? 0) + 1);
    }

    const container = document.getElementById("map-container");
    const zoomControls = document.getElementById("map-zoom-controls");
    const panControls = document.getElementById("map-pan-controls");

    if (countsByCountry.size === 0) {
      container.innerHTML = `<p class="text-[.9rem] text-muted">No ${DISCIPLINE_LABEL[store.getActiveType()]} entries logged yet -- log one to see it on the map.</p>`;
      zoomControls.hidden = true;
      panControls.hidden = true;
      return;
    }

    // #169: the active variant's data might not be loaded yet -- kick off
    // (or join) its fetch and paint a loading/error state in the
    // meantime rather than the map itself. ensureMapVariantLoading()
    // re-invokes renderMap() once the fetch settles.
    if (!mapDataCache.has(variant)) {
      mapData = null;
      zoomControls.hidden = true;
      panControls.hidden = true;

      // A previous attempt's failure is a stopping point, not a retry
      // trigger -- only the explicit Retry click below clears
      // mapLoadError and re-enters the fetch branch. Calling
      // ensureMapVariantLoading() unconditionally here would restart the
      // fetch on every single renderMap() call this error state's own
      // render() triggers (any state change repaints the whole app),
      // which very quickly becomes an unthrottled retry loop hammering
      // the server -- confirmed while testing this exact failure path.
      if (mapLoadError) {
        container.innerHTML = `
          <div class="bg-surface border border-border rounded-app p-6 mb-5 text-center">
            <p class="text-[.85rem] text-muted mb-3">You need to be online to view the map.</p>
            <button type="button" class="text-[.85rem] font-semibold text-accent bg-transparent border-0 cursor-pointer hover:underline" id="map-load-retry">Retry</button>
          </div>`;
        document.getElementById("map-load-retry").addEventListener("click", () => {
          mapLoadError = null;
          renderMap();
        });
      } else {
        ensureMapVariantLoading(variant);
        container.innerHTML = `
          <div class="bg-surface border border-border rounded-app p-6 mb-5 text-center">
            <p class="text-[.85rem] text-muted mb-2" id="map-load-progress-label">Loading map…</p>
            <div class="h-1.5 bg-border rounded-full overflow-hidden">
              <div class="h-full bg-accent transition-[width] duration-150" id="map-load-progress-bar" style="width: 0%"></div>
            </div>
          </div>`;
        updateMapLoadProgressUI(mapLoadProgress);
      }
      return;
    }

    mapData = mapDataCache.get(variant);
    zoomControls.hidden = false;
    panControls.hidden = false;

    const pinnedCountries = mapData.pins.filter(c => countsByCountry.has(c.name));

    if (!mapUserHasInteracted || mapView === null) mapView = defaultMapView();

    const pins = pinnedCountries.map(c => {
      const count = countsByCountry.get(c.name);
      const label = `${c.name}: ${count} ${count === 1 ? "entry" : "entries"}`;
      return `
        <g class="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2" role="button" tabindex="0" data-pin-country="${escapeHtml(c.name)}" aria-label="${escapeHtml(label)}">
          <title>${escapeHtml(label)}</title>
          <circle cx="${c.x}" cy="${c.y}" r="${PIN_BASE_R}" class="fill-accent stroke-background" stroke-width="${PIN_BASE_STROKE}"></circle>
          <text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" class="fill-accent-foreground font-bold select-none" style="font-size: ${PIN_BASE_FONT}px">${count}</text>
        </g>`;
    }).join("");

    // The pins carry the same info visually via <title> tooltips, but
    // <title> on an SVG <g> isn't reliably exposed by screen readers the
    // way alt text is -- a plain sr-only list gives that a guaranteed,
    // simple text equivalent instead of depending on tooltip support.
    const srList = pinnedCountries.map(c =>
      `<li>${escapeHtml(c.name)}: ${countsByCountry.get(c.name)} ${countsByCountry.get(c.name) === 1 ? "entry" : "entries"}</li>`
    ).join("");

    container.innerHTML = `
      <div class="bg-surface border border-border rounded-app overflow-hidden mb-5">
        <svg viewBox="0 0 ${MAP_WIDTH} ${mapData.height}" role="img" aria-label="World map of logged ${DISCIPLINE_LABEL[store.getActiveType()].toLowerCase()} entries by country" class="w-full h-auto block touch-none cursor-grab">
          <path d="${mapData.graticulePath}" class="stroke-border fill-none" stroke-width="0.5"></path>
          <path d="${mapData.worldLandPath}" class="fill-border stroke-none"></path>
          <path d="${mapData.countryBordersPath}" class="stroke-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-muted)_80%)] fill-none" stroke-width="0.35" stroke-linejoin="round"></path>
          ${pins}
        </svg>
      </div>
      <ul class="sr-only">${srList}</ul>`;

    // Re-bound every call since container.innerHTML above just replaced
    // the SVG element outright -- unlike the static zoom/pan buttons and
    // the document-level drag listeners above, this element genuinely
    // doesn't survive a re-render.
    const svg = getMapSvg();
    svg.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      // Starting a drag here would call setPointerCapture, which
      // retargets the pointer's later mouseup/click to the SVG itself --
      // that silently ate every pin click (the click handler's
      // e.target.closest("[data-pin-country]") never matched, since
      // e.target was the SVG, not the pin) until this check was added.
      // Skipping capture when the press starts on a pin lets that click
      // reach the pin-popover handler instead of beginning a map drag.
      if (e.target.closest("[data-pin-country]")) return;
      svg.setPointerCapture(e.pointerId);
      mapDrag = { pointerId: e.pointerId, lastClientX: e.clientX, lastClientY: e.clientY };
      svg.classList.remove("cursor-grab");
      svg.classList.add("cursor-grabbing");
    });
    svg.addEventListener("wheel", e => {
      e.preventDefault();
      const { x, y } = mapClientPointToUserSpace(svg, e.clientX, e.clientY);
      zoomMapBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y);
    }, { passive: false });

    applyMapView();
  }


  // ── Theme toggle (light/dark) ─────────────────────────────────────────
  // The actual theme is already set on <html> by the blocking inline
  // script in <head> (before first paint) -- this just wires up the
  // button to flip it and keeps the icon/label in sync.
  const SUN_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
  const MOON_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  function updateThemeToggleButton() {
    const theme = document.documentElement.dataset.theme;
    themeToggleBtn.innerHTML = theme === "light" ? MOON_ICON : SUN_ICON;
    themeToggleBtn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  }
  updateThemeToggleButton();
  themeToggleBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("logbook_theme", next);
    // Deferred, not called inline: updateThemeToggleButton() replaces this
    // button's innerHTML, which destroys whatever element the click
    // actually landed on (almost always the icon <svg> itself, not the
    // button). Doing that synchronously mid-bubble detaches e.target
    // before it reaches the header menu's document-level outside-click
    // listener (#123) -- a detached node's closest() can't find any
    // ancestor, including #header-menu-wrap, so the click reads as
    // "outside" and the menu closes right when it shouldn't.
    // queueMicrotask is NOT enough here: microtasks are checkpointed after
    // *each* listener invocation during event dispatch (per spec's "clean
    // up after running script"), not just once after the whole bubble
    // phase finishes -- confirmed empirically, a queued microtask still
    // ran before the next bubble-phase listener saw this event. setTimeout
    // defers to a genuinely later task, after the entire click (all
    // listeners, all elements) has finished dispatching.
    setTimeout(updateThemeToggleButton, 0);
  });

  // ── DOM refs ─────────────────────────────────────────────────────────
  const loginToggleBtn = document.getElementById("login-toggle-btn");
  const athleteModeBtn = document.getElementById("athlete-mode-btn");
  const addBtn      = document.getElementById("add-btn");
  const syncBtn     = document.getElementById("sync-btn");
  const syncBtnLabel = document.getElementById("sync-btn-label");
  const syncBtnIcon  = document.getElementById("sync-btn-icon");
  // filter-btn/filter-panel, the grade-range slider, collapse-all-btn, and
  // search now live in client/logbook-view.js (#235).
  const disciplineBtn = document.getElementById("discipline-btn");
  const disciplinePopover = document.getElementById("discipline-popover");
  const disciplineWrap = document.getElementById("discipline-wrap");
  const headerMenuWrap = document.getElementById("header-menu-wrap");
  const headerMenuBtn = document.getElementById("header-menu-btn");
  const headerMenuPopover = document.getElementById("header-menu-popover");
  const headerMenuBottomRow = document.getElementById("header-menu-bottom-row");
  const viewTabs = document.getElementById("view-tabs");
  const viewTabPyramid = document.getElementById("view-tab-pyramid");
  const panelLogbook = document.getElementById("panel-logbook");
  const panelPyramid = document.getElementById("panel-pyramid");
  const panelMap = document.getElementById("panel-map");

  const entryOverlay   = document.getElementById("entry-overlay");
  const entryForm      = document.getElementById("entry-form");
  const entryModalTitle= document.getElementById("entry-modal-title");
  const nameInput  = document.getElementById("entry-name");
  const placeBtn = document.getElementById("place-btn");
  const placeBtnFlag = document.getElementById("place-btn-flag");
  const placeBtnLabel = document.getElementById("place-btn-label");
  const placePopover = document.getElementById("place-popover");
  const placeSearch = document.getElementById("place-search");
  const placeListbox = document.getElementById("place-listbox");
  const placeAddNewBtn = document.getElementById("place-add-new-btn");
  const notesInput = document.getElementById("entry-notes");
  const videoInput = document.getElementById("entry-video");
  const gradeSelect = document.getElementById("grade-select");
  const gradePrev   = document.getElementById("grade-prev");
  const gradeNext   = document.getElementById("grade-next");
  const dateInput  = document.getElementById("entry-date");
  const dateNative = document.getElementById("date-native");
  const datePickerBtn = document.getElementById("date-picker-btn");
  const entrySubmitBtn = document.getElementById("entry-submit-btn");
  const entryDeleteBtn = document.getElementById("entry-delete-btn");
  const entryMsg      = document.getElementById("entry-msg");

  const notesOverlay  = document.getElementById("notes-overlay");
  const notesModalText = document.getElementById("notes-modal-text");
  const footnoteOverlay = document.getElementById("footnote-overlay");
  const citationsOverlay = document.getElementById("citations-overlay");
  const evidenceOverlay = document.getElementById("evidence-overlay");

  // ── Admin bar ────────────────────────────────────────────────────────
  function updateAdminBar() {
    loginToggleBtn.textContent = store.isLoggedIn() ? "Log out" : "Log in";
    addBtn.hidden = !store.isLoggedIn();
    athleteModeBtn.hidden = !store.isLoggedIn();
    athleteModeBtn.setAttribute("aria-checked", String(athleteMode));
    updateHeaderMenuDivider();
    updateSyncButton();

    // Grade Pyramid (a performance-reporting tab) requires BOTH being
    // logged in AND Athlete Mode on (#151) -- Athlete Mode alone isn't
    // enough since it's a publicly-readable setting, so gating on it
    // alone would let a logged-out visitor see it whenever the owner has
    // it toggled on for themselves. Logbook and Map stay unaffected by
    // either.
    viewTabPyramid.hidden = !(store.isLoggedIn() && athleteMode);
    if (viewTabPyramid.hidden && store.getActiveView() === "pyramid") setActiveView("logbook");

    // The tab bar itself only makes sense once there's something to
    // switch between -- hidden whenever fewer than 2 tabs are currently
    // visible. With Map always public alongside Logbook, that's now
    // permanently true, but the check stays generic rather than hardcoded.
    const visibleTabCount = viewTabs.querySelectorAll("[role=tab]:not([hidden])").length;
    viewTabs.hidden = visibleTabCount < 2;
  }

  function setActiveView(view) {
    store.setActiveView(view);
    document.querySelectorAll("#view-tabs [role=tab]").forEach(t =>
      t.setAttribute("aria-selected", String(t.dataset.view === view))
    );
    panelLogbook.hidden = view !== "logbook";
    panelPyramid.hidden = view !== "pyramid";
    panelMap.hidden = view !== "map";
    if (view !== "map") closePinPopover();
    if (view === "pyramid") renderPyramid();
    if (view === "map") renderMap();
  }

  viewTabs.addEventListener("click", e => {
    const tab = e.target.closest("[role=tab]");
    if (tab) setActiveView(tab.dataset.view);
  });

  // Set (not directly via store.setActiveType()) by fetchSettings() below,
  // then applied in boot() after both it and the entries load are known
  // complete -- both requests run concurrently with a real await in
  // between them (the entries fetch), so which one resolves first isn't
  // guaranteed. Calling store.setActiveType() straight from here would
  // race the has-entries heuristic in boot() and could get silently
  // clobbered if the heuristic happened to run second (#137).
  let persistedDiscipline = null;

  // Public visitors always see the effective settings (Athlete Mode off
  // by default, discipline from boot()'s has-entries heuristic by
  // default); only the logged-in admin sees a control to change either.
  // Covers both settings in one request rather than a separate fetch per
  // field (#137 folded discipline persistence into the same endpoint).
  async function fetchSettings() {
    try {
      const res = await fetch(SETTINGS_URL);
      const data = await res.json();
      if (!res.ok) return;
      athleteMode = !!data.athleteMode;
      // Validated defensively even though the server already validates on
      // write, since this is public data read back out of KV.
      if (data.activeDiscipline === "boulder" || data.activeDiscipline === "lead") {
        persistedDiscipline = data.activeDiscipline;
      }
    } catch {
      // Offline — keep the last-known in-memory defaults rather than
      // guessing; the Athlete Mode toggle is only interactive when logged
      // in, so a stale value there can't be acted on incorrectly, and the
      // discipline heuristic default already applied is a reasonable
      // fallback for the picker (which is usable while offline).
    }
  }

  athleteModeBtn.addEventListener("click", async () => {
    const next = !athleteMode;
    athleteModeBtn.disabled = true;
    try {
      const res = await adminFetch(ADMIN_SETTINGS_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athleteMode: next }),
      });
      if (res.status === 401 || isAuthRedirect(res)) {
        // Access session lapsed since page load — same handling as
        // syncPending()'s 401 case: drop back to the logged-out view.
        store.setLoggedIn(false);
      } else if (res.ok) {
        const data = await res.json();
        athleteMode = !!data.athleteMode;
        athleteModeBtn.title = "";
      } else {
        athleteModeBtn.title = `Failed to update Athlete Mode (${res.status})`;
      }
    } catch (err) {
      athleteModeBtn.title = `Failed to update Athlete Mode: ${err.message}`;
    } finally {
      athleteModeBtn.disabled = false;
      updateAdminBar();
    }
  });

  // Cloudflare Access gates /logbook/api/admin/* at Cloudflare's edge, so
  // "logged in" just means "the session fetch below wasn't intercepted by
  // Access's own hosted login page." A genuine network failure (offline)
  // is distinguished from "not authenticated" so the offline-queue hint
  // doesn't get mistaken for a real session.
  async function checkSession() {
    let res;
    try {
      res = await adminFetch(ADMIN_SESSION_URL);
    } catch {
      // Offline — fall back to the last known login state so the UI
      // still shows edit affordances; writes still get verified for
      // real by Access once synced.
      store.setLoggedIn(localStorage.getItem(LOGIN_HINT_KEY) === "1");
      return;
    }
    try {
      const data = await res.json();
      store.setLoggedIn(res.ok && !!data.loggedIn);
    } catch {
      // Access intercepted with its own hosted login page (non-JSON) —
      // not logged in.
      store.setLoggedIn(false);
    }
    localStorage.setItem(LOGIN_HINT_KEY, store.isLoggedIn() ? "1" : "0");
  }

  loginToggleBtn.addEventListener("click", () => {
    if (store.isLoggedIn()) {
      window.location.href = ACCESS_LOGOUT_URL;
    } else {
      // Full-page navigation (not fetch) so Cloudflare Access's hosted
      // login redirect can actually complete; it bounces back to the app
      // once you're authenticated.
      window.location.href = ADMIN_LOGIN_URL;
    }
  });

  syncBtn.addEventListener("click", syncPending);
  window.addEventListener("online", () => { if (store.isLoggedIn()) syncPending(); });

  // ── Shared UI helper: disclosure popovers (#171) ───────────────────────
  // Common trigger-button + panel interaction (open, close, close on
  // outside click, close on Escape + refocus the trigger) shared by every
  // dropdown-style popover in this app -- discipline picker, header menu,
  // place picker, add-place country picker, and the status filter panel.
  // Extracted after a code review found five near-identical hand-rolled
  // copies, one of which (the filter panel) had silently diverged and
  // dropped its Escape handler entirely.
  //
  // escapeTarget defaults to `document`, correct for popovers that aren't
  // nested inside a modal (discipline picker, header menu, filter panel).
  // Pass a specific element -- in practice the popover's own search input
  // -- for a popover that lives inside a modal (place picker, add-place
  // country picker): Escape has to bind there instead, with
  // stopPropagation/preventDefault, so it closes only this popover rather
  // than also reaching the modal's own document-level Escape handler.
  // (Separate document keydown listeners all fire independently of each
  // other regardless of stopPropagation on the event itself -- binding at
  // document level here would close the whole modal too, not just this
  // popover.)
  //
  // onOpen is an optional extra callback for popovers that do more than
  // just reveal the panel on open (the two search-based pickers reset
  // their query, re-render options, and refocus the search input).
  function createDisclosure(trigger, panel, containerSelector, { escapeTarget = document, onOpen } = {}) {
    function open() {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (onOpen) onOpen();
    }
    function close() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
    trigger.addEventListener("click", () => { if (panel.hidden) open(); else close(); });
    document.addEventListener("click", e => {
      if (!panel.hidden && !e.target.closest(containerSelector)) close();
    });
    escapeTarget.addEventListener("keydown", e => {
      if (e.key !== "Escape" || panel.hidden) return;
      if (escapeTarget !== document) { e.preventDefault(); e.stopPropagation(); }
      close();
      trigger.focus();
    });
    return { open, close };
  }

  // ── Entry form: place picker (#158) ───────────────────────────────
  // Trigger-button + popover, same interaction pattern as the country
  // picker it replaces (which followed discipline-btn/discipline-popover
  // and filter-btn/filter-panel). Each option joins a Place against its
  // Location -- country lives on Location now, not duplicated per Place
  // (a flat { location, area, country } triple wasn't actually 3NF: see
  // #158). Selecting an option sets placeId atomically; there's no way
  // to combine a mismatched location/area/country anymore, unlike the
  // old free-text Location/Area inputs this replaces.
  const PLACE_PLACEHOLDER_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"></path></svg>`;
  let placeCommittedValue = ""; // the committed placeId, "" if none
  let placeFilteredList = [];
  let placeActiveIndex = -1;

  function placeOptionId(i) { return `place-option-${i}`; }

  // Every selectable Place, joined against its Location, sorted by
  // location then area -- rebuilt on each render rather than cached,
  // since the place/location lists are nowhere near COUNTRIES' 247 rows.
  function joinedPlaces() {
    return store.getPlaces().map(p => {
      const loc = locationOf(p);
      return { id: p.id, location: loc.name, area: p.area, country: loc.country };
    }).sort((a, b) => a.location.localeCompare(b.location) || a.area.localeCompare(b.area));
  }

  function updatePlaceActiveDescendant() {
    placeSearch.setAttribute("aria-activedescendant", placeActiveIndex >= 0 ? placeOptionId(placeActiveIndex) : "");
    placeListbox.querySelectorAll("[role=option]").forEach((el, i) =>
      el.classList.toggle("bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]", i === placeActiveIndex));
    placeListbox.querySelector(`#${placeOptionId(placeActiveIndex)}`)?.scrollIntoView({ block: "nearest" });
  }

  function renderPlaceOptions(filterText) {
    const q = filterText.trim().toLowerCase();
    const all = joinedPlaces();
    placeFilteredList = q
      ? all.filter(p => p.location.toLowerCase().includes(q) || p.area.toLowerCase().includes(q))
      : all;
    placeActiveIndex = placeFilteredList.length ? 0 : -1;
    placeListbox.innerHTML = placeFilteredList.length
      ? placeFilteredList.map((p, i) => {
          const c = COUNTRY_BY_NAME[p.country];
          const flag = c ? escapeHtml(c.flag) : PLACE_PLACEHOLDER_ICON;
          const label = p.area ? `${escapeHtml(p.location)}, ${escapeHtml(p.area)}` : escapeHtml(p.location);
          return `
          <li id="${placeOptionId(i)}" role="option" data-id="${escapeHtml(p.id)}" aria-selected="${p.id === placeCommittedValue}" class="flex items-center justify-between gap-[.5rem] px-[.6rem] py-[.5rem] rounded-[calc(var(--radius-app)-2px)] cursor-pointer text-[.9rem] text-foreground hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible">
            <span class="flex items-center gap-[.5rem] min-w-0"><span class="flex items-center justify-center shrink-0" aria-hidden="true">${flag}</span><span class="truncate">${label}</span></span>
            <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
          </li>`;
        }).join("")
      : `<li class="px-[.6rem] py-[.5rem] text-[.85rem] text-muted">No matches</li>`;
    updatePlaceActiveDescendant();
  }

  // Reflects the committed value into the trigger button.
  function setPlace(placeId) {
    const p = store.getPlaces().find(x => x.id === placeId);
    placeCommittedValue = p ? placeId : "";
    if (!p) {
      placeBtn.setAttribute("aria-label", "Place: none selected");
      placeBtnFlag.innerHTML = PLACE_PLACEHOLDER_ICON;
      placeBtnLabel.textContent = "Select a place…";
      placeBtnLabel.classList.add("text-muted");
      return;
    }
    const loc = locationOf(p);
    const c = COUNTRY_BY_NAME[loc.country];
    const label = p.area ? `${loc.name}, ${p.area}` : loc.name;
    placeBtn.setAttribute("aria-label", `Place: ${label}`);
    placeBtnFlag.innerHTML = c ? escapeHtml(c.flag) : PLACE_PLACEHOLDER_ICON;
    placeBtnLabel.textContent = label;
    placeBtnLabel.classList.remove("text-muted");
  }

  // Escape is bound to placeSearch, not document -- see createDisclosure's
  // own header comment for why (this popover lives inside the entry
  // modal).
  const { close: closePlacePopover } = createDisclosure(placeBtn, placePopover, "#place-wrap", {
    escapeTarget: placeSearch,
    onOpen() {
      // Always starts from a fresh, unfiltered search, not whatever was
      // last typed -- matches every other search-to-filter control in this
      // app, none of which remember a stale query across opens.
      placeSearch.value = "";
      renderPlaceOptions("");
      placeSearch.focus();
    },
  });

  placeSearch.addEventListener("input", () => renderPlaceOptions(placeSearch.value));
  placeSearch.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (placeFilteredList.length) { placeActiveIndex = (placeActiveIndex + 1) % placeFilteredList.length; updatePlaceActiveDescendant(); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (placeFilteredList.length) { placeActiveIndex = (placeActiveIndex - 1 + placeFilteredList.length) % placeFilteredList.length; updatePlaceActiveDescendant(); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (placeActiveIndex >= 0) { setPlace(placeFilteredList[placeActiveIndex].id); closePlacePopover(); placeBtn.focus(); }
    }
  });
  placeListbox.addEventListener("click", e => {
    const opt = e.target.closest("[role=option][data-id]");
    if (!opt) return;
    setPlace(opt.dataset.id);
    closePlacePopover();
    placeBtn.focus();
  });
  placeAddNewBtn.addEventListener("click", () => {
    closePlacePopover();
    openAddPlaceModal();
  });

  // ── Entry form: add-place modal (#158) ────────────────────────────
  // Stacks on top of entry-overlay. Branches on whether the typed
  // Location exactly matches (case-insensitive) an existing one: if so,
  // Country auto-fills and locks -- inherited, not re-askable, which is
  // the entire reason Location was split out from Place (a location's
  // country can now only ever be set once, never re-typed per area, so
  // it can't drift again). If not, Country stays open for picking, same
  // interaction pattern as the place picker's own (search + listbox with
  // a checkmark on the selected row), just shown in full "[flag] name"
  // text rather than icon-only -- these fields are stacked vertically
  // with no width constraint forcing that compromise.
  const addPlaceOverlay = document.getElementById("add-place-overlay");
  const addPlaceForm = document.getElementById("add-place-form");
  const addPlaceLocationInput = document.getElementById("add-place-location");
  const addPlaceAreaInput = document.getElementById("add-place-area");
  const addPlaceCountryBtn = document.getElementById("add-place-country-btn");
  const addPlaceCountryFlag = document.getElementById("add-place-country-flag");
  const addPlaceCountryLabel = document.getElementById("add-place-country-label");
  const addPlaceCountryPopover = document.getElementById("add-place-country-popover");
  const addPlaceCountrySearch = document.getElementById("add-place-country-search");
  const addPlaceCountryListbox = document.getElementById("add-place-country-listbox");
  const addPlaceCountryHint = document.getElementById("add-place-country-hint");
  const addPlaceSubmitBtn = document.getElementById("add-place-submit-btn");
  const addPlaceMsg = document.getElementById("add-place-msg");

  let addPlaceCountryCommitted = ""; // committed country name, "" if none
  let addPlaceCountryFiltered = COUNTRIES;
  let addPlaceCountryActiveIndex = -1;
  let addPlaceMatchedLocation = null; // the existing Location the typed name matches, or null

  function findMatchingLocation(name) {
    const q = name.trim().toLowerCase();
    if (!q) return null;
    return store.getLocations().find(l => l.name.toLowerCase() === q) ?? null;
  }

  function addPlaceCountryOptionId(i) { return `add-place-country-option-${i}`; }

  function updateAddPlaceCountryActiveDescendant() {
    addPlaceCountrySearch.setAttribute("aria-activedescendant", addPlaceCountryActiveIndex >= 0 ? addPlaceCountryOptionId(addPlaceCountryActiveIndex) : "");
    addPlaceCountryListbox.querySelectorAll("[role=option]").forEach((el, i) =>
      el.classList.toggle("bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]", i === addPlaceCountryActiveIndex));
    addPlaceCountryListbox.querySelector(`#${addPlaceCountryOptionId(addPlaceCountryActiveIndex)}`)?.scrollIntoView({ block: "nearest" });
  }

  function renderAddPlaceCountryOptions(filterText) {
    const q = filterText.trim().toLowerCase();
    addPlaceCountryFiltered = q ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q)) : COUNTRIES;
    addPlaceCountryActiveIndex = addPlaceCountryFiltered.length ? 0 : -1;
    addPlaceCountryListbox.innerHTML = addPlaceCountryFiltered.length
      ? addPlaceCountryFiltered.map((c, i) => `
          <li id="${addPlaceCountryOptionId(i)}" role="option" data-name="${escapeHtml(c.name)}" aria-selected="${c.name === addPlaceCountryCommitted}" class="flex items-center justify-between gap-[.5rem] px-[.6rem] py-[.5rem] rounded-[calc(var(--radius-app)-2px)] cursor-pointer text-[.9rem] text-foreground hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible">
            <span class="flex items-center gap-[.5rem] min-w-0"><span aria-hidden="true">${escapeHtml(c.flag)}</span><span class="truncate">${escapeHtml(c.name)}</span></span>
            <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
          </li>`).join("")
      : `<li class="px-[.6rem] py-[.5rem] text-[.85rem] text-muted">No matches</li>`;
    updateAddPlaceCountryActiveDescendant();
  }

  function setAddPlaceCountry(name) {
    addPlaceCountryCommitted = COUNTRY_BY_NAME[name] ? name : "";
    const c = COUNTRY_BY_NAME[addPlaceCountryCommitted];
    addPlaceCountryBtn.setAttribute("aria-label", c ? `Country: ${c.name}` : "Country: none selected");
    addPlaceCountryFlag.innerHTML = c ? escapeHtml(c.flag) : PLACE_PLACEHOLDER_ICON;
    addPlaceCountryLabel.textContent = c ? c.name : "Select a country…";
    addPlaceCountryLabel.classList.toggle("text-muted", !c);
  }

  // No explicit addPlaceCountryBtn.disabled guard needed here -- a real
  // disabled <button> never dispatches click events in the first place,
  // so createDisclosure's trigger listener below simply never fires
  // while it's locked (see setAddPlaceCountry/updateAddPlaceLocationMatch
  // for where .disabled gets toggled).
  const { close: closeAddPlaceCountryPopover } = createDisclosure(addPlaceCountryBtn, addPlaceCountryPopover, "#add-place-country-wrap", {
    escapeTarget: addPlaceCountrySearch,
    onOpen() {
      addPlaceCountrySearch.value = "";
      renderAddPlaceCountryOptions("");
      addPlaceCountrySearch.focus();
    },
  });

  addPlaceCountrySearch.addEventListener("input", () => renderAddPlaceCountryOptions(addPlaceCountrySearch.value));
  addPlaceCountrySearch.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (addPlaceCountryFiltered.length) { addPlaceCountryActiveIndex = (addPlaceCountryActiveIndex + 1) % addPlaceCountryFiltered.length; updateAddPlaceCountryActiveDescendant(); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (addPlaceCountryFiltered.length) { addPlaceCountryActiveIndex = (addPlaceCountryActiveIndex - 1 + addPlaceCountryFiltered.length) % addPlaceCountryFiltered.length; updateAddPlaceCountryActiveDescendant(); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (addPlaceCountryActiveIndex >= 0) { setAddPlaceCountry(addPlaceCountryFiltered[addPlaceCountryActiveIndex].name); closeAddPlaceCountryPopover(); addPlaceCountryBtn.focus(); }
    }
  });
  addPlaceCountryListbox.addEventListener("click", e => {
    const opt = e.target.closest("[role=option][data-name]");
    if (!opt) return;
    setAddPlaceCountry(opt.dataset.name);
    closeAddPlaceCountryPopover();
    addPlaceCountryBtn.focus();
  });

  function updateAddPlaceLocationMatch() {
    addPlaceMatchedLocation = findMatchingLocation(addPlaceLocationInput.value);
    if (addPlaceMatchedLocation) {
      setAddPlaceCountry(addPlaceMatchedLocation.country);
      addPlaceCountryBtn.disabled = true;
      closeAddPlaceCountryPopover();
      addPlaceCountryHint.hidden = false;
    } else {
      addPlaceCountryBtn.disabled = false;
      addPlaceCountryHint.hidden = true;
      // Doesn't reset a country the user may have already picked before
      // the match broke (e.g. a typo mid-edit) -- still a normal
      // editable field at that point, not a locked one, so leaving it in
      // place is less disruptive than wiping it and forcing a re-pick.
    }
  }
  addPlaceLocationInput.addEventListener("input", updateAddPlaceLocationMatch);

  function openAddPlaceModal() {
    addPlaceForm.reset();
    addPlaceMsg.className = "hidden";
    addPlaceMatchedLocation = null;
    setAddPlaceCountry("");
    addPlaceCountryBtn.disabled = false;
    addPlaceCountryHint.hidden = true;
    document.getElementById("add-place-location-list").innerHTML =
      [...new Set(store.getLocations().map(l => l.name))].sort().map(n => `<option value="${escapeHtml(n)}">`).join("");
    openModal(addPlaceOverlay);
  }
  document.getElementById("add-place-close").addEventListener("click", () => closeModal(addPlaceOverlay));
  addPlaceOverlay.addEventListener("click", e => { if (e.target === addPlaceOverlay) closeModal(addPlaceOverlay); });

  function showAddPlaceError(text) {
    addPlaceMsg.textContent = text;
    addPlaceMsg.className = "mt-[.85rem] px-4 py-3 rounded-app text-[.9rem] bg-[color-mix(in_srgb,#f87171_12%,var(--color-surface))] border border-[color-mix(in_srgb,#f87171_40%,transparent)] text-red-400";
  }

  addPlaceForm.addEventListener("submit", async e => {
    e.preventDefault();
    addPlaceSubmitBtn.disabled = true;
    addPlaceMsg.className = "hidden";

    const locationName = addPlaceLocationInput.value.trim();
    const area = addPlaceAreaInput.value.trim();
    const matched = findMatchingLocation(locationName);

    // Minted up front regardless of online/offline outcome -- same
    // rationale as entry IDs: an offline-queued write needs a stable
    // identity from the moment it's created, not just once it syncs.
    const location = matched ?? { id: crypto.randomUUID(), name: locationName, country: addPlaceCountryCommitted };
    const place = { id: crypto.randomUUID(), locationId: location.id, area };

    let authLapsed = false;
    const queue = getQueue();

    if (!matched) {
      try {
        const res = await adminFetch(ADMIN_LOCATIONS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(location),
        });
        if (isAuthRedirect(res)) throw new Error("not-authenticated");
        const data = await res.json();
        if (!res.ok) {
          // The server is reachable and rejected this -- a real
          // validation problem, not connectivity, so don't queue
          // something that would just fail again identically on retry.
          showAddPlaceError(data.error ?? `Error ${res.status}`);
          addPlaceSubmitBtn.disabled = false;
          return;
        }
        store.setLocations(data.locations);
      } catch (err) {
        if (err.message === "not-authenticated") authLapsed = true;
        // Offline, server unreachable, or the Access session lapsed --
        // queue the location, and the place right behind it below, same
        // dependency order the online path itself writes in.
        queue.push({ kind: "location", op: "add", record: location });
      }
    }

    const locationQueued = queue.some(item => item.kind === "location" && item.record.id === location.id);
    if (locationQueued) {
      // Already know this session is offline -- don't bother attempting
      // the place online too, just queue it right behind the location.
      queue.push({ kind: "place", op: "add", record: place });
    } else {
      try {
        const res = await adminFetch(ADMIN_PLACES_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(place),
        });
        if (isAuthRedirect(res)) throw new Error("not-authenticated");
        const data = await res.json();
        if (!res.ok) {
          showAddPlaceError(data.error ?? `Error ${res.status}`);
          addPlaceSubmitBtn.disabled = false;
          return;
        }
        store.setPlaces(data.places);
      } catch (err) {
        if (err.message === "not-authenticated") authLapsed = true;
        queue.push({ kind: "place", op: "add", record: place });
      }
    }

    if (authLapsed) {
      store.setLoggedIn(false);
      updateAdminBar();
    }
    setQueue(queue);
    applyPendingQueue(getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());
    setPlace(place.id);
    closeModal(addPlaceOverlay);
    addPlaceSubmitBtn.disabled = false;
  });

  // ── Entry form: labels (Problem/Route name, Flash/Onsight, Send/Redpoint) ──
  // The form no longer has its own type toggle -- an entry's type is
  // whichever tab was active when the form opened (store.getActiveType()),
  // since the table it was added/edited from is already scoped to that
  // type by construction.
  function updateFormStatusLabels() {
    document.getElementById("form-flash-label").textContent = flashLabel(store.getActiveType());
    document.getElementById("form-send-label").textContent = sendLabel(store.getActiveType());
    document.getElementById("form-name-label").textContent = nameLabel(store.getActiveType());
  }

  // ── Entry form: grade picker (dropdown + prev/next) ──────────────────
  let selectedGrade = "";
  function currentGrades() {
    return store.getActiveType() === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
  }
  function renderGradeOptions() {
    const boulder = store.getActiveType() === "boulder";
    gradeSelect.innerHTML = currentGrades()
      .map(({ g, v }) => `<option class="font-bold bg-surface text-foreground" value="${g}">${boulder ? `${g}/${v}` : g}</option>`)
      .join("");
  }
  function selectGradeByIndex(index) {
    const grades = currentGrades();
    const wrapped = ((index % grades.length) + grades.length) % grades.length;
    const { g, c } = grades[wrapped];
    selectedGrade = g;
    gradeSelect.value = g;
    gradeSelect.style.color = c;
  }
  function selectGradeByValue(value, type) {
    const grades = type === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
    const idx = grades.findIndex(({ g }) => g.toUpperCase() === String(value).toUpperCase());
    selectGradeByIndex(idx === -1 ? 0 : idx);
  }
  function currentGradeIndex() {
    const idx = currentGrades().findIndex(({ g }) => g === selectedGrade);
    return idx === -1 ? 0 : idx;
  }
  gradeSelect.addEventListener("change", () => selectGradeByIndex(
    currentGrades().findIndex(({ g }) => g === gradeSelect.value)
  ));
  gradePrev.addEventListener("click", () => selectGradeByIndex(currentGradeIndex() - 1));
  gradeNext.addEventListener("click", () => selectGradeByIndex(currentGradeIndex() + 1));

  // ── Entry form: status toggle (Flash = status send, flash=true) ─────
  let selectedStatus = "send";
  let isFlash = false;
  const statusGroup = document.getElementById("status-group");

  // Fades the edges of #status-group's horizontal scroll to hint there's
  // more content past them -- only on whichever side actually has more to
  // scroll to, so a screen wide enough to show every button gets no fade
  // at all (both edges read as "at start" and "at end" simultaneously).
  function updateStatusScrollFade() {
    const atStart = statusGroup.scrollLeft <= 1;
    const atEnd = statusGroup.scrollLeft + statusGroup.clientWidth >= statusGroup.scrollWidth - 1;
    const mask = `linear-gradient(to right, ${atStart ? "black" : "transparent"}, black 24px, black calc(100% - 24px), ${atEnd ? "black" : "transparent"})`;
    statusGroup.style.maskImage = mask;
    statusGroup.style.webkitMaskImage = mask;
  }
  statusGroup.addEventListener("scroll", updateStatusScrollFade);
  window.addEventListener("resize", updateStatusScrollFade);

  statusGroup.addEventListener("change", e => {
    if (e.target.name !== "entry-status") return;
    const value = e.target.value;
    selectedStatus = value === "flash" ? "send" : value;
    isFlash = value === "flash";
  });
  document.querySelectorAll("[data-icon]").forEach(el => {
    el.innerHTML = STATUS_ICONS[el.dataset.icon];
  });

  function setStatusToggle(status, flash) {
    const value = flash ? "flash" : status;
    document.querySelector(`#status-group input[value="${value}"]`).checked = true;
    selectedStatus = status;
    isFlash = flash;
  }

  // ── Entry form: date picker ──────────────────────────────────────────
  datePickerBtn.addEventListener("click", () => {
    const current = dateInput.value.trim();
    dateNative.value = /^\d{4}-\d{2}-\d{2}$/.test(current)
      ? current
      : /^\d{4}-\d{2}$/.test(current)
        ? `${current}-01`
        : new Date().toISOString().slice(0, 10);
    if (dateNative.showPicker) dateNative.showPicker();
    else dateNative.focus();
  });
  dateNative.addEventListener("change", () => {
    if (dateNative.value) dateInput.value = dateNative.value;
  });

  // ── Modal helpers: focus trap + Escape-to-close ──────────────────────
  let lastFocusedEl = null;
  function focusableEls(overlay) {
    return [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.disabled && el.offsetParent !== null);
  }
  function openModal(overlay) {
    lastFocusedEl = document.activeElement;
    overlay.hidden = false;
    overlay.scrollTop = 0;
    (focusableEls(overlay)[0] ?? overlay).focus();
  }
  function closeModal(overlay) {
    overlay.hidden = true;
    if (lastFocusedEl) lastFocusedEl.focus();
  }
  document.addEventListener("keydown", e => {
    // addPlaceOverlay listed before entryOverlay -- it can be open at the
    // same time, stacked on top (opened from the place picker without
    // closing the entry form behind it), and .find() takes the first
    // match, so this ordering makes Escape close the topmost overlay
    // first rather than jumping straight to the one underneath it.
    const openOverlay = [addPlaceOverlay, entryOverlay, notesOverlay, footnoteOverlay, citationsOverlay, evidenceOverlay].find(o => !o.hidden);
    if (!openOverlay) return;

    if (e.key === "Escape") {
      closeModal(openOverlay);
      return;
    }

    if (e.key === "Tab") {
      const focusable = focusableEls(openOverlay);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // ── Entry modal: open/close ──────────────────────────────────────────
  function openEntryModal(entry) {
    editingId = entry?.id ?? null;
    entryModalTitle.textContent = editingId ? "Edit entry" : "Add entry";
    entrySubmitBtn.textContent = editingId ? "Save changes" : "Add to logbook";
    entryDeleteBtn.hidden = !editingId;
    entryMsg.className = "hidden";

    nameInput.value  = entry?.name  ?? "";
    // Popover always reopens closed, regardless of whatever open/closed
    // state a previous modal session left it in.
    closePlacePopover();
    setPlace(entry?.placeId ?? "");
    notesInput.value = entry?.notes ?? "";
    videoInput.value = entry?.video ?? "";
    // Default to today only in add mode -- ?? alone can't distinguish "no
    // entry" from "entry has no date", and edit mode with the latter was
    // silently pre-filling today's date, which then got saved if the user
    // didn't notice and just clicked Save (#139).
    dateInput.value  = entry ? (entry.date ?? "") : new Date().toISOString().slice(0, 10);

    renderGradeOptions();
    if (entry) selectGradeByValue(entry.grade, entry.type);
    else selectGradeByIndex(0);
    updateFormStatusLabels();
    setStatusToggle(entry?.status ?? "send", Boolean(entry?.firstAttempt));

    openModal(entryOverlay);
    nameInput.focus();
    // scrollWidth/clientWidth both read as 0 while the modal is still
    // hidden -- wait a frame for it to actually paint before measuring.
    requestAnimationFrame(updateStatusScrollFade);
  }
  addBtn.addEventListener("click", () => openEntryModal(null));
  document.getElementById("entry-close").addEventListener("click", () => closeModal(entryOverlay));
  entryOverlay.addEventListener("click", e => { if (e.target === entryOverlay) closeModal(entryOverlay); });

  document.getElementById("notes-close").addEventListener("click", () => closeModal(notesOverlay));
  notesOverlay.addEventListener("click", e => { if (e.target === notesOverlay) closeModal(notesOverlay); });

  document.getElementById("footnote-trigger").addEventListener("click", () => openModal(footnoteOverlay));
  document.getElementById("footnote-close").addEventListener("click", () => closeModal(footnoteOverlay));
  footnoteOverlay.addEventListener("click", e => { if (e.target === footnoteOverlay) closeModal(footnoteOverlay); });

  document.getElementById("citations-close").addEventListener("click", () => closeModal(citationsOverlay));
  citationsOverlay.addEventListener("click", e => { if (e.target === citationsOverlay) closeModal(citationsOverlay); });

  document.getElementById("evidence-close").addEventListener("click", () => closeModal(evidenceOverlay));
  evidenceOverlay.addEventListener("click", e => { if (e.target === evidenceOverlay) closeModal(evidenceOverlay); });

  // ── Discipline picker (#110): header popover, always offers both
  // disciplines regardless of entry counts -- see the markup comment
  // above discipline-btn for why. Same interaction pattern as filter-btn/
  // filter-panel below (delegated click, close on outside click), plus
  // Escape-to-close via createDisclosure. ────────────────────────────────
  const { close: closeDisciplinePopover } = createDisclosure(disciplineBtn, disciplinePopover, "#discipline-wrap");

  disciplinePopover.addEventListener("click", async e => {
    const opt = e.target.closest(".discipline-option");
    if (!opt) return;
    // store.setActiveType() resets gradeRange itself (boulder and lead
    // grades aren't the same scale -- carrying a range like "6A-7B+" over
    // as some translated lead range would silently filter to something
    // the user didn't ask for, #161); lowerGradesExpanded stays local to
    // this section (Pyramid-only), so it's reset directly here.
    store.setActiveType(opt.dataset.discipline);
    lowerGradesExpanded = false;
    closeDisciplinePopover();
    disciplineBtn.focus();
    render();

    // Best-effort persistence (#137) -- PATCH is Access-gated (same
    // boundary as Athlete Mode), so this only actually persists when
    // logged in; a logged-out visitor's switch stays local, same as
    // every other admin-only write in this app. Never blocks or reverts
    // the local switch above either way -- offline/failure just means
    // it doesn't carry over to other devices this time.
    try {
      const res = await adminFetch(ADMIN_SETTINGS_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeDiscipline: store.getActiveType() }),
      });
      if (res.status === 401 || isAuthRedirect(res)) {
        store.setLoggedIn(false);
        updateAdminBar();
      }
    } catch {
      // Offline or network error -- local switch already applied.
    }
  });

  // ── Header menu (#119, #122, #138, #155): Athlete Mode, theme toggle,
  // and Log in/out live in this popover at every viewport width -- it
  // used to only collapse them in here below 480px (reparenting the DOM
  // nodes between the header row and here as the viewport crossed that
  // breakpoint), but the popover turned out to just be a better pattern
  // outright, not a narrow-viewport compromise, so it's used everywhere
  // now and the wide-row layout it used to also support is gone. The
  // discipline picker (disciplineWrap) is deliberately NOT part of this
  // popover (#138) -- with it collapsed, there was no visible indicator
  // anywhere of which discipline was active until the menu was opened.
  // It stays in the header row at all widths instead.
  // The bottom row's top divider only makes sense when something is
  // actually visible above it -- Athlete Mode is the only thing that can
  // occupy the top section, and it's hidden entirely when logged out
  // (updateAdminBar), which would otherwise leave the divider floating
  // above nothing (#138).
  function updateHeaderMenuDivider() {
    const hasTopContent = !athleteModeBtn.hidden;
    headerMenuBottomRow.classList.toggle("border-t", hasTopContent);
    headerMenuBottomRow.classList.toggle("pt-2", hasTopContent);
    headerMenuBottomRow.classList.toggle("mt-1", hasTopContent);
  }

  createDisclosure(headerMenuBtn, headerMenuPopover, "#header-menu-wrap");

  document.addEventListener("click", e => {
    const editBtn = e.target.closest(".edit-btn");
    if (editBtn) {
      const entry = store.getEntries().find(x => x.id === editBtn.dataset.editId);
      if (entry) openEntryModal(entry);
      return;
    }

    const notesBtn = e.target.closest(".notes-btn");
    if (notesBtn) {
      const entry = store.getEntries().find(x => x.id === notesBtn.dataset.notesId);
      if (entry) {
        notesModalText.textContent = entry.notes;
        openModal(notesOverlay);
      }
    }
  });

  // ── Entry form: submit (online → API, offline → queue) ──────────────
  entryForm.addEventListener("submit", async e => {
    e.preventDefault();
    entrySubmitBtn.disabled = true;
    entryMsg.className = "hidden";

    const name  = nameInput.value.trim();
    const entry = {
      id:     editingId ?? crypto.randomUUID(),
      // The committed value, not any in-progress popover search text --
      // same reasoning the old country picker had: whatever's mid-search
      // isn't necessarily a valid, or the intended, selection.
      placeId: placeCommittedValue,
      name,
      grade:  selectedGrade,
      type:   store.getActiveType(),
      status: selectedStatus,
      firstAttempt: isFlash,
      date:   dateInput.value.trim() || null,
      notes:  notesInput.value.trim() || null,
      video:  videoInput.value.trim() || null,
    };
    const op = editingId ? "edit" : "add";

    try {
      const res = await adminFetch(ADMIN_DATA_URL, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (isAuthRedirect(res)) throw new Error("not-authenticated");
      const data = await res.json();
      if (!res.ok) {
        entryMsg.textContent = data.error ?? `Error ${res.status}`;
        entryMsg.className = "mt-[.85rem] px-4 py-3 rounded-app text-[.9rem] bg-[color-mix(in_srgb,#f87171_12%,var(--color-surface))] border border-[color-mix(in_srgb,#f87171_40%,transparent)] text-red-400";
        entrySubmitBtn.disabled = false;
        return;
      }
      store.setEntries(data.entries);
      applyPendingQueue(getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());
      closeModal(entryOverlay);
      render();
    } catch (err) {
      // Offline, server unreachable, or the Access session lapsed (see
      // adminFetch above) — queue for later sync either way, and reflect
      // the change locally so it shows up right away.
      if (err.message === "not-authenticated") {
        store.setLoggedIn(false);
        updateAdminBar();
      }
      const queue = getQueue();
      const existingIdx = queue.findIndex(item => item.kind === "entry" && item.record.id === entry.id);
      if (existingIdx !== -1) queue[existingIdx] = { kind: "entry", op: queue[existingIdx].op, record: entry };
      else queue.push({ kind: "entry", op, record: entry });
      setQueue(queue);
      applyPendingQueue(getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());
      closeModal(entryOverlay);
      render();
    }

    entrySubmitBtn.disabled = false;
  });

  // ── Entry form: delete (online → API, offline → queue) ───────────────
  entryDeleteBtn.addEventListener("click", async () => {
    if (!editingId) return;
    if (!confirm(`Delete "${nameInput.value.trim()}"? This can't be undone.`)) return;

    entryDeleteBtn.disabled = true;
    entryMsg.className = "hidden";
    const id = editingId;
    const entrySnapshot = store.getEntries().find(e => e.id === id);

    // If this entry only ever existed as a queued, unsynced "add", there's
    // nothing on the server to delete — just drop it from the queue.
    const queuedAdd = getQueue().find(item => item.kind === "entry" && item.record.id === id && item.op === "add");
    if (queuedAdd) {
      setQueue(getQueue().filter(item => !(item.kind === "entry" && item.record.id === id)));
      store.setEntries(store.getEntries().filter(e => e.id !== id));
      closeModal(entryOverlay);
      entryDeleteBtn.disabled = false;
      render();
      return;
    }

    try {
      const res = await adminFetch(`${ADMIN_DATA_URL}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (isAuthRedirect(res)) throw new Error("not-authenticated");
      const data = await res.json();
      if (!res.ok) {
        entryMsg.textContent = data.error ?? `Error ${res.status}`;
        entryMsg.className = "mt-[.85rem] px-4 py-3 rounded-app text-[.9rem] bg-[color-mix(in_srgb,#f87171_12%,var(--color-surface))] border border-[color-mix(in_srgb,#f87171_40%,transparent)] text-red-400";
        entryDeleteBtn.disabled = false;
        return;
      }
      store.setEntries(data.entries);
      applyPendingQueue(getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());
      closeModal(entryOverlay);
      render();
    } catch (err) {
      // Offline, server unreachable, or the Access session lapsed (see
      // adminFetch above) — queue for later sync either way. Keep the
      // entry visible (marked pending-delete via applyPendingQueue)
      // rather than removing it locally; it only disappears once the
      // delete actually syncs.
      if (err.message === "not-authenticated") {
        store.setLoggedIn(false);
        updateAdminBar();
      }
      const queue = getQueue().filter(item => !(item.kind === "entry" && item.record.id === id));
      queue.push({ kind: "entry", op: "delete", record: entrySnapshot ?? { id } });
      setQueue(queue);
      applyPendingQueue(getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());
      closeModal(entryOverlay);
      render();
    }

    entryDeleteBtn.disabled = false;
  });

  // ── Event delegation (map pin) ────────────────────────────────────────
  // Table filter/sort/collapse/search delegation now lives in
  // client/logbook-view.js (#235) -- its own document-level click/change/
  // keydown listeners, coexisting with these independently (each checks
  // its own selectors and no-ops otherwise, same as when they were one
  // combined handler).
  document.addEventListener("click", e => {
    const pin = e.target.closest("[data-pin-country]");
    if (pin) togglePinPopover(pin);
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const pin = e.target.closest?.("[data-pin-country]");
    if (pin) {
      e.preventDefault();
      togglePinPopover(pin);
    }
  });

  // ── PWA: service worker ──────────────────────────────────────────────
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  async function boot() {
    renderGradeOptions();
    selectGradeByIndex(0);

    const sessionPromise = checkSession();
    const settingsPromise = fetchSettings();

    // Load data (fall back to last-cached entries when offline)
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      store.setEntries(data.entries ?? []);
    } catch (err) {
      if (!store.loadEntriesFromCache()) {
        document.getElementById("loading").innerHTML =
          `<div class="bg-[color-mix(in_srgb,#f87171_10%,var(--color-bg))] border border-[color-mix(in_srgb,#f87171_40%,transparent)] rounded-app px-5 py-4 text-foreground"><strong>Failed to load logbook data</strong><br>${escapeHtml(err.message)}</div>`;
        return;
      }
    }

    // Load places + locations (small collections; unlike entries, a
    // failure here shouldn't block the whole app -- placeOf()/
    // locationOf() already return safe empty defaults for anything that
    // fails to resolve, so entries/table rendering degrades gracefully
    // rather than hard-failing).
    try {
      const res = await fetch(PLACES_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      store.setPlaces(data.places ?? []);
    } catch {
      store.loadPlacesFromCache();
    }
    try {
      const res = await fetch(LOCATIONS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      store.setLocations(data.locations ?? []);
    } catch {
      store.loadLocationsFromCache();
    }

    // Applied once, after all three arrays are loaded -- applyPendingQueue()
    // touches entries/places/locations together, and calling it before
    // places/locations were fetched would just have its optimistic pushes
    // overwritten by the fetch assignments above.
    applyPendingQueue(getQueue(), store.getEntries(), store.getPlaces(), store.getLocations());

    // Default to whichever type actually has entries -- boulder wins if
    // both/neither do, matching the entry form's own default type.
    const hasBoulder = store.getEntries().some(e => e.type === "boulder");
    const hasLead = store.getEntries().some(e => e.type === "lead");
    store.setActiveType(hasBoulder || !hasLead ? "boulder" : "lead");

    // Sections default to collapsed on first load.
    store.setCollapsed(new Set(store.getEntries().map(e => placeOf(e).locationId)));

    await Promise.all([sessionPromise, settingsPromise]);

    // Persisted selection wins over boot()'s has-entries heuristic above,
    // applied here (not inside fetchSettings()) so the order is
    // deterministic regardless of which of the two concurrent requests
    // above happened to resolve first (#137).
    if (persistedDiscipline) store.setActiveType(persistedDiscipline);

    document.getElementById("loading").style.display = "none";
    document.getElementById("app").style.display = "";
    render();
  }

  boot();
