import { execFileSync } from "node:child_process";
import historyFile from "./whats-new-history.json" with { type: "json" };

const HEADING = /^##\s+What['’]s new\s*$/im;
const MONTHS_SHOWN = 6;

// The lines under the PR template's "What's new" heading, one per change; none when left empty.
export function whatsNewFromPrBody(body = "") {
  const text = body.replace(/\r\n/g, "\n");
  const start = text.search(HEADING);
  if (start === -1) return [];
  const section = text.slice(start).split("\n").slice(1);
  const end = section.findIndex(line => /^#{1,2}\s/.test(line));
  const changes = [];
  let inComment = false;
  for (const line of end === -1 ? section : section.slice(0, end)) {
    const trimmed = line.trim();
    if (inComment || trimmed.startsWith("<!--")) {
      inComment = !trimmed.endsWith("-->");
      continue;
    }
    const change = trimmed.replace(/^[-*]\s+/, "");
    if (change) changes.push(change);
  }
  return changes;
}

export function tagMessage(version, changes) {
  return [version, "", ...changes].join("\n");
}

// Annotated tags carry their changes in the message body, after the version line; only tags in this build count.
export function parseTags(output) {
  return output
    .split("\0\n")
    .filter(Boolean)
    .map(record => {
      const [version, date, body = ""] = record.split("\0");
      return {
        version,
        date,
        changes: body
          .split("\n")
          .map(line => line.trim())
          .filter(Boolean),
      };
    });
}

export function readTaggedReleases(cwd = process.cwd()) {
  try {
    const output = execFileSync(
      "git",
      [
        "for-each-ref",
        "--merged",
        "HEAD",
        "refs/tags/v*",
        "--format=%(refname:short)%00%(creatordate:short)%00%(contents:body)%00",
      ],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return parseTags(output);
  } catch {
    return [];
  }
}

export function readHistory() {
  return historyFile;
}

const monthOf = date => date.slice(0, 7);

function monthsBefore(month, n) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

// Newest first, one group per month, covering the six months up to the latest release with changes.
export function groupByMonth(releases) {
  const listed = releases
    .filter(release => release.changes.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version, "en", { numeric: true }));
  if (listed.length === 0) return [];
  const oldest = monthsBefore(monthOf(listed[0].date), MONTHS_SHOWN - 1);
  const months = new Map();
  for (const release of listed) {
    const month = monthOf(release.date);
    if (month < oldest) break;
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(release);
  }
  return [...months].map(([month, monthReleases]) => ({
    month: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
    releases: monthReleases.map(({ version, date, changes }) => ({
      version,
      date,
      day: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }),
      changes,
    })),
  }));
}

// A tag's own lines win over the hand-written history for the same version.
export function whatsNew({ tagged = readTaggedReleases(), history = readHistory() } = {}) {
  const byVersion = new Map(history.map(release => [release.version, release]));
  for (const release of tagged) if (release.changes.length > 0) byVersion.set(release.version, release);
  return groupByMonth([...byVersion.values()]);
}
