import { pyramidSplitRows } from "../../shared/pyramid-stats.js";

const today = new Date().toISOString().slice(0, 10);
const entries = [
  { id: "e0", type: "boulder", status: "send", grade: "5C", date: today },
  { id: "e1", type: "boulder", status: "send", grade: "6A", date: today },
  { id: "e2", type: "boulder", status: "send", grade: "6B", date: today },
  { id: "e3", type: "boulder", status: "send", grade: "6C", date: today },
  { id: "e4", type: "boulder", status: "send", grade: "7A", date: today },
  { id: "e5", type: "boulder", status: "send", grade: "8A", date: today },
];

document.querySelector("climbing-grade-pyramid").pyramidData = {
  boulder: pyramidSplitRows("boulder", entries),
  lead: pyramidSplitRows("lead", entries),
};
