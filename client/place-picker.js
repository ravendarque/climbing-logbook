// The entry form's Place picker (#158) -- #238, part of #233's
// modularization epic. Includes the "add a new place" modal, not split
// into its own file: the two are one workflow, not two independent
// concerns -- add-place-modal has exactly one caller (this picker's "Add
// new place" button) and its success path calls straight back into this
// module's own setPlace(), the same direct coupling the pre-#238 code
// had. Splitting them would mean inventing a callback interface to
// re-create a relationship the code already expresses more simply as one
// module owning both.
//
// A factory with a wide injected-dependency list -- not a design smell
// introduced by this extraction, but this workflow's real, pre-existing
// surface: it touches auth (adminFetch/isAuthRedirect, still main.js-local
// -- #242 kept them there, real cross-cutting infrastructure the
// composition root reasonably owns and hands out) and the offline queue.
// `applyPendingQueue`/`updateAdminBar` used to be injected here too, but
// aren't anymore (#264) -- store.applyPendingQueue() and store.setLoggedIn()
// are both Store mutations now, so main.js's render() (the Store's sole
// subscriber) picks up the resulting change on its own; nothing here needs
// to trigger it manually. openModal/closeModal (client/modal-utils.js,
// #241) stay injected, not imported -- unlike createDisclosure (stateless,
// safe to call independently from anywhere), they share one
// `lastFocusedEl` across the whole app, so every caller needs the same
// instance from main.js's single createModalHelpers() call, not its own.
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
  setQueue,
  adminLocationsUrl,
  adminPlacesUrl,
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

  // Every selectable Place, joined against its Location, sorted by
  // location then area -- rebuilt on each render rather than cached,
  // since the place/location lists are nowhere near COUNTRIES' 247 rows.
  function joinedPlaces() {
    return store.getPlaces().map(p => {
      const loc = store.locationOf(p);
      return { id: p.id, location: loc.name, area: p.area, country: loc.country };
    }).sort((a, b) => a.location.localeCompare(b.location) || a.area.localeCompare(b.area));
  }

  // Reflects the committed value into the trigger button.
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

  // ── Add-place modal (#158) ────────────────────────────────────────────
  // Stacks on top of entry-overlay. Branches on whether the typed
  // Location exactly matches (case-insensitive) an existing one: if so,
  // Country auto-fills and locks -- inherited, not re-askable, which is
  // the entire reason Location was split out from Place (a location's
  // country can now only ever be set once, never re-typed per area, so
  // it can't drift again). If not, Country stays open for picking, same
  // interaction pattern as the place picker's own (search + listbox with
  // a checkmark on the selected row), just shown in full "[flag] name"
  // text rather than icon-only -- these fields are stacked vertically
  // with no width constraint forcing that compromise.
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

  // No explicit addPlaceCountryBtn.disabled guard needed here -- a real
  // disabled <button> never dispatches click events in the first place,
  // so createSearchableListbox's internal trigger listener (via
  // createDisclosure) simply never fires while it's locked (see
  // setAddPlaceCountry/updateAddPlaceLocationMatch for where .disabled
  // gets toggled).
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
      // Doesn't reset a country the user may have already picked before
      // the match broke (e.g. a typo mid-edit) -- still a normal
      // editable field at that point, not a locked one, so leaving it in
      // place is less disruptive than wiping it and forcing a re-pick.
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
    addPlaceMsg.className = "mt-[.85rem] px-4 py-3 rounded-app text-[.9rem] bg-[color-mix(in_srgb,#f87171_12%,var(--color-surface))] border border-[color-mix(in_srgb,#f87171_40%,transparent)] text-red-400";
  }

  addPlaceForm.addEventListener("submit", async e => {
    e.preventDefault();
    addPlaceSubmitBtn.disabled = true;
    addPlaceMsg.className = "hidden";

    const locationName = addPlaceLocationInput.value.trim();
    const area = addPlaceAreaInput.value.trim();
    const matched = findMatchingLocation(locationName);

    // Minted up front regardless of online/offline outcome -- same
    // rationale as entry IDs: an offline-queued write needs a stable
    // identity from the moment it's created, not just once it syncs.
    const location = matched ?? { id: crypto.randomUUID(), name: locationName, country: addPlaceCountryCommitted };
    const place = { id: crypto.randomUUID(), locationId: location.id, area };

    let authLapsed = false;
    const queue = getQueue();

    if (!matched) {
      try {
        const res = await adminFetch(adminLocationsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(location),
        });
        if (isAuthRedirect(res)) throw new Error("not-authenticated");
        const data = await res.json();
        if (!res.ok) {
          // The server is reachable and rejected this -- a real
          // validation problem, not connectivity, so don't queue
          // something that would just fail again identically on retry.
          showAddPlaceError(data.error ?? `Error ${res.status}`);
          addPlaceSubmitBtn.disabled = false;
          return;
        }
        store.setLocations(data.locations);
      } catch (err) {
        if (err.message === "not-authenticated") authLapsed = true;
        // Offline, server unreachable, or the Access session lapsed --
        // queue the location, and the place right behind it below, same
        // dependency order the online path itself writes in.
        queue.push({ kind: "location", op: "add", record: location });
      }
    }

    const locationQueued = queue.some(item => item.kind === "location" && item.record.id === location.id);
    if (locationQueued) {
      // Already know this session is offline -- don't bother attempting
      // the place online too, just queue it right behind the location.
      queue.push({ kind: "place", op: "add", record: place });
    } else {
      try {
        const res = await adminFetch(adminPlacesUrl, {
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
        queue.push({ kind: "place", op: "add", record: place });
      }
    }

    if (authLapsed) {
      store.setLoggedIn(false); // Store mutation -- notify() covers the admin-bar update (#264)
    }
    setQueue(queue);
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
