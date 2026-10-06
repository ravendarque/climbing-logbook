import { flashLabel, sendLabel } from "../status.js";

const STEPS = [
  {
    page: "log",
    target: "#discipline-btn",
    title: "Discipline",
    body: "We'll show you round a demo logbook. Use this when you're logging climbs, to choose the discipline you're working in. When you view your logbook, all your disciplines are shown together.",
  },
  {
    page: "log",
    target: "#add-btn",
    title: "Log a climb",
    body: "Tap Add after a session, between attempts, or to create a tick-list before you get to the crag. It works with no signal and syncs when you're back online.",
  },
  {
    page: "log",
    state: "add-form",
    target: "#place-wrap",
    title: "Where you climbed",
    body: "Pick a place from your list, or add a new one: the crag or wall, its area and its country. You only add each place once, then reuse it.",
  },
  {
    page: "log",
    state: "add-form",
    target: "climbing-status-picker",
    title: "How did it go?",
    body: "Swipe to pick how it went. Enter the name, location, grade, status and other info. If you've enabled Athlete Mode, you can also enter additional information that feeds your Performance Insights reports.",
  },
  {
    page: "log",
    target: "#header-menu-btn",
    title: "Working offline",
    body: "No signal at the crag? Keep logging. Everything saves on your phone and syncs by itself when you're back online. Until then, a red badge on the menu shows how many changes are waiting, and you can sync from the menu straight away.",
  },
  {
    page: "log",
    target: "#search-btn, #filter-btn, #collapse-all-btn",
    title: "Find a climb",
    body: "Search by name, filter by status, grade or style, and expand or collapse every place at once.",
  },
  {
    page: "view",
    target: "#panel-logbook",
    title: "Your combined logbook",
    body: "Choose Combined from the discipline menu to see every discipline together. If your logbook is public, anyone with the link can see it too.",
  },
  {
    page: "view/map",
    target: "#map-container",
    placement: "bottom",
    title: "Your map",
    body: "Every place you've climbed, with a count for each. Tap a pin to see them.",
  },
  {
    page: "log",
    target: "#performance-tab",
    title: "Performance Insights",
    body: "Reports built from your climbs, visible only to you. Turn on Athlete Mode in My account to get them.",
  },
  {
    page: "log",
    state: "add-form",
    target: "#entry-nav-forward",
    title: "Log more detail",
    body: "With Athlete Mode on, the form's second page records your exertion, attempts, how hard each move felt and any pain. That's what your reports are built from.",
  },
  {
    page: "performance",
    target: "#insight-tiles",
    title: "Your reports",
    body: ({ discipline }) =>
      `Grade Pyramid, Volume / Intensity, the ${sendLabel(discipline)} / ${flashLabel(discipline)} Gap, Effort / RPE Trend, Strengths / Weaknesses and the Injury / Pain Log. Open any of them for the detail.`,
  },
];

export function tourSteps({ discipline = "boulder" } = {}) {
  return STEPS.map(step => (typeof step.body === "function" ? { ...step, body: step.body({ discipline }) } : step));
}
