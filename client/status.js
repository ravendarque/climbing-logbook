// Extracted from client/main.js (#206).
import { STATUS_ICONS } from "./status-icons.js";

// "Flash"/"Send" are bouldering terms; the equivalent sport/lead terms
// are "Onsight"/"Redpoint" (same underlying status/flash data either
// way, see #98) -- icons stay the same, only the label text differs.
const FLASH_LABEL = { boulder: ["Flash", "Flashes"], lead: ["Onsight", "Onsights"] };
const SEND_LABEL  = { boulder: ["Send", "Sends"],    lead: ["Redpoint", "Redpoints"] };
const NAME_LABEL  = { boulder: "Problem name", lead: "Route name" };
const DISCIPLINE_LABEL = { boulder: "Boulder", lead: "Lead" };

export const flashLabel = (type, plural) => FLASH_LABEL[type ?? "boulder"][plural ? 1 : 0];
export const sendLabel  = (type, plural) => SEND_LABEL[type ?? "boulder"][plural ? 1 : 0];
export const nameLabel  = type => NAME_LABEL[type ?? "boulder"];
// Was duplicated verbatim in map-view.js/header-chrome.js/
// climbing-grade-pyramid.js -- centralized here (#460) once a fourth
// consumer (climbing-entries-table.js's combined-discipline mode) needed
// the same lookup.
export const disciplineLabel = type => DISCIPLINE_LABEL[type ?? "boulder"];

// #460 -- combined wording for a filter/stat that spans multiple
// disciplines at once (e.g. a "Flash" checkbox that now also needs to
// match a Lead entry's "Onsight"). Driven by whichever discipline keys
// are actually passed in, not hardcoded to exactly two -- a future third
// discipline (#429/#430) only needs its own FLASH_LABEL/SEND_LABEL entry
// above, nothing here changes. De-duplicates identical wording (two
// disciplines that happened to share a term wouldn't show it twice).
const combinedLabel = (labelFn, types, plural) => [...new Set(types.map(t => labelFn(t, plural)))].join(" / ");
export const combinedFlashLabel = (types, plural) => combinedLabel(flashLabel, types, plural);
export const combinedSendLabel  = (types, plural) => combinedLabel(sendLabel, types, plural);

const STATUS_ICON_CLASS = "inline-flex align-middle cursor-default [&_svg]:w-[1.4rem] [&_svg]:h-[1.4rem]";

export function statusBadge(entry) {
  if (entry.status === "send" && entry.firstAttempt)
    return `<span class="${STATUS_ICON_CLASS}" title="${flashLabel(entry.type)}">${STATUS_ICONS.flash}</span>`;
  if (entry.status === "send")
    return `<span class="${STATUS_ICON_CLASS}" title="${sendLabel(entry.type)}">${STATUS_ICONS.send}</span>`;
  if (entry.status === "project")
    return `<span class="${STATUS_ICON_CLASS}" title="Project">${STATUS_ICONS.project}</span>`;
  if (entry.status === "abandoned")
    return `<span class="${STATUS_ICON_CLASS}" title="Archived">${STATUS_ICONS.abandoned}</span>`;
  return `<span class="${STATUS_ICON_CLASS}" title="Check out">${STATUS_ICONS.wishlist}</span>`;
}

// #63 -- fills every `data-icon` placeholder under `root` with its real
// STATUS_ICONS SVG (used by toggle-button markup -- entry-form.js's own
// status radios, climbing-entries-table.js's filter panel -- where the
// icon is injected after the fact rather than inlined via statusBadge()
// above). Takes an explicit root and is called by each consumer scoped to
// its own container, not document-wide: a prior version of this lived
// only in entry-form.js against `document`, which happened to also
// hydrate climbing-entries-table.js's filter-panel icons *when* a page
// also loaded entry-form.js (true on /log) but silently left them
// unhydrated on pages that don't (the read-only /profile page never
// imports entry-form.js at all -- confirmed live, 2026-08-16).
export function hydrateStatusIcons(root) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    el.innerHTML = STATUS_ICONS[el.dataset.icon];
  });
}
