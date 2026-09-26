// The add-place modal lives here: it has one caller and one workflow. openModal/closeModal are
// injected because they share one lastFocusedEl across the page.
import { escapeHtml } from "./escape-html.js";
import { COUNTRY_BY_NAME, COUNTRIES } from "./countries.js";
import { createSearchableListbox } from "./modal-utils.js";

export function createPlacePicker({
  store,
  openModal,
  closeModal,
  adminFetch,
  isAuthRedirect,
  getQueue,
  enqueue,
  locationsWriteUrl,
  placesWriteUrl,
}) {
  const placeBtn = document.getElementById("place-btn");
  const placeBtnFlag = document.getElementById("place-btn-flag");
  const placeBtnLabel = document.getElementById("place-btn-label");
  const placePopover = document.getElementById("place-popover");
  const placeSearch = document.getElementById("place-search");
  const placeListbox = document.getElementById("place-listbox");
  const placeAddNewBtn = document.getElementById("place-add-new-btn");

  const PLACE_PLACEHOLDER_ICON = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z"></path></svg>`;
  let placeCommittedValue = ""; // the committed placeId, "" if none

  function joinedPlaces() {
    return store.getPlaces().map(p => {
      const loc = store.locationOf(p);
      return { id: p.id, location: loc.name, area: p.area, country: loc.country };
    }).sort((a, b) => a.location.localeCompare(b.location) || a.area.localeCompare(b.area));
  }

  function setPlace(placeId) {
    const p = store.getPlaces().find(x => x.id === placeId);
    placeCommittedValue = p ? placeId : "";
    if (!p) {
      placeBtn.setAttribute("aria-label", "Place: none selected");
      placeBtnFlag.innerHTML = PLACE_PLACEHOLDER_ICON;
      placeBtnLabel.textContent = "Select a place…";
      placeBtnLabel.classList.add("text-muted");
      return;
    }
    const loc = store.locationOf(p);
    const c = COUNTRY_BY_NAME[loc.country];
    const label = p.area ? `${loc.name}, ${p.area}` : loc.name;
    placeBtn.setAttribute("aria-label", `Place: ${label}`);
    placeBtnFlag.innerHTML = c ? escapeHtml(c.flag) : PLACE_PLACEHOLDER_ICON;
    placeBtnLabel.textContent = label;
    placeBtnLabel.classList.remove("text-muted");
  }

  const { close: closePlacePopover } = createSearchableListbox({
    trigger: placeBtn, popover: placePopover, containerSelector: "#place-wrap",
    searchInput: placeSearch, listboxEl: placeListbox, idPrefix: "place-option",
    filterItems: q => {
      const all = joinedPlaces();
      return q ? all.filter(p => p.location.toLowerCase().includes(q) || p.area.toLowerCase().includes(q)) : all;
    },
    getItemKey: p => p.id,
    isSelected: p => p.id === placeCommittedValue,
    renderItemContent: p => {
      const c = COUNTRY_BY_NAME[p.country];
      const flag = c ? escapeHtml(c.flag) : PLACE_PLACEHOLDER_ICON;
      const label = p.area ? `${escapeHtml(p.location)}, ${escapeHtml(p.area)}` : escapeHtml(p.location);
      return `<span class="flex items-center gap-[.5rem] min-w-0"><span class="flex items-center justify-center shrink-0" aria-hidden="true">${flag}</span><span class="truncate">${label}</span></span>`;
    },
    onSelect: setPlace,
  });

  placeAddNewBtn.addEventListener("click", () => {
    closePlacePopover();
    openAddPlaceModal();
  });

  // A matching location locks its country: it can be set only once, so it can't drift.
  const addPlaceOverlay = document.getElementById("add-place-overlay");
  const addPlaceForm = document.getElementById("add-place-form");
  const addPlaceLocationInput = document.getElementById("add-place-location");
  const addPlaceAreaInput = document.getElementById("add-place-area");
  const addPlaceCountryBtn = document.getElementById("add-place-country-btn");
  const addPlaceCountryFlag = document.getElementById("add-place-country-flag");
  const addPlaceCountryLabel = document.getElementById("add-place-country-label");
  const addPlaceCountryPopover = document.getElementById("add-place-country-popover");
  const addPlaceCountrySearch = document.getElementById("add-place-country-search");
  const addPlaceCountryListbox = document.getElementById("add-place-country-listbox");
  const addPlaceCountryHint = document.getElementById("add-place-country-hint");
  const addPlaceSubmitBtn = document.getElementById("add-place-submit-btn");
  const addPlaceMsg = document.getElementById("add-place-msg");

  let addPlaceCountryCommitted = ""; // committed country name, "" if none
  let addPlaceMatchedLocation = null; // the existing Location the typed name matches, or null

  function findMatchingLocation(name) {
    const q = name.trim().toLowerCase();
    if (!q) return null;
    return store.getLocations().find(l => l.name.toLowerCase() === q) ?? null;
  }

  function setAddPlaceCountry(name) {
    addPlaceCountryCommitted = COUNTRY_BY_NAME[name] ? name : "";
    const c = COUNTRY_BY_NAME[addPlaceCountryCommitted];
    addPlaceCountryBtn.setAttribute("aria-label", c ? `Country: ${c.name}` : "Country: none selected");
    addPlaceCountryFlag.innerHTML = c ? escapeHtml(c.flag) : PLACE_PLACEHOLDER_ICON;
    addPlaceCountryLabel.textContent = c ? c.name : "Select a country…";
    addPlaceCountryLabel.classList.toggle("text-muted", !c);
  }

  // A disabled button never fires click, so no extra guard is needed.
  const { close: closeAddPlaceCountryPopover } = createSearchableListbox({
    trigger: addPlaceCountryBtn, popover: addPlaceCountryPopover, containerSelector: "#add-place-country-wrap",
    searchInput: addPlaceCountrySearch, listboxEl: addPlaceCountryListbox, idPrefix: "add-place-country-option",
    filterItems: q => q ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q)) : COUNTRIES,
    getItemKey: c => c.name,
    isSelected: c => c.name === addPlaceCountryCommitted,
    renderItemContent: c => `<span class="flex items-center gap-[.5rem] min-w-0"><span aria-hidden="true">${escapeHtml(c.flag)}</span><span class="truncate">${escapeHtml(c.name)}</span></span>`,
    onSelect: setAddPlaceCountry,
  });

  function updateAddPlaceLocationMatch() {
    addPlaceMatchedLocation = findMatchingLocation(addPlaceLocationInput.value);
    if (addPlaceMatchedLocation) {
      setAddPlaceCountry(addPlaceMatchedLocation.country);
      addPlaceCountryBtn.disabled = true;
      closeAddPlaceCountryPopover();
      addPlaceCountryHint.hidden = false;
    } else {
      addPlaceCountryBtn.disabled = false;
      addPlaceCountryHint.hidden = true;
      // Keeps a country already picked when the match breaks mid-edit.
    }
  }
  addPlaceLocationInput.addEventListener("input", updateAddPlaceLocationMatch);

  function openAddPlaceModal() {
    addPlaceForm.reset();
    addPlaceMsg.className = "hidden";
    addPlaceMatchedLocation = null;
    setAddPlaceCountry("");
    addPlaceCountryBtn.disabled = false;
    addPlaceCountryHint.hidden = true;
    document.getElementById("add-place-location-list").innerHTML =
      [...new Set(store.getLocations().map(l => l.name))].sort().map(n => `<option value="${escapeHtml(n)}">`).join("");
    openModal(addPlaceOverlay);
  }
  document.getElementById("add-place-close").addEventListener("click", () => closeModal(addPlaceOverlay));
  addPlaceOverlay.addEventListener("click", e => { if (e.target === addPlaceOverlay) closeModal(addPlaceOverlay); });

  function showAddPlaceError(text) {
    addPlaceMsg.textContent = text;
    addPlaceMsg.className = "mt-[.85rem] error-message";
    addPlaceMsg.focus();
  }

  addPlaceForm.addEventListener("submit", async e => {
    e.preventDefault();
    addPlaceSubmitBtn.disabled = true;
    addPlaceMsg.className = "hidden";

    const locationName = addPlaceLocationInput.value.trim();
    const area = addPlaceAreaInput.value.trim();
    const matched = findMatchingLocation(locationName);

    // Minted up front, like entry ids, so a queued write keeps its identity.
    const location = matched ?? { id: crypto.randomUUID(), name: locationName, country: addPlaceCountryCommitted };
    const place = { id: crypto.randomUUID(), locationId: location.id, area };

    let authLapsed = false;
    // #1076 -- collected here and appended to the stored queue at the end,
    // not pushed onto a copy read before the awaits below: writing that
    // copy back would erase anything a sync or another tab changed while
    // these requests were in flight.
    const queued = [];

    if (!matched) {
      try {
        const res = await adminFetch(locationsWriteUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(location),
        });
        if (isAuthRedirect(res)) throw new Error("not-authenticated");
        const data = await res.json();
        if (!res.ok) {
          // A real rejection, not connectivity: queueing would fail the same way.
          showAddPlaceError(data.error ?? `Error ${res.status}`);
          addPlaceSubmitBtn.disabled = false;
          return;
        }
        store.setLocations(data.locations);
      } catch (err) {
        if (err.message === "not-authenticated") authLapsed = true;
        // Queued in dependency order: the location, then its place.
        queued.push({ kind: "location", op: "add", record: location });
      }
    }

    const locationQueued = [...getQueue(), ...queued].some(item => item.kind === "location" && item.record.id === location.id);
    if (locationQueued) {
      queued.push({ kind: "place", op: "add", record: place });
    } else {
      try {
        const res = await adminFetch(placesWriteUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(place),
        });
        if (isAuthRedirect(res)) throw new Error("not-authenticated");
        const data = await res.json();
        if (!res.ok) {
          showAddPlaceError(data.error ?? `Error ${res.status}`);
          addPlaceSubmitBtn.disabled = false;
          return;
        }
        store.setPlaces(data.places);
      } catch (err) {
        if (err.message === "not-authenticated") authLapsed = true;
        queued.push({ kind: "place", op: "add", record: place });
      }
    }

    if (authLapsed) {
      store.setLoggedIn(false);
    }
    if (queued.length) enqueue(...queued);
    store.applyPendingQueue(getQueue());
    setPlace(place.id);
    closeModal(addPlaceOverlay);
    addPlaceSubmitBtn.disabled = false;
  });

  return {
    // Closes the popover (always reopens closed, regardless of whatever
    // state a previous entry-modal session left it in) and commits
    // placeId as the current value -- always called together by the
    // entry form when opening for add/edit, so exposed as one step.
    reset(placeId) {
      closePlacePopover();
      setPlace(placeId);
    },
    getPlaceId: () => placeCommittedValue,
  };
}
