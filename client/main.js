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
import { BOULDER_GRADES, LEAD_GRADES } from "./grade-data.js";
import { formatDate, dateRank } from "./date-helpers.js";
import { flashLabel, sendLabel, nameLabel, statusBadge } from "./status.js";
import { applyPendingQueue } from "./offline-queue.js";
import { createStore } from "./store.js";
import { createLogbookView } from "./logbook-view.js";
import { createMapView } from "./map-view.js";
import { createPyramidView } from "./pyramid-view.js";

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
  // isLoggedIn all live behind store.*, not raw fields. athleteMode and
  // editingId stay local module `let`s here -- each is read/written by
  // exactly one section below (admin bar, entry form), so they'll move
  // into that section's own module in #238-#242 rather than the shared
  // Store now. (lowerGradesExpanded made the same call for the Grade
  // Pyramid section, and has since moved into client/pyramid-view.js,
  // #237.)
  const store = createStore();

  let athleteMode  = false;
  let editingId    = null; // null = add mode

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
    updateAdminBar();
    if (store.getActiveView() === "pyramid") pyramidView.render();
    if (store.getActiveView() === "map") mapView.render();
  }

  // ── Grade Pyramid (#12) -- see client/pyramid-view.js (#237). Owns
  // rendering the pyramid, the health-card message, and the citation/
  // evidence-tier modal triggers.
  const pyramidView = createPyramidView({ store, openModal });

  // ── World Map (#236) -- see client/map-view.js. Owns rendering, variant
  // loading/switching, zoom/pan/drag, and the pin popover.
  const mapView = createMapView({ store, COUNTRY_BY_NAME });

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
    if (view !== "map") mapView.closePinPopover();
    if (view === "pyramid") pyramidView.render();
    if (view === "map") mapView.render();
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
    // the user didn't ask for, #161); lowerGradesExpanded is now private
    // to client/pyramid-view.js (#237), so it's reset through that
    // module's own resetExpansion() instead of a direct field write.
    store.setActiveType(opt.dataset.discipline);
    pyramidView.resetExpansion();
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

  // Map-pin click/keydown delegation now lives in client/map-view.js
  // (#236), same as table filter/sort/collapse/search lives in
  // client/logbook-view.js (#235) -- each module owns its own
  // document-level listeners, coexisting independently.

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
