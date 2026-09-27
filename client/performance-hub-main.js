import { createAppShell } from "./app-shell.js";
import { rowCardHtml } from "./row-card.js";
import { flashLabel, sendLabel } from "./status.js";
import { startPage } from "./boot-gate.js";

const INSIGHTS = [
  {
    id: "insight-pyramid",
    title: "Grade Pyramid",
    description: "See your sends broken down by grade, and how your pyramid's shape has changed over time.",
    route: "pyramid",
  },
  {
    id: "insight-injury",
    title: "Injury / Pain Log",
    description: "Browse every climb where something hurt, and see which moves your pain flags cluster around.",
    route: "injury",
  },
  {
    id: "insight-strengths",
    title: "Strengths / Weaknesses",
    description:
      "See which hold types, wall angles, and movements are your weakest combination, and drill into any one of them.",
    route: "strengths",
  },
  {
    id: "insight-trends",
    title: "Volume / Intensity",
    description: "See how many climbs you're sending over time, and how your max grade is trending alongside it.",
    route: "trends",
  },
  {
    id: "insight-gap",
    title: type => `${sendLabel(type)} / ${flashLabel(type)} Gap`,
    description:
      "Compare your first-try sends against what you eventually send once you've worked a climb, and see how many attempts it typically takes.",
    route: "gap",
  },
  {
    id: "insight-rpe",
    title: "Effort / RPE Trend",
    description: "See how hard you're pushing relative to your grade progress, and whether there's room to try harder.",
    route: "rpe",
  },
];

const { username: USERNAME, store, headerChrome, updateAdminBar, authenticateAthlete } = createAppShell({ render });

const tilesEl = document.getElementById("insight-tiles");

function renderTiles() {
  const type = store.getActiveType();
  tilesEl.innerHTML = INSIGHTS.map(insight =>
    rowCardHtml({
      id: insight.id,
      title: typeof insight.title === "function" ? insight.title(type) : insight.title,
      description: insight.description,
      controlHtml: `<a class="btn shrink-0" href="/${encodeURIComponent(USERNAME)}/performance/${insight.route}">View</a>`,
    }),
  ).join("");
}

function render() {
  headerChrome.updateDisciplinePicker();
  updateAdminBar();
  renderTiles();
}

async function boot() {
  if (!(await authenticateAthlete("performance-hub"))) return;

  render();
}

startPage(boot);
