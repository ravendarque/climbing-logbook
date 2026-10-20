import { groupByMonth, splitByChannel } from "../shared/whats-new-months.js";

const TAG = /^v\d+\.\d+\.\d+$/;
const TIMEOUT_MS = 10_000;

// The main site reads the beta build's list; anywhere else (dev, previews) there's only this build.
const betaReleasesUrl = hostname =>
  hostname === "climbinglogbook.com" ? "https://beta.climbinglogbook.com/-/releases.json" : "/-/releases.json";

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function monthNodes(releases) {
  return groupByMonth(releases).flatMap(({ month, releases: monthReleases }) => {
    const list = el("ul");
    for (const release of monthReleases) {
      for (const change of release.changes) {
        const item = el("li", change);
        item.append(" ", el("span", `${release.day} · ${release.version}`, "block text-sm text-muted tabular-nums"));
        list.append(item);
      }
    }
    return [el("h3", month), list];
  });
}

function betaIntro(hasReleases) {
  const intro = el("p");
  if (!hasReleases) {
    intro.textContent = "Nothing on the beta channel yet that isn't on the main app.";
    return intro;
  }
  const link = el("a", "beta channel");
  link.href = "/help/beta-channel/";
  intro.append(
    "Released to the beta channel, not the main app yet. To get them now, join the ",
    link,
    ": in My account, choose Check our beta.",
  );
  return intro;
}

export async function showChannels(list, hostname = location.hostname) {
  const [{ version }, releases] = await Promise.all([getJson("/-/api/health"), getJson(betaReleasesUrl(hostname))]);
  if (!TAG.test(version ?? "") || !Array.isArray(releases)) throw new Error(`No release version (${version})`);
  const { beta, main } = splitByChannel(releases, version);
  list.querySelector("#whats-new-beta").replaceChildren(betaIntro(beta.length > 0), ...monthNodes(beta));
  list.querySelector("#whats-new-main").replaceChildren(...monthNodes(main));
}

// The built list is production's own, so on failure it stays, and only the beta channel says it couldn't be read.
export function enhanceWhatsNew(doc = document) {
  const list = doc.getElementById("whats-new-list");
  if (!list) return;
  showChannels(list).catch(err => {
    console.warn("What's new: couldn't read the beta channel", err);
    list
      .querySelector("#whats-new-beta")
      .replaceChildren(el("p", "Couldn't check the beta channel just now. Try again later.", "text-muted"));
  });
}
