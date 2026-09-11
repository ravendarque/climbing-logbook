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
import { SCALES, SCALES_BY_DISCIPLINE, gradeOrdinal, gradeColorForScale, nonStandardLabel, parseNonStandardLabel } from "../shared/grade-data.js";
import { gradeDisplayLabelForScale } from "../shared/volume-stats.js";
import { flashLabel, sendLabel, nameLabel, hydrateStatusIcons } from "./status.js";
import { createPlacePicker } from "./place-picker.js";
import { createMoveRowList } from "./move-tagging.js";
import { validateEntryShape } from "../shared/entry-schema.js";
import { createListPicker, renderOptionList } from "./modal-utils.js";

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
  const gradePrev   = document.getElementById("grade-prev");
  const gradeNext   = document.getElementById("grade-next");
  const gradeNsFields   = document.getElementById("grade-ns-fields");
  const dateInput  = document.getElementById("entry-date");
  const datePickerBtn = document.getElementById("date-picker-btn");
  const datePickerPopover = document.getElementById("date-picker-popover");
  const datePickerMonthLabel = document.getElementById("date-picker-month-label");
  const datePickerWeekdays = document.getElementById("date-picker-weekdays");
  const datePickerGrid = document.getElementById("date-picker-grid");
  const datePickerPrevMonth = document.getElementById("date-picker-prev-month");
  const datePickerNextMonth = document.getElementById("date-picker-next-month");
  const entrySubmitBtn = document.getElementById("entry-submit-btn");
  const entryDeleteBtn = document.getElementById("entry-delete-btn");
  const entryMsg      = document.getElementById("entry-msg");
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

  // ── Grade pickers (#703) ────────────────────────────────────────────────
  // Button + popover listbox throughout, not native <select>s -- a native
  // select's own OPEN dropdown panel is OS/browser-rendered chrome that
  // plain CSS can't restyle to match this app's established popover
  // convention (rounded-app border, the top-[calc(100%+.4rem)] gap, the
  // shadow) the way every other picker in this app already does (place
  // picker, discipline picker, header menu -- all via
  // client/modal-utils.js's createDisclosure). Raven, 2026-09-11: caught
  // in review, comparing directly against the Place picker on this same
  // form and the header's own burger menu.

  // Which of the discipline's scales the grade controls below currently
  // show. Distinct from the persisted per-discipline PREFERENCE
  // (gradeScaleByType) -- editing an existing entry shows its own actual
  // gradeScale regardless of the preference (spec's own acceptance
  // criterion), so this is reset explicitly in open(), not derived from
  // the preference every time.
  // A Non-standard scale is never the default for either discipline --
  // it exists for when a guidebook's own notation doesn't match the real
  // published scale, not as the ordinary starting point (Raven, 2026-09-11).
  const DEFAULT_SCALE_BY_TYPE = { boulder: "font", sport: "french" };
  function isNonStandardScaleId(id) {
    return id === "font-non-standard" || id === "french-non-standard";
  }
  function gradeScalePrefKey(type) {
    return `logbook_grade_scale_entry_${type}`;
  }
  // Guards every localStorage call -- this module has no test file of its
  // own today (DOM-coupled, e2e-verified only, same as every other picker
  // in this file), but the Workers pool other client/*.js tests run under
  // has no localStorage global at all (store.js's own comment), so a bare
  // call here would be one accidental import away from crashing a future
  // test file that does exercise this module.
  function loadGradeScalePref(type) {
    let stored = null;
    try { stored = localStorage.getItem(gradeScalePrefKey(type)); } catch { /* ignore */ }
    const validIds = SCALES_BY_DISCIPLINE[type].map(s => s.id);
    return validIds.includes(stored) ? stored : DEFAULT_SCALE_BY_TYPE[type];
  }
  function saveGradeScalePref(type, scaleId) {
    try { localStorage.setItem(gradeScalePrefKey(type), scaleId); } catch { /* ignore */ }
  }

  let activeGradeScaleId = DEFAULT_SCALE_BY_TYPE.boulder; // real value set in open()
  function currentGradeScaleId() { return activeGradeScaleId; }

  // Same role="option"/data-key/checkmark convention as client/
  // place-picker.js's own place-listbox (#241/#403) and the discipline
  // picker's static options (public/logbook/components/climbing-
  // discipline-picker.js) -- one shared implementation
  // (client/modal-utils.js's createListPicker/renderOptionList) instead
  // of a local copy per consumer (#704 needed the identical pattern for
  // its own report scale picker, which is what prompted extracting this
  // out of this file rather than leaving it as a second near-duplicate).
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
    // Preserve the closest equivalent grade across the scale change via
    // the shared canonical ordinal -- switching from Font to V-scale
    // while "6A" is selected should land on "V3", not silently reset to
    // the new scale's first grade.
    const priorOrdinal = gradeOrdinal(selectedGrade, priorScaleId);
    activeGradeScaleId = newScaleId;
    gradeScaleByType[type] = newScaleId;
    saveGradeScalePref(type, newScaleId);
    renderGradeOptions();
    const preservedLabel = priorOrdinal !== null ? SCALES[newScaleId].toLabel(priorOrdinal) : null;
    if (preservedLabel !== null) selectGradeByValue(preservedLabel, type, newScaleId);
    else selectDefaultGrade();
  }

  // ── Non-standard scale fields (number/letter/modifier) ─────────────────
  // Both Non-standard scales (font-non-standard/french-non-standard)
  // share the identical field shape -- shared/grade-data.js's own
  // nonStandardOrdinal formula has no per-discipline parameters either --
  // so these three lists never need re-rendering per scale, only
  // re-rendering to reflect the currently-selected value (isSelected).
  const NS_NUMBERS = Array.from({ length: 9 }, (_, i) => i + 1);
  const NS_LETTERS = [null, "a", "b", "c"];
  const NS_MODIFIERS = [null, "-", "+"];
  // Raven, 2026-09-12: "no letter"/"no modifier" reads as "n/a", lowercase
  // -- not an en dash (that read as a placeholder/unset state, when null
  // is actually a real, selectable value here, same as every other
  // letter/modifier option).
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
    // #463/#696/#702 -- tier colour via the scale-aware gradeColorForScale,
    // the control's background, not its text (text is a uniform ink from
    // the grade-select utility).
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

  // ── Grade value picker (button + popover, for the 7 data-driven scales) ─
  let selectedGrade = "";
  // Both the entry-form preference (used to default a NEW entry's scale)
  // and the modal's own active scale (activeGradeScaleId above) start
  // from this -- reset properly for the real active discipline in
  // renderGradeOptions()'s own first call below and every open().
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
    // #12/#463's own "show the V-scale equivalent alongside the Font
    // label" convenience, generalized: shown for any Boulder scale other
    // than V-scale itself (which would be redundant against its own
    // label).
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
    // Popover contents render lazily on open (gradeValuePicker's own
    // onOpen) -- nothing to pre-populate here beyond visibility.
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
  // Populated up front (not lazily on first modal open) so the button
  // isn't empty the very first time -- same reasoning boot() used to call
  // this explicitly before; now just part of this module's own setup.
  activeGradeScaleId = gradeScaleByType[store.getActiveType()];
  renderGradeOptions();
  selectDefaultGrade();

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

  // ── Sport style toggle (Lead vs Top Rope, #643) ─────────────────────────
  // Only meaningful -- and only shown -- for a Sport entry (VALID_SPORT_STYLES,
  // shared/entry-schema.js); Boulder never reaches this field at all, since
  // there's no protection-style distinction for a boulder problem.
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

  // ── Date picker (#703-review) ────────────────────────────────────────
  // A real month-grid popover, same button+popover convention as every
  // other picker in this form -- see public/log/index.html's own comment
  // on this markup for why the native <input type="date"> it replaces
  // had to go. Only ever writes a full YYYY-MM-DD (a day grid can't
  // represent "just a month") -- the free-text field is still how a
  // YYYY-MM-only date gets entered, unchanged.
  const DATE_PICKER_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DATE_PICKER_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const DAY_CELL_CLASSES = "h-7 flex items-center justify-center rounded-[calc(var(--radius-app)-2px)] text-[.78rem] text-foreground border-0 bg-transparent cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] aria-selected:bg-accent aria-selected:text-accent-foreground aria-selected:hover:bg-accent aria-[current=date]:font-bold aria-[current=date]:text-accent";

  // The view can navigate away from whatever the field's own value is
  // (Prev/Next month) without that being a real selection -- kept as its
  // own state, only re-seeded from the field's current value each time
  // the popover opens (onOpen below), not on every render.
  let calendarViewYear, calendarViewMonth; // month is 0-indexed, Date's own convention

  // Accepts the same two shapes the free-text field itself does
  // (YYYY-MM-DD, YYYY-MM) -- an unparseable or empty value falls back to
  // today's own month, same fallback the old native-picker code path had.
  function parseDateFieldValue() {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(dateInput.value.trim());
    if (m) return { year: +m[1], month: +m[2] - 1, day: m[3] ? +m[3] : null };
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth(), day: null };
  }

  function renderDatePicker() {
    const selected = parseDateFieldValue();
    datePickerMonthLabel.textContent = `${DATE_PICKER_MONTHS[calendarViewMonth]} ${calendarViewYear}`;
    datePickerWeekdays.innerHTML = DATE_PICKER_WEEKDAYS.map(w => `<span>${escapeHtml(w)}</span>`).join("");

    const startWeekday = new Date(calendarViewYear, calendarViewMonth, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    const cells = Array.from({ length: startWeekday }, () => "<span></span>");
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calendarViewYear}-${String(calendarViewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const isSelected = selected.year === calendarViewYear && selected.month === calendarViewMonth && selected.day === day;
      cells.push(`<button type="button" class="${DAY_CELL_CLASSES}" data-date="${dateStr}" aria-selected="${isSelected}" aria-current="${dateStr === todayStr ? "date" : "false"}">${day}</button>`);
    }
    datePickerGrid.innerHTML = cells.join("");
  }

  const { close: closeDatePicker } = createDisclosure(datePickerBtn, datePickerPopover, "#date-picker-wrap", {
    onOpen: () => {
      const { year, month } = parseDateFieldValue();
      calendarViewYear = year;
      calendarViewMonth = month;
      renderDatePicker();
    },
  });
  datePickerPrevMonth.addEventListener("click", () => {
    calendarViewMonth--;
    if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear--; }
    renderDatePicker();
  });
  datePickerNextMonth.addEventListener("click", () => {
    calendarViewMonth++;
    if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear++; }
    renderDatePicker();
  });
  datePickerGrid.addEventListener("click", e => {
    const cell = e.target.closest("button[data-date]");
    if (!cell) return;
    dateInput.value = cell.dataset.date;
    closeDatePicker();
    datePickerBtn.focus();
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

    // #703 -- editing shows the entry's own actual gradeScale, not the
    // current entry-form preference (spec's own acceptance criterion);
    // only a NEW entry seeds from the persisted per-discipline
    // preference. entry.gradeScale can be absent on an older/imported
    // entry -- defaults the same way the server does (defaultGradeScale,
    // server/api/logbook.js).
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
    // Pre-fills the existing value in edit mode; defaults to Lead for a new
    // Sport entry, same "always a real selection, never blank" reasoning
    // setStatusToggle's own default ("send") already follows above -- the
    // control is required (entrySchema's own rule), so it's never left
    // genuinely unselected.
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
