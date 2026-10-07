import { api, el, formatDate } from "./shared.js";

const STATUSES = [
  ["flash", "Flash / Onsight"],
  ["send", "Send / Redpoint"],
  ["project", "Project"],
  ["checkout", "Check out"],
  ["archived", "Archived"],
];
const DISCIPLINES = [
  ["boulder", "Boulder", "bg-accent"],
  ["sport", "Sport", "bg-muted"],
];

const number = value => value.toLocaleString("en-GB");
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

function bar(share) {
  const track = el("div", "h-1.5 rounded-full bg-border");
  const fill = el("div", "h-1.5 rounded-full bg-accent");
  fill.style.width = `${share}%`;
  track.append(fill);
  return track;
}

function tile(label, value, detail) {
  const node = el("div", "flex flex-col p-3 min-[900px]:p-4 bg-surface border border-border rounded-app");
  node.append(
    el("span", "text-xs min-[900px]:text-sm text-muted", label),
    el("span", "text-[1.6rem] min-[900px]:text-[2rem] font-bold tabular-nums leading-tight", number(value)),
    el("span", "text-xs min-[900px]:text-sm text-muted", detail),
  );
  return node;
}

function share(label, part, whole, note) {
  const node = el("div", "flex flex-col gap-1");
  const row = el("div", "flex justify-between gap-3 text-sm");
  row.append(el("span", "", label), el("span", "tabular-nums", note ?? `${percent(part, whole)}% · ${number(part)}`));
  node.append(row);
  if (note === undefined) node.append(bar(percent(part, whole)));
  return node;
}

function renderTiles(figures) {
  document
    .getElementById("usage-tiles")
    .replaceChildren(
      tile("Users", figures.users, `${number(figures.newUsers)} new in 30 days`),
      tile("Climbs", figures.climbs, `${number(figures.recentClimbs)} logged in 30 days`),
      tile(
        "Places",
        figures.places,
        `in ${number(figures.countryCount)} ${figures.countryCount === 1 ? "country" : "countries"}`,
      ),
      tile("Active", figures.activeUsers, `logged in 30 days; ${number(figures.users - figures.activeUsers)} dormant`),
    );
}

function renderPeople(figures) {
  const imports = share("Used import", figures.importUsers, figures.users, number(figures.importUsers));
  imports.append(
    el(
      "span",
      "text-xs text-muted",
      `Counted from ${formatDate(figures.importsSince, { withYear: true, withTime: false })}, when imports started being recorded.`,
    ),
  );
  document
    .getElementById("usage-people")
    .replaceChildren(
      share("Athlete Mode on", figures.athleteMode, figures.users),
      share("Public logbook", figures.publicLogbooks, figures.users),
      imports,
    );
}

function renderClimbs(figures) {
  const split = document.getElementById("usage-disciplines");
  const segments = el("div", "flex h-2.5 rounded-sm overflow-hidden bg-border");
  const legend = el("div", "flex flex-wrap justify-between gap-2 text-sm");
  for (const [key, label, colour] of DISCIPLINES) {
    const count = figures.disciplines[key] ?? 0;
    const segment = el("div", colour);
    segment.style.width = `${percent(count, figures.climbs)}%`;
    segments.append(segment);
    const item = el("span", "inline-flex items-center gap-1.5");
    item.append(
      el("span", `inline-block w-2 h-2 rounded-sm ${colour}`),
      `${label} ${percent(count, figures.climbs)}% · ${number(count)}`,
    );
    legend.append(item);
  }
  split.replaceChildren(segments, legend);

  document.getElementById("usage-statuses").replaceChildren(
    ...STATUSES.flatMap(([key, label]) => {
      const count = figures.statuses[key] ?? 0;
      return [
        el("span", "", label),
        bar(percent(count, figures.climbs)),
        el("span", "tabular-nums text-muted", `${percent(count, figures.climbs)}% · ${number(count)}`),
      ];
    }),
  );
}

function renderCountries(figures) {
  const body = document.getElementById("usage-countries");
  body.replaceChildren(
    ...figures.countries.flatMap((country, index) => {
      const row = el("tr", "border-t border-border");
      const name = el("td", "py-2");
      const toggle = el(
        "button",
        "inline-flex items-center gap-1.5 p-0 bg-transparent border-0 font-semibold text-foreground cursor-pointer",
      );
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      const chevron = el("span", "inline-block w-3 transition-transform aria-expanded:rotate-90", "▸");
      chevron.setAttribute("aria-hidden", "true");
      toggle.append(chevron, country.country);
      name.append(toggle);
      row.append(name, el("td", "text-right", number(country.places)), el("td", "text-right", number(country.climbs)));

      const locations = country.locations.map(location => {
        const sub = el("tr", "text-foreground/80");
        sub.hidden = true;
        sub.dataset.country = String(index);
        sub.append(
          el("td", "py-1 pl-5", location.location),
          el("td", "text-right", number(location.places)),
          el("td", "text-right", number(location.climbs)),
        );
        return sub;
      });
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        chevron.textContent = open ? "▾" : "▸";
        for (const sub of locations) sub.hidden = !open;
      });
      return [row, ...locations];
    }),
  );
  document.getElementById("usage-countries-empty").hidden = figures.countries.length > 0;
}

export async function startUsage() {
  const status = document.getElementById("usage-status");
  status.textContent = "Loading…";
  try {
    const figures = await api("usage");
    renderTiles(figures);
    renderPeople(figures);
    renderClimbs(figures);
    renderCountries(figures);
    document.getElementById("usage-body").hidden = false;
    status.textContent = "";
  } catch {
    status.textContent = "Couldn't load these. Check your connection and reload.";
  }
}
