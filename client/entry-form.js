import { SCALES, SCALES_BY_DISCIPLINE, gradeOrdinal, gradeColorForScale, nonStandardLabel, parseNonStandardLabel, resolveScaleId, DEFAULT_SCALE_BY_TYPE } from "../shared/grade-data.js";
import { gradeDisplayLabelForScale } from "../shared/volume-stats.js";
import { flashLabel, sendLabel, nameLabel, hydrateStatusIcons } from "./status.js";
import { createPlacePicker } from "./place-picker.js";
import { createMoveRowList } from "./move-tagging.js";
import { validateEntryShape } from "../shared/entry-schema.js";
import { createListPicker, renderOptionList } from "./modal-utils.js";
import { calendarDatePickerHtml, createCalendarDatePicker } from "./calendar-date-picker.js";

const ERROR_MSG_CLASS = "mt-[.85rem] error-message";

export function createEntryForm({
  store,
  openModal,
  closeModal,
  adminFetch,
  isAuthRedirect,
  getQueue,
  setQueue,
  enqueue,
  syncPending,
  entriesWriteUrl,
  locationsWriteUrl,
  placesWriteUrl,
  // A getter: settings may still be loading when this is built.
  isAthleteMode,
  // Demo mode: every field works, Save never does.
  readOnly = false,
}) {
  const entryOverlay   = document.getElementById("entry-overlay");
  const entryForm      = document.getElementById("entry-form");
  const entryModalTitle= document.getElementById("entry-modal-title");
  const nameInput  = document.getElementById("entry-name");
  const notesInput = document.getElementById("entry-notes");
  const videoInput = document.getElementById("entry-video");
  const gradePrev   = document.getElementById("grade-prev");
  const gradeNext   = document.getElementById("grade-next");
  const gradeNsFields   = document.getElementById("grade-ns-fields");
  const dateInput  = document.getElementById("entry-date");
  const datePickerMount = document.getElementById("date-picker-mount");
  const entrySubmitBtns = [document.getElementById("entry-submit-btn"), document.getElementById("entry-submit-btn-2")];
  const entryDeleteBtn = document.getElementById("entry-delete-btn");
  const entryMsg      = document.getElementById("entry-msg");
  const entryNavForward = document.getElementById("entry-nav-forward");
  const entryNavBack = document.getElementById("entry-nav-back");
  const entryPagesViewport = document.getElementById("entry-pages-viewport");
  const entryPagesTrack = document.getElementById("entry-pages-track");
  const entryPage1 = document.getElementById("entry-page-1");
  const entryPage2 = document.getElementById("entry-page-2");

  // Focus moves to the error so a keyboard user sees it; the template makes it a live region.
  function showEntryError(message) {
    entryMsg.textContent = message;
    entryMsg.className = ERROR_MSG_CLASS;
    entryMsg.focus();
  }
  const statusGroup = document.getElementById("status-group");
  const sportStyleField = document.getElementById("sport-style-field");
  const sportStyleGroup = document.getElementById("sport-style-group");
  const exertionField = document.getElementById("exertion-field");
  const exertionSlider = document.getElementById("exertion-slider");
  const exertionValue = document.getElementById("exertion-value");
  const attemptsMinus = document.getElementById("attempts-minus");
  const attemptsPlus = document.getElementById("attempts-plus");
  const attemptsCount = document.getElementById("attempts-count");

  const placePicker = createPlacePicker({
    store, openModal, closeModal, adminFetch, isAuthRedirect,
    getQueue, enqueue,
    locationsWriteUrl, placesWriteUrl,
  });

  const hardestMoves = createMoveRowList({ listEl: document.getElementById("hardest-moves-list"), addBtnEl: document.getElementById("hardest-moves-add"), hasDifficulty: true, defaultDifficulty: "hardest", listLabel: "hardest move" });
  const easiestMoves = createMoveRowList({ listEl: document.getElementById("easiest-moves-list"), addBtnEl: document.getElementById("easiest-moves-add"), hasDifficulty: true, defaultDifficulty: "easiest", listLabel: "easiest move" });
  const painMoves = createMoveRowList({ listEl: document.getElementById("pain-moves-list"), addBtnEl: document.getElementById("pain-moves-add"), hasDifficulty: false, listLabel: "pain/injury move" });

  let editingId = null; // null = add mode

  function updateFormStatusLabels() {
    document.getElementById("form-flash-label").textContent = flashLabel(store.getActiveType());
    document.getElementById("form-send-label").textContent = sendLabel(store.getActiveType());
    document.getElementById("form-name-label").textContent = nameLabel(store.getActiveType());
    const type = store.getActiveType();
    document.getElementById("attempts-gap-hint").textContent =
      `Feeds your ${flashLabel(type).toLowerCase()}/${sendLabel(type).toLowerCase()} gap view.`;
  }

  function isNonStandardScaleId(id) {
    return id === "font-non-standard" || id === "french-non-standard";
  }
  function gradeScalePrefKey(type) {
    return `logbook_grade_scale_entry_${type}`;
  }
  // Guarded: the Workers test pool has no localStorage.
  function loadGradeScalePref(type) {
    let stored = null;
    try { stored = localStorage.getItem(gradeScalePrefKey(type)); } catch { /* ignore */ }
    return resolveScaleId(type, stored, DEFAULT_SCALE_BY_TYPE[type]);
  }
  function saveGradeScalePref(type, scaleId) {
    try { localStorage.setItem(gradeScalePrefKey(type), scaleId); } catch { /* ignore */ }
  }

  let activeGradeScaleId = DEFAULT_SCALE_BY_TYPE.boulder; // real value set in open()
  function currentGradeScaleId() { return activeGradeScaleId; }

  function makeListPicker(idPrefix) {
    return createListPicker({
      trigger: document.getElementById(`${idPrefix}-btn`),
      popover: document.getElementById(`${idPrefix}-popover`),
      listbox: document.getElementById(`${idPrefix}-listbox`),
      containerSelector: `#${idPrefix}-wrap`,
    });
  }

  const gradeValuePicker = makeListPicker("grade-value");
  const gradeNsNumberPicker = makeListPicker("grade-ns-number");
  const gradeNsLetterPicker = makeListPicker("grade-ns-letter");
  const gradeNsModifierPicker = makeListPicker("grade-ns-modifier");
  const gradeScalePicker = makeListPicker("grade-scale");

  gradeScalePicker.setRender(() => {
    const type = store.getActiveType();
    const currentId = currentGradeScaleId();
    renderOptionList(document.getElementById("grade-scale-listbox"), SCALES_BY_DISCIPLINE[type], {
      getKey: s => s.id, getLabel: s => s.name, isSelected: s => s.id === currentId,
    });
  });
  gradeScalePicker.setOnSelect(scaleId => chooseScale(scaleId));

  function chooseScale(newScaleId) {
    const type = store.getActiveType();
    const priorScaleId = currentGradeScaleId();
    // Keeps the nearest grade across a scale change (6A becomes V3), not the first grade.
    const priorOrdinal = gradeOrdinal(selectedGrade, priorScaleId);
    activeGradeScaleId = newScaleId;
    gradeScaleByType[type] = newScaleId;
    saveGradeScalePref(type, newScaleId);
    renderGradeOptions();
    const preservedLabel = priorOrdinal !== null ? SCALES[newScaleId].toLabel(priorOrdinal) : null;
    if (preservedLabel !== null) selectGradeByValue(preservedLabel, type, newScaleId);
    else selectDefaultGrade();
  }

  const NS_NUMBERS = Array.from({ length: 9 }, (_, i) => i + 1);
  const NS_LETTERS = [null, "a", "b", "c"];
  const NS_MODIFIERS = [null, "-", "+"];
  // "n/a", not a dash: null is a real, selectable value here.
  function nsButtonLabel(v) { return v === null ? "n/a" : String(v); }

  let nsNumber = 1, nsLetter = null, nsModifier = null;

  gradeNsNumberPicker.setRender(() => {
    renderOptionList(document.getElementById("grade-ns-number-listbox"), NS_NUMBERS, {
      getKey: n => String(n), getLabel: n => String(n), isSelected: n => n === nsNumber,
    });
  });
  gradeNsNumberPicker.setOnSelect(key => { nsNumber = Number(key); updateNonStandardFields(); });

  gradeNsLetterPicker.setRender(() => {
    renderOptionList(document.getElementById("grade-ns-letter-listbox"), NS_LETTERS, {
      getKey: l => l ?? "", getLabel: l => nsButtonLabel(l), isSelected: l => l === nsLetter,
    });
  });
  gradeNsLetterPicker.setOnSelect(key => { nsLetter = key || null; updateNonStandardFields(); });

  gradeNsModifierPicker.setRender(() => {
    renderOptionList(document.getElementById("grade-ns-modifier-listbox"), NS_MODIFIERS, {
      getKey: m => m ?? "", getLabel: m => nsButtonLabel(m), isSelected: m => m === nsModifier,
    });
  });
  gradeNsModifierPicker.setOnSelect(key => { nsModifier = key || null; updateNonStandardFields(); });

  function nonStandardValueFromFields() {
    return nonStandardLabel(nsNumber, nsLetter, nsModifier);
  }
  function updateNonStandardFields() {
    selectedGrade = nonStandardValueFromFields();
    gradeNsNumberPicker.trigger.textContent = String(nsNumber);
    gradeNsLetterPicker.trigger.textContent = nsButtonLabel(nsLetter);
    gradeNsModifierPicker.trigger.textContent = nsButtonLabel(nsModifier);
    const bg = gradeColorForScale(selectedGrade, currentGradeScaleId(), store.getActiveType());
    [gradeNsNumberPicker.trigger, gradeNsLetterPicker.trigger, gradeNsModifierPicker.trigger]
      .forEach(el => { el.style.backgroundColor = bg; });
  }
  function setNonStandardFieldsFromLabel(label) {
    const parsed = parseNonStandardLabel(label) ?? { number: 1, letter: null, modifier: null };
    nsNumber = parsed.number;
    nsLetter = parsed.letter;
    nsModifier = parsed.modifier;
    updateNonStandardFields();
  }

  let selectedGrade = "";
  let gradeScaleByType = { boulder: loadGradeScalePref("boulder"), sport: loadGradeScalePref("sport") };

  function updateGradeFieldVisibility() {
    const nonStandard = isNonStandardScaleId(currentGradeScaleId());
    gradePrev.hidden = nonStandard;
    document.getElementById("grade-value-wrap").hidden = nonStandard;
    gradeNext.hidden = nonStandard;
    gradeNsFields.hidden = !nonStandard;
  }

  function gradeOptionLabel(label, scaleId, type) {
    const boulder = type === "boulder";
    const hint = boulder && scaleId !== "v-scale" ? `/${gradeDisplayLabelForScale(label, scaleId, type)}` : "";
    return `${label}${hint}`;
  }
  gradeValuePicker.setRender(() => {
    const type = store.getActiveType();
    const scaleId = currentGradeScaleId();
    renderOptionList(document.getElementById("grade-value-listbox"), SCALES[scaleId].labels, {
      getKey: g => g, getLabel: g => gradeOptionLabel(g, scaleId, type), isSelected: g => g === selectedGrade,
    });
  });
  gradeValuePicker.setOnSelect(label => selectGradeByValue(label, store.getActiveType(), currentGradeScaleId()));

  function renderGradeOptions() {
    updateGradeFieldVisibility();
  }
  function selectGradeByIndex(index) {
    const labels = SCALES[currentGradeScaleId()].labels;
    const wrapped = ((index % labels.length) + labels.length) % labels.length;
    const g = labels[wrapped];
    selectedGrade = g;
    gradeValuePicker.trigger.textContent = gradeOptionLabel(g, currentGradeScaleId(), store.getActiveType());
    gradeValuePicker.trigger.style.backgroundColor = gradeColorForScale(g, currentGradeScaleId(), store.getActiveType());
  }
  function selectGradeByValue(value, type, scaleId) {
    if (isNonStandardScaleId(scaleId)) {
      setNonStandardFieldsFromLabel(value);
      return;
    }
    const idx = SCALES[scaleId].labels.findIndex(g => g.toUpperCase() === String(value).toUpperCase());
    selectGradeByIndex(idx === -1 ? 0 : idx);
  }
  function selectDefaultGrade() {
    if (isNonStandardScaleId(currentGradeScaleId())) setNonStandardFieldsFromLabel(nonStandardLabel(1, null, null));
    else selectGradeByIndex(0);
  }
  function currentGradeIndex() {
    const idx = SCALES[currentGradeScaleId()].labels.findIndex(g => g === selectedGrade);
    return idx === -1 ? 0 : idx;
  }
  gradePrev.addEventListener("click", () => selectGradeByIndex(currentGradeIndex() - 1));
  gradeNext.addEventListener("click", () => selectGradeByIndex(currentGradeIndex() + 1));
  activeGradeScaleId = gradeScaleByType[store.getActiveType()];
  renderGradeOptions();
  selectDefaultGrade();

  let selectedStatus = "send";
  let isFlash = false;

  // Fades only the edge that has more to scroll to.
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
    // A flash is a first-attempt send, so selecting Flash sets attempts to 1; leaving it doesn't reset.
    if (isFlash) {
      attemptsValue = 1;
      renderAttempts();
    }
  });
  hydrateStatusIcons(entryOverlay);

  // Exertion belongs to a send, so it's hidden, not disabled, otherwise.
  function updateExertionVisibility() {
    exertionField.hidden = selectedStatus !== "send";
  }

  // 0 is unset: no climb takes zero effort.
  function renderExertionValue() {
    exertionValue.textContent = exertionSlider.value === "0" ? "Not set" : `${exertionSlider.value}%`;
  }
  exertionSlider.addEventListener("input", renderExertionValue);

  let attemptsValue = 0;
  // A dash, not 0: 0 would read as a value the user chose.
  function renderAttempts() {
    attemptsCount.value = attemptsValue === 0 ? "–" : String(attemptsValue);
    attemptsMinus.disabled = attemptsValue <= 0;
  }
  attemptsMinus.addEventListener("click", () => { attemptsValue = Math.max(0, attemptsValue - 1); renderAttempts(); });
  attemptsPlus.addEventListener("click", () => { attemptsValue += 1; renderAttempts(); });
  // Non-digits are stripped, not rejected, so typing over the dash works.
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

  let selectedSportStyle = "lead";
  function setSportStyleToggle(style) {
    document.querySelector(`#sport-style-group input[value="${style}"]`).checked = true;
    selectedSportStyle = style;
  }
  function updateSportStyleVisibility() {
    sportStyleField.hidden = store.getActiveType() !== "sport";
  }
  sportStyleGroup.addEventListener("change", e => {
    if (e.target.name !== "sport-style") return;
    selectedSportStyle = e.target.value;
  });

  // The grid only writes YYYY-MM-DD; a month-only date is typed.
  datePickerMount.innerHTML = calendarDatePickerHtml("date-picker");
  createCalendarDatePicker({
    containerEl: datePickerMount,
    idPrefix: "date-picker",
    getValue: () => dateInput.value,
    onSelect: dateStr => { dateInput.value = dateStr; },
  });

  function showPage(pageNum) {
    const fromHeight = entryPagesViewport.getBoundingClientRect().height;
    entryPagesViewport.style.height = `${fromHeight}px`;
    entryPage1.inert = pageNum !== 1;
    entryPage2.inert = pageNum !== 2;
    // Next frame, so the old height paints before the transition to the new one.
    requestAnimationFrame(() => {
      const target = pageNum === 2 ? entryPage2 : entryPage1;
      entryPagesTrack.style.transform = pageNum === 2 ? "translateX(-100%)" : "translateX(0)";
      entryPagesViewport.style.height = `${target.scrollHeight}px`;
      // preventScroll: a native scroll fought the slide.
      target.focus({ preventScroll: true });
    });
  }
  entryNavForward.addEventListener("click", () => showPage(2));
  entryNavBack.addEventListener("click", () => showPage(1));

  function open(entry) {
    editingId = entry?.id ?? null;
    entryModalTitle.textContent = editingId ? "Edit entry" : "Add entry";
    entryDeleteBtn.hidden = readOnly || !editingId;
    entryMsg.className = "hidden";
    entryNavForward.hidden = !isAthleteMode();
    // Always opens on page 1: performance data is a deliberate second step.
    entryPagesTrack.style.transform = "translateX(0)";
    entryPagesViewport.style.height = "";
    entryPage1.inert = false;
    entryPage2.inert = true;

    // Disabled from the start, so a demo visitor isn't misled.
    if (readOnly) {
      entrySubmitBtns.forEach(btn => {
        btn.disabled = true;
        btn.title = "This is a demo account -- changes aren't saved.";
      });
    }

    nameInput.value  = entry?.name  ?? "";
    placePicker.reset(entry?.placeId ?? "");
    notesInput.value = entry?.notes ?? "";
    videoInput.value = entry?.video ?? "";
    // Today only when adding; an existing entry without a date stays blank.
    dateInput.value  = entry ? (entry.date ?? "") : new Date().toISOString().slice(0, 10);

    // Editing shows the entry's own scale; only a new entry uses the saved preference.
    const type = store.getActiveType();
    activeGradeScaleId = entry
      ? (entry.gradeScale ?? DEFAULT_SCALE_BY_TYPE[type])
      : loadGradeScalePref(type);
    renderGradeOptions();
    if (entry) selectGradeByValue(entry.grade, type, activeGradeScaleId);
    else selectDefaultGrade();
    updateFormStatusLabels();
    setStatusToggle(entry?.status ?? "send", Boolean(entry?.firstAttempt));
    updateSportStyleVisibility();
    setSportStyleToggle(entry?.sportStyle ?? "lead");
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
    requestAnimationFrame(updateStatusScrollFade);
  }
  document.getElementById("add-btn").addEventListener("click", () => open(null));
  document.getElementById("entry-close").addEventListener("click", () => closeModal(entryOverlay));
  entryOverlay.addEventListener("click", e => { if (e.target === entryOverlay) closeModal(entryOverlay); });

  function queueAndSync(item) {
    enqueue(item);
    store.applyPendingQueue(getQueue());
    closeModal(entryOverlay);
    if (store.isLoggedIn()) syncPending();
  }

  entryForm.addEventListener("submit", async e => {
    e.preventDefault();
    // Enter in a field submits even with the button disabled.
    if (readOnly) return;
    entrySubmitBtns.forEach(btn => { btn.disabled = true; });
    entryMsg.className = "hidden";

    const name  = nameInput.value.trim();
    const entry = {
      id:     editingId ?? crypto.randomUUID(),
      // The committed place, not in-progress search text.
      placeId: placePicker.getPlaceId(),
      name,
      grade:  selectedGrade,
      gradeScale: activeGradeScaleId,
      type:   store.getActiveType(),
      status: selectedStatus,
      firstAttempt: isFlash,
      sportStyle: store.getActiveType() === "sport" ? selectedSportStyle : null,
      date:   dateInput.value.trim() || null,
      notes:  notesInput.value.trim() || null,
      video:  videoInput.value.trim() || null,
      rpe: selectedStatus === "send" ? Number(exertionSlider.value) : null,
      attemptsToSend: attemptsValue,
      moves: [...hardestMoves.getRows(), ...easiestMoves.getRows()],
      painMoves: painMoves.getRows(),
    };

    // Checked before the network or queue: a shape error won't fix itself on retry.
    const shapeErr = validateEntryShape(entry);
    if (shapeErr) {
      showEntryError(shapeErr);
      entrySubmitBtns.forEach(btn => { btn.disabled = false; });
      return;
    }

    const op = editingId ? "edit" : "add";

    // While anything is queued, a save joins the back of the queue so it can't be overtaken.
    if (getQueue().length) {
      queueAndSync({ kind: "entry", op, record: entry });
      entrySubmitBtns.forEach(btn => { btn.disabled = false; });
      return;
    }

    try {
      const res = await adminFetch(entriesWriteUrl, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (isAuthRedirect(res)) throw new Error("not-authenticated");
      const data = await res.json();
      if (!res.ok) {
        showEntryError(data.error ?? `Error ${res.status}`);
        entrySubmitBtns.forEach(btn => { btn.disabled = false; });
        return;
      }
      store.setEntries(data.entries);
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    } catch (err) {
      // Queue it and show it now. Always appended: the queue is an ordered event log.
      if (err.message === "not-authenticated") {
        store.setLoggedIn(false);
      }
      enqueue({ kind: "entry", op, record: entry });
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    }

    entrySubmitBtns.forEach(btn => { btn.disabled = false; });
  });

  entryDeleteBtn.addEventListener("click", async () => {
    if (readOnly || !editingId) return;
    if (!confirm(`Delete "${nameInput.value.trim()}"? This can't be undone.`)) return;

    entryDeleteBtn.disabled = true;
    entryMsg.className = "hidden";
    const id = editingId;
    const entrySnapshot = store.getEntries().find(e => e.id === id);

    // Same rule as a save: queued behind anything older.
    if (getQueue().length) {
      queueAndSync({ kind: "entry", op: "delete", record: entrySnapshot ?? { id } });
      entryDeleteBtn.disabled = false;
      return;
    }

    // Deletes are idempotent, so even a never-synced entry is sent.
    try {
      const res = await adminFetch(`${entriesWriteUrl}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (isAuthRedirect(res)) throw new Error("not-authenticated");
      const data = await res.json();
      if (!res.ok) {
        showEntryError(data.error ?? `Error ${res.status}`);
        entryDeleteBtn.disabled = false;
        return;
      }
      store.setEntries(data.entries);
      // Purge queued items for this entry, or a queued add would resurrect it.
      setQueue(getQueue().filter(item => !(item.kind === "entry" && item.record.id === id)));
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    } catch (err) {
      // Queued and shown as pending-delete until it syncs; appended like any other event.
      if (err.message === "not-authenticated") {
        store.setLoggedIn(false);
      }
      enqueue({ kind: "entry", op: "delete", record: entrySnapshot ?? { id } });
      store.applyPendingQueue(getQueue());
      closeModal(entryOverlay);
    }

    entryDeleteBtn.disabled = false;
  });

  return { open };
}
