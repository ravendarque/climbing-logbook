const MONTHS_SHOWN = 6;

export const compareVersions = (a, b) => a.localeCompare(b, "en", { numeric: true });

const monthOf = date => date.slice(0, 7);

function monthsBefore(month, n) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 - n, 1)).toISOString().slice(0, 7);
}

// Newest first, releases with changes only, covering the six months up to the latest of them.
export function recentReleases(releases) {
  const listed = releases
    .filter(release => release.changes.length > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || compareVersions(b.version, a.version));
  if (listed.length === 0) return [];
  const oldest = monthsBefore(monthOf(listed[0].date), MONTHS_SHOWN - 1);
  return listed.filter(release => monthOf(release.date) >= oldest);
}

export function groupByMonth(releases) {
  const months = new Map();
  for (const release of recentReleases(releases)) {
    const month = monthOf(release.date);
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

// Releases after the main app's version are on the beta channel only.
export function splitByChannel(releases, mainVersion) {
  return {
    beta: releases.filter(release => compareVersions(release.version, mainVersion) > 0),
    main: releases.filter(release => compareVersions(release.version, mainVersion) <= 0),
  };
}
