import { startSubmissions } from "./admin/submissions.js";
import { startUsers } from "./admin/users.js";
import { startActivity } from "./admin/activity.js";
import { refreshCounts } from "./admin/shared.js";

const PAGES = {
  reports: { view: "submissions-view", start: () => startSubmissions("reports") },
  feedback: { view: "submissions-view", start: () => startSubmissions("feedback") },
  users: { view: "users-view", start: startUsers },
  activity: { view: "activity-view", start: startActivity },
};

const path = location.pathname.replace(/^\/|\/$/g, "");
const page = Object.hasOwn(PAGES, path) ? path : "reports";

for (const name of Object.keys(PAGES)) {
  const tab = document.getElementById(`tab-${name}`);
  if (name === page) tab.setAttribute("aria-current", "page");
  else tab.removeAttribute("aria-current");
}
document.getElementById(PAGES[page].view).hidden = false;

refreshCounts();
PAGES[page].start();
