import { STATUS_ICONS } from "./status-icons.js";

// Sport's terms for the same statuses.
const FLASH_LABEL = { boulder: ["Flash", "Flashes"], sport: ["Onsight", "Onsights"] };
const SEND_LABEL  = { boulder: ["Send", "Sends"],    sport: ["Redpoint", "Redpoints"] };
const NAME_LABEL  = { boulder: "Problem name", sport: "Route name" };
const DISCIPLINE_LABEL = { boulder: "Boulder", sport: "Sport" };

export const flashLabel = (type, plural) => FLASH_LABEL[type ?? "boulder"][plural ? 1 : 0];
export const sendLabel  = (type, plural) => SEND_LABEL[type ?? "boulder"][plural ? 1 : 0];
export const nameLabel  = type => NAME_LABEL[type ?? "boulder"];
export const disciplineLabel = type => DISCIPLINE_LABEL[type ?? "boulder"];

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
  if (entry.status === "archived")
    return `<span class="${STATUS_ICON_CLASS}" title="Archived">${STATUS_ICONS.archived}</span>`;
  return `<span class="${STATUS_ICON_CLASS}" title="Check out">${STATUS_ICONS.checkout}</span>`;
}

// Scoped to a root: each consumer hydrates its own container.
export function hydrateStatusIcons(root) {
  root.querySelectorAll("[data-icon]").forEach(el => {
    el.innerHTML = STATUS_ICONS[el.dataset.icon];
  });
}
