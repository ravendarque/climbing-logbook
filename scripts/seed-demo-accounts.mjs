// Seeds the three demo accounts with raw SQL: their names are reserved, so they can't sign up.
// Tags cluster so the Strengths and Injury reports have a real signal. Fixed IDs, so safe to re-run.
//   node scripts/seed-demo-accounts.mjs [--remote] [--env preview]
import { applyMigrations, d1ExecuteBatch } from "./lib/dev-session.mjs";
import { BOULDER_GRADES, DEFAULT_SCALE_BY_TYPE, LEAD_GRADES, SCALES } from "../shared/grade-data.js";
import { DEMO_PERSONAS } from "../shared/demo-personas.js";
import { PAIN_INJURY } from "../shared/health-consent.js";
import { hardestBetaMovements, movementRow } from "../server/lib/hardest-beta.js";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const envIdx = args.indexOf("--env");
const env = envIdx === -1 ? undefined : args[envIdx + 1];
const d1Options = { remote, env, database: env === "preview" ? "climbing-logbook-preview" : undefined };

function sqlStr(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}
function sqlBool(value) {
  return value ? "1" : "0";
}

const LOCATIONS = [
  { name: "Fontainebleau", country: "France" },
  { name: "Magic Wood", country: "Switzerland" },
  { name: "Kalymnos", country: "Greece" },
  { name: "Rocklands", country: "South Africa" },
  { name: "Yosemite", country: "United States" },
  { name: "Margalef", country: "Spain" },
  { name: "Railay", country: "Thailand" },
  { name: "Arco", country: "Italy" },
];
const AREAS = [
  "Bas Cuvier",
  "Rocher Canon",
  "95.2",
  "New Base Camp",
  "Farmer Wall",
  "Grande Grotta",
  "Odyssey",
  "The Tiger",
  "The Amphitheatre",
  "Camp 4",
  "Sector 6",
  "Ton Sai Beach",
  "Massone",
];

const TIERS = {
  beginnerdemo: { boulderRange: [0, 6], sportRange: [0, 4], entriesPerDiscipline: 30 },
  intermediatedemo: { boulderRange: [3, 13], sportRange: [2, 10], entriesPerDiscipline: 60 },
  advanceddemo: { boulderRange: [6, 20], sportRange: [4, 14], entriesPerDiscipline: 120 },
};

// Pain tags cluster on one combination so the injury view's confidence gate clears.
const DOMINANT_MOVE_COMBO = {
  limb: "hand",
  side: "right",
  holdType: "crimp",
  movementStyle: "static",
  wallAngle: "overhang",
};
// The demo tells a story the Strengths report can find: strong on steep ground, weak on slab, slopers hard
// even on easy climbs, and crimps and heel hooks only hard at the limit.
const WALL_ANGLES_BY_BAND = {
  hard: ["overhang", "roof", "overhang", "dihedral"],
  middle: ["vert", "overhang", "vert", "chimney"],
  easy: ["slab", "overhang", "slab", "vert"],
};
const HARDEST_BETAS_BY_BAND = {
  hard: [
    "Right heel hook on the lip, cross left hand to a sidepull crimp, then deadpoint to the pinch",
    "Toe hook right, lock off on the half crimp and deadpoint left hand to the crimp",
    "Gaston the crimp with the right hand, flag left and deadpoint to the edge",
    "Left heel hook, squeeze the arête and deadpoint to the crimp",
    "Drop knee left, lock off and deadpoint to the two finger pocket",
  ],
  middle: [
    "Cross through to the jug, flag left and dyno to the jug",
    "Step through onto the right foot, smear and stand up to the jug",
    "Knee bar, hand jam and reach to the jug",
    "Bicycle the jug, cut loose and campus to the rail",
  ],
  easy: [
    "Mantle onto the sloper, palm down and rock over",
    "Smear both feet, squeeze the slopers and match on the sloper",
    "Smear, paddle left hand to the sloper and mantle",
    "Paddle along the slopers to the lip, then mantle",
    "Slopey sidepull, smear and rock over to the sloper",
  ],
};

function band(gradeIndex, gradeCount) {
  const position = gradeIndex / Math.max(1, gradeCount - 1);
  return position >= 0.6 ? "hard" : position >= 0.3 ? "middle" : "easy";
}

function isoDateWeeksAgo(weeksAgo) {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

// Most entries at the easiest grades, tapering to the hardest: a realistic base.
function weightedGradeIndex(tierCount, i) {
  const weights = Array.from({ length: tierCount }, (_, t) => tierCount - t);
  const total = weights.reduce((a, b) => a + b, 0);
  const cumulative = weights.reduce((acc, w, t) => {
    acc.push((acc[t - 1] ?? 0) + w);
    return acc;
  }, []);
  const target = i % total;
  return cumulative.findIndex(c => target < c);
}

function buildPersonaSql(persona) {
  const { username, label } = persona;
  const tier = TIERS[username];
  const userId = `demo-user-${username}`;
  const now = sqlStr(new Date().toISOString());
  const statements = [];

  statements.push(
    `INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, username, displayUsername) VALUES (${sqlStr(userId)}, ${sqlStr(`${label} Demo`)}, ${sqlStr(`${username}@demo.climbinglogbook.internal`)}, 1, ${now}, ${now}, ${sqlStr(username)}, ${sqlStr(`${label} Demo`)});`,
  );

  statements.push(
    `INSERT OR REPLACE INTO settings (user_id, athlete_mode, active_discipline, logbook_public, is_demo, is_internal, created_at, updated_at) VALUES (${sqlStr(userId)}, 1, 'boulder', 1, 1, 1, ${now}, ${now});`,
  );
  // Synthetic data about fictional people, so their demo injury pages work (#1120).
  statements.push(
    `INSERT OR IGNORE INTO consents (id, user_id, purpose, wording_version, granted_at) VALUES (${sqlStr(`demo-${username}-consent`)}, ${sqlStr(userId)}, ${sqlStr(PAIN_INJURY.purpose)}, ${sqlStr(PAIN_INJURY.version)}, ${now});`,
  );

  const locationIds = LOCATIONS.map((loc, i) => {
    const id = `demo-${username}-loc-${i}`;
    statements.push(
      `INSERT OR IGNORE INTO locations (id, user_id, name, country, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(userId)}, ${sqlStr(loc.name)}, ${sqlStr(loc.country)}, ${now}, ${now});`,
    );
    return id;
  });
  const placeIds = AREAS.map((area, i) => {
    const id = `demo-${username}-place-${i}`;
    const locationId = locationIds[i % locationIds.length];
    statements.push(
      `INSERT OR IGNORE INTO places (id, user_id, location_id, area, created_at, updated_at) VALUES (${sqlStr(id)}, ${sqlStr(userId)}, ${sqlStr(locationId)}, ${sqlStr(area)}, ${now}, ${now});`,
    );
    return id;
  });

  const entryIds = [];
  for (const type of ["boulder", "sport"]) {
    const scale = DEFAULT_SCALE_BY_TYPE[type];
    // Standard grades only: the full lists start with non-standard ones, which would shift every tier's range down.
    const allGrades = (type === "boulder" ? BOULDER_GRADES : LEAD_GRADES).filter(
      ({ g }) => SCALES[scale].toOrdinal(g) != null,
    );
    const [from, to] = type === "boulder" ? tier.boulderRange : tier.sportRange;
    const grades = allGrades.slice(from, to);

    for (let i = 0; i < tier.entriesPerDiscipline; i++) {
      const gradeIndex = weightedGradeIndex(grades.length, i);
      const grade = grades[gradeIndex].g;
      const gradeBand = band(gradeIndex, grades.length);
      const wallAngle = WALL_ANGLES_BY_BAND[gradeBand][i % 4];
      const betas = HARDEST_BETAS_BY_BAND[gradeBand];
      // Most climbs have beta, so the log shows plenty of the interpreter at work.
      const hardestBeta = i % 4 === 3 ? null : betas[i % betas.length];
      const placeId = placeIds[i % placeIds.length];
      const entryId = `demo-${username}-entry-${type}-${i}`;
      entryIds.push(entryId);
      // Strides with no shared factor, so recent entries aren't all projects.
      const weeksAgo = (i * 7) % 52;
      const status = i % 5 === 0 ? "project" : "send";
      const firstAttempt = status === "send" && i % 2 === 0;
      const rpe = status === "send" ? 40 + (i % 6) * 10 : null;
      const attemptsToSend = status === "send" ? 1 + (i % 4) : null;
      const name = `${label} ${type === "boulder" ? "Boulder" : "Sport"} #${i + 1}`;
      // Updated, not inserted: re-runs must backfill rows seeded before this column existed.
      const sportStyle = type === "sport" ? (i % 3 === 0 ? "top_rope" : "lead") : null;

      statements.push(
        `INSERT OR IGNORE INTO entries (id, user_id, place_id, name, grade, discipline_id, status_id, first_attempt, date, video, notes, created_at, updated_at) VALUES (${sqlStr(entryId)}, ${sqlStr(userId)}, ${sqlStr(placeId)}, ${sqlStr(name)}, ${sqlStr(grade)}, ${sqlStr(type)}, ${sqlStr(status)}, ${sqlBool(firstAttempt)}, ${sqlStr(isoDateWeeksAgo(weeksAgo))}, NULL, NULL, ${now}, ${now});`,
      );
      statements.push(
        `UPDATE entries SET attempts_to_send = ${attemptsToSend ?? "NULL"}, rpe = ${rpe ?? "NULL"}, sport_style = ${sportStyle ? sqlStr(sportStyle) : "NULL"}, grade = ${sqlStr(grade)}, grade_scale = ${sqlStr(scale)}, wall_angle = ${sqlStr(wallAngle)}, hardest_beta = ${hardestBeta ? sqlStr(hardestBeta) : "NULL"} WHERE id = ${sqlStr(entryId)};`,
      );
      statements.push(`DELETE FROM entry_movements WHERE entry_id = ${sqlStr(entryId)};`);
      hardestBetaMovements(hardestBeta).forEach((movement, n) => {
        const row = movementRow(movement, `${entryId}-movement-${n}`, entryId);
        const columns = Object.keys(row);
        statements.push(
          `INSERT INTO entry_movements (${columns.join(", ")}) VALUES (${columns.map(c => (row[c] == null ? "NULL" : typeof row[c] === "number" ? row[c] : sqlStr(row[c]))).join(", ")});`,
        );
      });
    }
  }

  const painCount = Math.max(6, Math.round(entryIds.length * 0.05));
  for (let i = 0; i < painCount; i++) {
    const entryId = entryIds[i % entryIds.length];
    statements.push(
      `INSERT OR IGNORE INTO entry_pain_moves (id, entry_id, limb, side, hold_type, movement_style, wall_angle, created_at) VALUES (${sqlStr(`demo-${username}-pain-${i}`)}, ${sqlStr(entryId)}, ${sqlStr(DOMINANT_MOVE_COMBO.limb)}, ${sqlStr(DOMINANT_MOVE_COMBO.side)}, ${sqlStr(DOMINANT_MOVE_COMBO.holdType)}, ${sqlStr(DOMINANT_MOVE_COMBO.movementStyle)}, ${sqlStr(DOMINANT_MOVE_COMBO.wallAngle)}, ${now});`,
    );
  }

  // The public reports are cached under the newest sync_cursor, so a re-seed has to move it or they keep serving the old data.
  statements.push(
    `UPDATE entries SET sync_cursor = (SELECT COALESCE(MAX(sync_cursor), 0) + 1 FROM entries WHERE user_id = ${sqlStr(userId)}) WHERE id = ${sqlStr(entryIds[0])};`,
  );

  return statements.join("\n");
}

console.log("Applying migrations...");
applyMigrations(d1Options);

console.log(`Seeding ${DEMO_PERSONAS.map(persona => persona.username).join(", ")}...`);
d1ExecuteBatch(DEMO_PERSONAS.map(buildPersonaSql).join("\n"), d1Options);

console.log("Done.");
