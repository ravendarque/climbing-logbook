import { execFileSync } from "node:child_process";
import historyFile from "./whats-new-history.json" with { type: "json" };
import { groupByMonth, recentReleases } from "../../shared/whats-new-months.js";

const HEADING = /^##\s+What['’]s new\s*$/im;

export function hasWhatsNewHeading(body = "") {
  return HEADING.test(body.replace(/\r\n/g, "\n"));
}

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

// A tag's own lines win over the hand-written history for the same version. Also published as /-/releases.json.
export function whatsNewReleases({ tagged = readTaggedReleases(), history = readHistory() } = {}) {
  const byVersion = new Map(history.map(release => [release.version, release]));
  for (const release of tagged) if (release.changes.length > 0) byVersion.set(release.version, release);
  return recentReleases([...byVersion.values()]);
}

export function whatsNew(sources) {
  return groupByMonth(whatsNewReleases(sources));
}
