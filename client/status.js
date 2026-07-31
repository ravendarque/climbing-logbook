// Extracted from client/main.js (#206).
import { STATUS_ICONS } from "./status-icons.js";

// "Flash"/"Send" are bouldering terms; the equivalent sport/lead terms
// are "Onsight"/"Redpoint" (same underlying status/flash data either
// way, see #98) -- icons stay the same, only the label text differs.
const FLASH_LABEL = { boulder: ["Flash", "Flashes"], lead: ["Onsight", "Onsights"] };
const SEND_LABEL  = { boulder: ["Send", "Sends"],    lead: ["Redpoint", "Redpoints"] };
const NAME_LABEL  = { boulder: "Problem name", lead: "Route name" };

export const flashLabel = (type, plural) => FLASH_LABEL[type ?? "boulder"][plural ? 1 : 0];
export const sendLabel  = (type, plural) => SEND_LABEL[type ?? "boulder"][plural ? 1 : 0];
export const nameLabel  = type => NAME_LABEL[type ?? "boulder"];

const STATUS_ICON_CLASS = "inline-flex align-middle cursor-default [&_svg]:w-[1.4rem] [&_svg]:h-[1.4rem]";

export function statusBadge(entry) {
  if (entry.status === "send" && entry.firstAttempt)
    return `<span class="${STATUS_ICON_CLASS}" title="${flashLabel(entry.type)}">${STATUS_ICONS.flash}</span>`;
  if (entry.status === "send")
    return `<span class="${STATUS_ICON_CLASS}" title="${sendLabel(entry.type)}">${STATUS_ICONS.send}</span>`;
  if (entry.status === "project")
    return `<span class="${STATUS_ICON_CLASS}" title="Project">${STATUS_ICONS.project}</span>`;
  if (entry.status === "abandoned")
    return `<span class="${STATUS_ICON_CLASS}" title="Abandoned">${STATUS_ICONS.abandoned}</span>`;
  return `<span class="${STATUS_ICON_CLASS}" title="Check out">${STATUS_ICONS.wishlist}</span>`;
}
