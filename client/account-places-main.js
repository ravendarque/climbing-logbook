import { createAccountShell } from "./account-shell.js";
import { startPage } from "./boot-gate.js";
import { createReportData } from "./report-data.js";
import { createSyncStatusIcon } from "./sync-status-icon.js";
import { createOfflineSync } from "./offline-sync.js";
import { createModalHelpers } from "./modal-utils.js";
import { createFailedWritesBanner, getFailedWrites, removeFailedWrite } from "./failed-writes.js";
import { apiFetch } from "./api-fetch.js";
import { userKey } from "./user-storage.js";
import { readPendingQueue } from "./delta-pull.js";
import { escapeHtml } from "./escape-html.js";
import { loadResource } from "./fetch-json.js";
import { COUNTRIES, COUNTRY_BY_NAME } from "../shared/countries.js";

const { username: USERNAME, store, adminAuth, updateAdminBar } = createAccountShell();
const syncStatusIcon = createSyncStatusIcon();
const QUEUE_KEY = userKey("logbook_pending_queue");
const reportData = createReportData({
  username: USERNAME,
  isDemo: false,
  store,
  syncStatusIcon,
  onRefresh: render,
  withPlaces: true,
});
const offlineSync = createOfflineSync({
  store,
  apiFetch,
  syncStatusIcon,
  entriesWriteUrl: "/-/api/entries",
  locationsWriteUrl: "/-/api/locations",
  placesWriteUrl: "/-/api/places",
  entriesUrl: "/-/api/entries",
  placesUrl: "/-/api/places",
  locationsUrl: "/-/api/locations",
  queueKey: QUEUE_KEY,
  onFailedWrites: showFailedWrites,
});
const failedWritesBanner = createFailedWritesBanner({
  el: document.getElementById("failed-writes"),
  onEdit: () => {},
  onDiscard: item => {
    removeFailedWrite(item.qid);
    showFailedWrites();
  },
});

function showFailedWrites() {
  failedWritesBanner.render(getFailedWrites());
}
const { openModal, closeModal } = createModalHelpers(["place-edit-overlay"]);

document.getElementById("back-to-account-link").href = `/${encodeURIComponent(USERNAME)}/account`;

const listEl = document.getElementById("places-list");
const emptyEl = document.getElementById("places-empty");
const overlay = document.getElementById("place-edit-overlay");
const form = document.getElementById("place-edit-form");
const nameInput = document.getElementById("place-edit-name");
const countrySelect = document.getElementById("place-edit-country");
const areasEl = document.getElementById("place-edit-areas");
const errorEl = document.getElementById("place-edit-error");
const deleteText = document.getElementById("place-delete-text");
const deleteTargetRow = document.getElementById("place-delete-target-row");
const deleteTarget = document.getElementById("place-delete-target");
const deleteBtn = document.getElementById("place-delete-btn");

countrySelect.replaceChildren(
  new Option("No country", ""),
  ...COUNTRIES.map(country => new Option(`${country.flag} ${country.name}`, country.name)),
);

let editing = null;
let deleting = null;

const live = () => store.getEntries().filter(entry => !entry._pendingDelete);
const climbsAt = placeIds => live().filter(entry => placeIds.includes(entry.placeId)).length;
const areasOf = locationId => store.getPlaces().filter(place => place.locationId === locationId);
const locationById = id => store.getLocations().find(location => location.id === id);
const areaLabel = area => area || "No area";
const climbsPhrase = n => `${n} ${n === 1 ? "climb" : "climbs"}`;

function render() {
  const locations = store.getLocations().toSorted((x, y) => x.name.localeCompare(y.name));
  emptyEl.hidden = locations.length > 0;
  listEl.hidden = locations.length === 0;
  listEl.innerHTML = locations
    .map(location => {
      const areas = areasOf(location.id);
      const country = COUNTRY_BY_NAME[location.country];
      return `<div class="px-4 py-3 flex items-center gap-3" data-location-id="${escapeHtml(location.id)}">
        <div class="flex-1 min-w-0">
          <span class="row-card-title">${escapeHtml(location.name)}</span>
          <p class="text-sm text-muted mt-1">${country ? `${escapeHtml(country.flag)} ${escapeHtml(country.name)} · ` : ""}${areas.length} ${areas.length === 1 ? "area" : "areas"} · ${climbsPhrase(climbsAt(areas.map(area => area.id)))}</p>
        </div>
        <button type="button" class="btn shrink-0 w-(--field-h) px-0" data-edit="${escapeHtml(location.id)}" aria-label="Edit ${escapeHtml(location.name)}"><svg class="w-4 h-4 stroke-current fill-none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg></button>
      </div>`;
    })
    .join("");
}

function placeOptions(excludeIds) {
  return store
    .getPlaces()
    .filter(place => !excludeIds.includes(place.id))
    .map(place => ({ place, location: locationById(place.locationId) }))
    .filter(({ location }) => location)
    .toSorted((x, y) => `${x.location.name} ${x.place.area}`.localeCompare(`${y.location.name} ${y.place.area}`))
    .map(({ place, location }) => new Option(`${location.name} · ${areaLabel(place.area)}`, place.id));
}

function renderDelete() {
  const { kind, id, name, placeIds } = deleting;
  const count = climbsAt(placeIds);
  const targets = placeOptions(placeIds);
  deleteTarget.replaceChildren(...targets);
  deleteTargetRow.hidden = count === 0;
  if (count === 0) {
    deleteText.textContent = `${name} has no climbs.`;
    deleteBtn.textContent = `Delete ${name}`;
  } else if (targets.length === 0) {
    deleteText.textContent = `${climbsPhrase(count)} ${count === 1 ? "is" : "are"} at ${name}, and there's nowhere else to move them yet. Add another place first.`;
    deleteBtn.textContent = `Delete ${name}`;
  } else {
    deleteText.textContent = `${climbsPhrase(count)} ${count === 1 ? "is" : "are"} at ${name}. Choose where they go: they keep everything else.`;
    deleteBtn.textContent = `Move ${climbsPhrase(count)} and delete`;
  }
  deleteBtn.disabled = count > 0 && targets.length === 0;
  deleteBtn.dataset.kind = kind;
  deleteBtn.dataset.id = id;
}

function setDeleting(kind, id) {
  if (kind === "location") {
    const location = locationById(id);
    deleting = { kind, id, name: location.name, placeIds: areasOf(id).map(area => area.id) };
  } else {
    const place = store.getPlaces().find(area => area.id === id);
    deleting = { kind, id, name: areaLabel(place.area), placeIds: [id] };
  }
  renderDelete();
}

function openEditor(locationId) {
  const location = locationById(locationId);
  editing = locationId;
  errorEl.hidden = true;
  nameInput.value = location.name;
  countrySelect.value = location.country ?? "";
  areasEl.innerHTML = areasOf(locationId)
    .map(
      area => `<div class="flex items-center gap-2">
        <input type="text" class="text-input flex-1 min-w-0" maxlength="50" value="${escapeHtml(area.area)}" placeholder="No area" aria-label="Area name" data-area-id="${escapeHtml(area.id)}">
        <span class="text-xs text-muted shrink-0 tabular-nums">${climbsAt([area.id])}</span>
        <button type="button" class="btn btn-danger shrink-0" data-delete-area="${escapeHtml(area.id)}">Delete</button>
      </div>`,
    )
    .join("");
  setDeleting("location", locationId);
  openModal(overlay);
  nameInput.focus();
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

function queueAndSync(items) {
  if (items.length && !offlineSync.enqueue(...items)) {
    showError("This device has no room to save the change. Free some space, then try again.");
    return false;
  }
  store.applyPendingQueue(readPendingQueue(QUEUE_KEY));
  render();
  offlineSync.syncPending();
  return true;
}

// Checked here as well as on the server, so a change made offline can't fail later for a clash we could see now.
function changes() {
  const name = nameInput.value.trim();
  if (!name) return { error: "Give the location a name." };
  const clash = store
    .getLocations()
    .find(location => location.id !== editing && location.name.toLowerCase() === name.toLowerCase());
  if (clash) return { error: `You already have a location called "${name}".` };
  const items = [];
  const location = locationById(editing);
  if (name !== location.name || countrySelect.value !== (location.country ?? "")) {
    items.push({ kind: "location", op: "edit", record: { id: editing, name, country: countrySelect.value } });
  }
  const inputs = [...areasEl.querySelectorAll("[data-area-id]")];
  const names = inputs.map(input => input.value.trim().toLowerCase());
  const repeated = names.find((value, i) => names.indexOf(value) !== i);
  if (repeated !== undefined) return { error: `This location already has an area called "${areaLabel(repeated)}".` };
  for (const input of inputs) {
    const place = store.getPlaces().find(area => area.id === input.dataset.areaId);
    const area = input.value.trim();
    if (place && area !== place.area) items.push({ kind: "place", op: "edit", record: { id: place.id, area } });
  }
  return { items };
}

form.addEventListener("submit", event => {
  event.preventDefault();
  const { error, items } = changes();
  if (error) {
    showError(error);
    return;
  }
  if (queueAndSync(items)) closeModal(overlay);
});

deleteBtn.addEventListener("click", () => {
  const { kind, id, name, placeIds } = deleting;
  const moveTo = climbsAt(placeIds) > 0 ? deleteTarget.value : undefined;
  const record = moveTo ? { id, name, moveTo } : { id, name };
  if (!queueAndSync([{ kind, op: "delete", record }])) return;
  if (kind === "location") {
    closeModal(overlay);
  } else {
    openEditor(editing);
  }
});

listEl.addEventListener("click", event => {
  const id = event.target.closest("[data-edit]")?.dataset.edit;
  if (id) openEditor(id);
});
areasEl.addEventListener("click", event => {
  const id = event.target.closest("[data-delete-area]")?.dataset.deleteArea;
  if (id) setDeleting("place", id);
});
for (const id of ["place-edit-close", "place-edit-cancel"]) {
  document.getElementById(id).addEventListener("click", () => closeModal(overlay));
}
store.subscribe(render);

async function boot() {
  await Promise.all([adminAuth.checkSession(), adminAuth.fetchSettings()]);
  updateAdminBar();
  if (!(await reportData.open())) return;
  // A device that can't keep its own copy reads the server's instead.
  if (!reportData.isLocal()) {
    const [locations, places, entries] = await Promise.all([
      loadResource("/-/api/locations", "locations"),
      loadResource("/-/api/places", "places"),
      loadResource("/-/api/entries", "entries"),
    ]);
    store.setLocations(locations);
    store.setPlaces(places);
    await store.setEntries(entries).catch(() => {});
  }
  render();
  showFailedWrites();
  offlineSync.updateSyncLine();
  await reportData.refresh();
}

startPage(boot);
