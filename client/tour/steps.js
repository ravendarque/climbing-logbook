// whenPrivate: a private logbook has no profile page to show, so the step is shown over the owner's own pages instead.
export const TOUR_STEPS = [
  {
    page: "log",
    target: "#discipline-btn",
    title: "Discipline",
    body: "Use this when you're logging climbs, to choose the discipline you're working in. When you view your logbook, all your disciplines are shown together.",
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
    target: "climbing-status-picker",
    title: "How did it go?",
    body: "Swipe to pick how it went. Enter the name, location, grade, status and other info. If you've enabled Athlete Mode, you can also enter additional information that feeds your Performance Insights reports.",
  },
  {
    page: "profile",
    target: "#panel-logbook",
    title: "Your combined logbook",
    body: "Your logbook with every discipline combined. It's visible to anyone with the link if your logbook is public, and hidden if it's private.",
    whenPrivate: {
      page: "log",
      target: null,
      body: "Your logbook with every discipline combined. Yours is private, so no one else can view it. You can make it public in My account.",
    },
  },
  {
    page: "profile",
    state: "profile-map",
    target: "#map-container",
    placement: "bottom",
    title: "Your map",
    body: "Every place you've climbed, with a count for each. Tap a pin to see them.",
    whenPrivate: { page: "map", state: null },
  },
];

export function resolveStep(step, isPublic) {
  return !isPublic && step.whenPrivate ? { ...step, ...step.whenPrivate } : step;
}
