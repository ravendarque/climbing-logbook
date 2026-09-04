// The Add/Edit entry modal (#238, part of #233's modularization epic):
// labels, the grade/status/date pickers, the modal's own open/close
// lifecycle, and submit/delete (online -> API, offline -> queue).
// Composes client/place-picker.js internally -- the place picker exists
// only to serve this form, so it's instantiated here rather than
// injected from main.js, and every dependency it needs is simply passed
// straight through from this module's own injected list.
//
// `render`/`updateAdminBar` used to be injected here too, but aren't
// anymore (#264) -- store.setEntries()/store.setLoggedIn()/
// store.applyPendingQueue() are all Store mutations, so main.js's
// render() (the Store's sole subscriber) picks up every change here on
// its own; nothing in this module needs to trigger it manually.
import { escapeHtml } from "./escape-html.js";
import { BOULDER_GRADES, LEAD_GRADES } from "../shared/grade-data.js";
import { flashLabel, sendLabel, nameLabel, hydrateStatusIcons } from "./status.js";
import { createPlacePicker } from "./place-picker.js";
import { createMoveRowList } from "./move-tagging.js";
import { validateEntryShape } from "../shared/entry-schema.js";

const ERROR_MSG_CLASS = "mt-[.85rem] px-4 py-3 rounded-app text-[.9rem] bg-[color-mix(in_srgb,#f87171_12%,var(--color-surface))] border border-[color-mix(in_srgb,#f87171_40%,transparent)] text-red-400";

export function createEntryForm({
  store,
  openModal,
  closeModal,
  adminFetch,
  isAuthRedirect,
  getQueue,
  setQueue,
  adminDataUrl,
  adminLocationsUrl,
  adminPlacesUrl,
  // #251 -- the /log page's own affordance when viewed as one of the three
  // seeded demo accounts: every field stays genuinely fillable (so a
  // visitor can see the real form, not a static screenshot of one), but
  // Save never persists anything, matching the issue's own "functional
  // but the save button disabled" wording. Defaults false; client/
  // log-main.js is this function's only caller either way, threading
  // through its own IS_DEMO check (client/demo-mode.js).
  readOnly = false,
}) {
  const entryOverlay   = document.getElementById("entry-overlay");
  const entryForm      = document.getElementById("entry-form");
  const entryModalTitle= document.getElementById("entry-modal-title");
  const nameInput  = document.getElementById("entry-name");
  const notesInput = document.getElementById("entry-notes");
  const videoInput = document.getElementById("entry-video");
  const gradeSelect = document.getElementById("grade-select");
  const gradePrev   = document.getElementById("grade-prev");
  const gradeNext   = document.getElementById("grade-next");
  const dateInput  = document.getElementById("entry-date");
  const dateNative = document.getElementById("date-native");
  const datePickerBtn = document.getElementById("date-picker-btn");
  const entrySubmitBtn = document.getElementById("entry-submit-btn");
  const entryDeleteBtn = document.getElementById("entry-delete-btn");
  const entryMsg      = document.getElementById("entry-msg");
  const statusGroup = document.getElementById("status-group");
  const exertionField = document.getElementById("exertion-field");
  const exertionSlider = document.getElementById("exertion-slider");
  const exertionValue = document.getElementById("exertion-value");
  const attemptsMinus = document.getElementById("attempts-minus");
  const attemptsPlus = document.getElementById("attempts-plus");
  const attemptsCount = document.getElementById("attempts-count");

  const placePicker = createPlacePicker({
    store, openModal, closeModal, adminFetch, isAuthRedirect,
    getQueue, setQueue,
    adminLocationsUrl, adminPlacesUrl,
  });

  const hardestMoves = createMoveRowList({ listEl: document.getElementById("hardest-moves-list"), addBtnEl: document.getElementById("hardest-moves-add"), hasDifficulty: true, defaultDifficulty: "hardest", listLabel: "hardest move" });
  const easiestMoves = createMoveRowList({ listEl: document.getElementById("easiest-moves-list"), addBtnEl: document.getElementById("easiest-moves-add"), hasDifficulty: true, defaultDifficulty: "easiest", listLabel: "easiest move" });
  const painMoves = createMoveRowList({ listEl: document.getElementById("pain-moves-list"), addBtnEl: document.getElementById("pain-moves-add"), hasDifficulty: false, listLabel: "pain/injury move" });

  let editingId = null; // null = add mode

  // ── Labels (Problem/Route name, Flash/Onsight, Send/Redpoint) ─────────
  // The form no longer has its own type toggle -- an entry's type is
  // whichever tab was active when the form opened (store.getActiveType()),
  // since the table it was added/edited from is already scoped to that
  // type by construction.
  function updateFormStatusLabels() {
    document.getElementById("form-flash-label").textContent = flashLabel(store.getActiveType());
    document.getElementById("form-send-label").textContent = sendLabel(store.getActiveType());
    document.getElementById("form-name-label").textContent = nameLabel(store.getActiveType());
  }

  // ── Grade picker (dropdown + prev/next) ────────────────────────────────
  let selectedGrade = "";
  function currentGrades() {
    return store.getActiveType() === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
  }
  function renderGradeOptions() {
    const boulder = store.getActiveType() === "boulder";
    gradeSelect.innerHTML = currentGrades()
      .map(({ g, v }) => `<option class="font-bold bg-surface text-foreground" value="${g}">${boulder ? `${g}/${v}` : g}</option>`)
      .join("");
  }
  function selectGradeByIndex(index) {
    const grades = currentGrades();
    const wrapped = ((index % grades.length) + grades.length) % grades.length;
    const { g, c } = grades[wrapped];
    selectedGrade = g;
    gradeSelect.value = g;
    gradeSelect.style.color = c;
  }
  function selectGradeByValue(value, type) {
    const grades = type === "boulder" ? BOULDER_GRADES : LEAD_GRADES;
    const idx = grades.findIndex(({ g }) => g.toUpperCase() === String(value).toUpperCase());
    selectGradeByIndex(idx === -1 ? 0 : idx);
  }
  function currentGradeIndex() {
    const idx = currentGrades().findIndex(({ g }) => g === selectedGrade);
    return idx === -1 ? 0 : idx;
  }
  gradeSelect.addEventListener("change", () => selectGradeByIndex(
    currentGrades().findIndex(({ g }) => g === gradeSelect.value)
  ));
  gradePrev.addEventListener("click", () => selectGradeByIndex(currentGradeIndex() - 1));
  gradeNext.addEventListener("click", () => selectGradeByIndex(currentGradeIndex() + 1));
  // Populated up front (not lazily on first modal open) so the <select>
  // isn't empty the very first time -- same reasoning boot() used to call
  // this explicitly before; now just part of this module's own setup.
  renderGradeOptions();
  selectGradeByIndex(0);

  // ── Status toggle (Flash = status send, flash=true) ────────────────────
  let selectedStatus = "send";
  let isFlash = false;

  // Fades the edges of #status-group's horizontal scroll to hint there's
  // more content past them -- only on whichever side actually has more to
  // scroll to, so a screen wide enough to show every button gets no fade
  // at all (both edges read as "at start" and "at end" simultaneously).
  function updateStatusScrollFade() {
    const atStart = statusGroup.scrollLeft <= 1;
    const atEnd = statusGroup.scrollLeft + statusGroup.clientWidth >= statusGroup.scrollWidth - 1;
    const mask = `linear-gradient(to right, ${atStart ? "black" : "transparent"}, black 24px, black calc(100% - 24px), ${atEnd ? "black" : "transparent"})`;
    statusGroup.style.maskImage = mask;
    statusGroup.style.webkitMaskImage = mask;
  }
  statusGroup.addEventListener("scroll", updateStatusScrollFade);
  window.addEventListener("resize", updateStatusScrollFade);

  statusGroup.addEventListener("change", e => {
    if (e.target.name !== "entry-status") return;
    const value = e.target.value;
    selectedStatus = value === "flash" ? "send" : value;
    isFlash = value === "flash";
    updateExertionVisibility();
    // #597 -- a flash is by definition a first-attempt send. Only forces
    // the value on selecting Flash, itself -- switching status away from
    // Flash afterward doesn't reset it back to 0, so a user can still
    // correct it either direction.
    if (isFlash) {
      attemptsValue = 1;
      renderAttempts();
    }
  });
  hydrateStatusIcons(entryOverlay);

  // Design doc's own rule (docs/superpowers/specs/2026-08-27-performance-
  // insights-ui-design.md "Exertion") -- visible only when the Status
  // radio group has Send checked (selectedStatus === "send", true for
  // both the plain Send and Flash buttons -- Flash isn't its own status
  // value, see isFlash above). Genuinely removed from the DOM's visible
  // flow (hidden attribute) rather than shown-but-disabled, since a field
  // that isn't there needs no explanation -- exertion is a property of
  // having sent the climb, not of an unsent attempt.
  function updateExertionVisibility() {
    exertionField.hidden = selectedStatus !== "send";
  }

  // #597 -- 0 is the slider's unset state (no real climb has zero
  // effort), so its label reads "Not set" rather than "0%".
  function renderExertionValue() {
    exertionValue.textContent = exertionSlider.value === "0" ? "Not set" : `${exertionSlider.value}%`;
  }
  exertionSlider.addEventListener("input", renderExertionValue);

  // #574 -- plain form field for v1 (no immediate-save); value only
  // persists when the rest of the entry is submitted, same as every
  // other field. Always visible regardless of status -- a project
  // accumulates attempts before it's eventually sent, same field either
  // way.
  let attemptsValue = 0;
  // #597 -- 0 reads as a dash rather than the literal number, since "0"
  // could misleadingly read as "the user set this to zero" rather than
  // "not set yet".
  function renderAttempts() {
    attemptsCount.value = attemptsValue === 0 ? "–" : String(attemptsValue);
    attemptsMinus.disabled = attemptsValue <= 0;
  }
  attemptsMinus.addEventListener("click", () => { attemptsValue = Math.max(0, attemptsValue - 1); renderAttempts(); });
  attemptsPlus.addEventListener("click", () => { attemptsValue += 1; renderAttempts(); });
  // #597 -- directly typable, digits only; any non-digit (including the
  // dash itself) is stripped rather than rejected outright, so pasting or
  // typing over the dash just works.
  attemptsCount.addEventListener("input", () => {
    const digits = attemptsCount.value.replace(/[^0-9]/g, "");
    attemptsValue = digits === "" ? 0 : Number(digits);
    renderAttempts();
  });
  attemptsCount.addEventListener("focus", () => attemptsCount.select());

  function setStatusToggle(status, flash) {
    const value = flash ? "flash" : status;
    document.querySelector(`#status-group input[value="${value}"]`).checked = true;
    selectedStatus = status;
    isFlash = flash;
  }

  // ── Date picker ──────────────────────────────────────────────────────
  datePickerBtn.addEventListener("click", () => {
    const current = dateInput.value.trim();
    dateNative.value = /^\d{4}-\d{2}-\d{2}$/.test(current)
      ? current
      : /^\d{4}-\d{2}$/.test(current)
        ? `${current}-01`
        : new Date().toISOString().slice(0, 10);
    if (dateNative.showPicker) dateNative.showPicker();
    else dateNative.focus();
  });
  dateNative.addEventListener("change", () => {
    if (dateNative.value) dateInput.value = dateNative.value;
  });

  // ── Modal open/close ─────────────────────────────────────────────────
  function open(entry) {
    editingId = entry?.id ?? null;
    entryModalTitle.textContent = editingId ? "Edit entry" : "Add entry";
    entrySubmitBtn.textContent = editingId ? "Save changes" : "Add to logbook";
    entryDeleteBtn.hidden = readOnly || !editingId;
    entryMsg.className = "hidden";

    // #251 -- disabled from the moment the form opens, not just on submit:
    // a demo visitor should never wonder whether clicking Save will do
    // something, then find out it doesn't.
    if (readOnly) {
      entrySubmitBtn.disabled = true;
      entrySubmitBtn.title = "This is a demo account -- changes aren't saved.";
    }

    nameInput.value  = entry?.name  ?? "";
    // Popover always reopens closed, regardless of whatever open/closed
    // state a previous modal session left it in.
    placePicker.reset(entry?.placeId ?? "");
    notesInput.value = entry?.notes ?? "";
    videoInput.value = entry?.video ?? "";
    // Default to today only in add mode -- ?? alone can't distinguish "no
    // entry" from "entry has no date", and edit mode with the latter was
    // silently pre-filling today's date, which then got saved if the user
    // didn't notice and just clicked Save (#139).
    dateInput.value  = entry ? (entry.date ?? "") : new Date().toISOString().slice(0, 10);

    renderGradeOptions();
    if (entry) selectGradeByValue(entry.grade, entry.type);
    else selectGradeByIndex(0);
    updateFormStatusLabels();
    setStatusToggle(entry?.status ?? "send", Boolean(entry?.firstAttempt));
    updateExertionVisibility();
    exertionSlider.value = entry?.rpe ?? 0;
    renderExertionValue();
    attemptsValue = entry?.attemptsToSend ?? 0;
    renderAttempts();
    hardestMoves.setRows((entry?.moves ?? []).filter(m => m.difficulty === "hardest"));
    easiestMoves.setRows((entry?.moves ?? []).filter(m => m.difficulty === "easiest"));
    painMoves.setRows(entry?.painMoves ?? []);

    openModal(entryOverlay);
    nameInput.focus();
    // scrollWidth/clientWidth both read as 0 while the modal is still
    // hidden -- wait a frame for it to actually paint before measuring.
    requestAnimationFrame(updateStatusScrollFade);
  }
  document.getElementById("add-btn").addEventListener("click", () => open(null));
  document.getElementById("entry-close").addEventListener("click", () => closeModal(entryOverlay));
  entryOverlay.addEventListener("click", e => { if (e.target === entryOverlay) closeModal(entryOverlay); });

  // ── Submit (online -> API, offline -> queue) ───────────────────────────
  entryForm.addEventListener("submit", async e => {
    e.preventDefault();
    // #251 -- a disabled submit button already blocks a real click, but
    // pressing Enter in a text field still fires this listener via the
    // form's implicit submission -- guarded here too so readOnly mode
    // never reaches adminFetch regardless of how submit was triggered.
    if (readOnly) return;
    entrySubmitBtn.disabled = true;
    entryMsg.className = "hidden";

    const name  = nameInput.value.trim();
    const entry = {
      id:     editingId ?? crypto.randomUUID(),
      // The committed value, not any in-progress popover search text --
      // same reasoning the old country picker had: whatever's mid-search
      // isn't necessarily a valid, or the intended, selection.
      placeId: placePicker.getPlaceId(),
      name,
      grade:  selectedGrade,
      type:   store.getActiveType(),
      status: selectedStatus,
      firstAttempt: isFlash,
      date:   dateInput.value.trim() || null,
      notes:  notesInput.value.trim() || null,
      video:  videoInput.value.trim() || null,
      rpe: selectedStatus === "send" ? Number(exertionSlider.value) : null,
      attemptsToSend: attemptsValue,
      moves: [...hardestMoves.getRows(), ...easiestMoves.getRows()],
      painMoves: painMoves.getRows(),
    };

    // #224 -- shape/rule check against the same schema the server enforces,
    // before ever touching the network or the offline queue. Unlike a
    // network failure below, a shape problem (e.g. no place selected, a
    // malformed video URL) won't fix itself on retry/sync, so it's
    // reported immediately rather than queued to fail again later.
    const shapeErr = validateEntryShape(entry);
    if (shapeErr) {
      entryMsg.textContent = shapeErr;
      entryMsg.className = ERROR_MSG_CLASS;
      entrySubmitBtn.disabled = false;
      return;
    }

    const op = editingId ? "edit" : "add";

    try {
      const res = await adminFetch(adminDataUrl, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (isAuthRedirect(res)) throw new Error("not-authenticated");
      const data = await res.json();
      if (!res.ok) {
        entryMsg.textContent = data.error ?? `Error ${res.status}`;
        entryMsg.className = ERROR_MSG_CLASS;
        entrySubmitBtn.disabled = false;
        return;
      }
      store.setEntries(data.entries);
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    } catch (err) {
      // Offline, server unreachable, or the Access session lapsed (see
      // adminFetch above) — queue for later sync either way, and reflect
      // the change locally so it shows up right away. Always appended,
      // never collapsed onto an existing queue item for this id (#268) --
      // a genuine event log (add, then edit, then edit again all queue
      // separately) replays in order and resolves correctly, since
      // syncPending() already replays every queue item unconditionally
      // and applyPendingQueue() already processes them as a sequential
      // reducer; queue length in this app is always small enough that a
      // few extra harmless replayed requests cost nothing worth the
      // collapsing logic's complexity.
      if (err.message === "not-authenticated") {
        store.setLoggedIn(false); // Store mutation -- notify() covers the admin-bar update (#264)
      }
      const queue = getQueue();
      queue.push({ kind: "entry", op, record: entry });
      setQueue(queue);
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    }

    entrySubmitBtn.disabled = false;
  });

  // ── Delete (online -> API, offline -> queue) ───────────────────────────
  entryDeleteBtn.addEventListener("click", async () => {
    if (readOnly || !editingId) return;
    if (!confirm(`Delete "${nameInput.value.trim()}"? This can't be undone.`)) return;

    entryDeleteBtn.disabled = true;
    entryMsg.className = "hidden";
    const id = editingId;
    const entrySnapshot = store.getEntries().find(e => e.id === id);

    // Always attempts the real DELETE now, even for an entry that only
    // ever existed as a queued, never-synced add (#268) -- the old
    // queuedAdd short-circuit avoided a doomed round-trip back when
    // handleDelete 404d on a missing id; now that it's idempotent
    // (server/api/logbook.js, #268), a delete for something the server
    // never saw just no-ops successfully, same as any other delete.
    try {
      const res = await adminFetch(`${adminDataUrl}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (isAuthRedirect(res)) throw new Error("not-authenticated");
      const data = await res.json();
      if (!res.ok) {
        entryMsg.textContent = data.error ?? `Error ${res.status}`;
        entryMsg.className = ERROR_MSG_CLASS;
        entryDeleteBtn.disabled = false;
        return;
      }
      store.setEntries(data.entries);
      // The delete is now the authoritative final word on this entity --
      // purge any queue items still referencing it (most notably a
      // queued "add" that never got a chance to sync) before reapplying
      // whatever's left. Without this, a still-queued add would survive
      // and get replayed on the next sync, resurrecting an entry the
      // user just explicitly deleted.
      setQueue(getQueue().filter(item => !(item.kind === "entry" && item.record.id === id)));
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    } catch (err) {
      // Offline, server unreachable, or the Access session lapsed (see
      // adminFetch above) — queue for later sync either way. Keep the
      // entry visible (marked pending-delete via applyPendingQueue)
      // rather than removing it locally; it only disappears once the
      // delete actually syncs. Appended, not filtered against prior
      // items for this id (#268) -- a genuine event log (e.g. a queued
      // add followed by a queued delete for the same never-synced entry)
      // replays in order and resolves correctly: the add creates it,
      // then the delete removes it, on the next sync.
      if (err.message === "not-authenticated") {
        store.setLoggedIn(false); // Store mutation -- notify() covers the admin-bar update (#264)
      }
      const queue = getQueue();
      queue.push({ kind: "entry", op: "delete", record: entrySnapshot ?? { id } });
      setQueue(queue);
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    }

    entryDeleteBtn.disabled = false;
  });

  return { open };
}
