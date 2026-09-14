// Shared grade-scale picker for the performance-report pages (#704, sub-
// issue C of #183) -- one preference (gradeScale.reports.<discipline>)
// across every report, distinct from the entry-form's own picker (#703).
// Same "plain JS module, renders into a container, onChange callback"
// granularity as client/time-window.js (the design spec's own "same
// implementation granularity" call for this exact control), reusing
// client/modal-utils.js's createListPicker/renderOptionList for the
// actual button+popover mechanics rather than a third hand-rolled copy.
//
// Unlike time-window.js's own render() (which rebuilds its pills' DOM
// from scratch on every call, safe since they're plain rebound buttons),
// this module builds its trigger+popover DOM ONCE at construction --
// createListPicker's createDisclosure binds its open/close/outside-click
// listeners to those specific DOM nodes, so replacing them on every
// render would silently detach the picker. Only the listbox's own
// *contents* and the trigger's label are ever regenerated (on open, and
// on refresh()).
import { createListPicker, renderOptionList } from "./modal-utils.js";
import { SCALES_BY_DISCIPLINE, resolveScaleId, DEFAULT_SCALE_BY_TYPE } from "../shared/grade-data.js";

function prefKey(type) {
  return `logbook_grade_scale_reports_${type}`;
}
// Guards every localStorage call -- same reasoning as #703's own
// loadGradeScalePref (client/entry-form.js): no test file of this
// module's own exercises it today, but the Workers pool other client/
// *.js tests run under has no localStorage global at all.
function loadPref(type) {
  let stored = null;
  try { stored = localStorage.getItem(prefKey(type)); } catch { /* ignore */ }
  return resolveScaleId(type, stored, DEFAULT_SCALE_BY_TYPE[type]);
}
function savePref(type, scaleId) {
  try { localStorage.setItem(prefKey(type), scaleId); } catch { /* ignore */ }
}

const TRIGGER_CLASSES = "group inline-flex items-center gap-[.35rem] h-[var(--field-h)] px-[.8rem] bg-surface border border-border rounded-app text-foreground text-[.85rem] font-semibold cursor-pointer hover:border-accent [&_svg]:stroke-current [&_svg]:fill-none [&_.chevron-icon]:transition-transform [&_.chevron-icon]:duration-150 aria-expanded:[&_.chevron-icon]:rotate-180";
const CHEVRON_SVG = `<svg class="chevron-icon w-3 h-3" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>`;

// `getType`: a function, not a plain value -- the active discipline can
// change (the header's own discipline picker) after this control is
// created, and the picker needs the CURRENT type on every open/select,
// not whatever it was at construction time.
export function createReportGradeScalePicker({ containerEl, getType, onChange }) {
  containerEl.innerHTML = `
    <div class="relative inline-block" id="report-grade-scale-wrap">
      <button type="button" class="${TRIGGER_CLASSES}" id="report-grade-scale-btn" aria-haspopup="listbox" aria-expanded="false">
        <span id="report-grade-scale-btn-label"></span>
        ${CHEVRON_SVG}
      </button>
      <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 bg-background border border-border rounded-app p-[.35rem] min-w-full w-max max-w-[calc(100vw-2rem)] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="report-grade-scale-popover" role="listbox" aria-label="Grade scale" hidden>
        <ul class="max-h-[13rem] overflow-y-auto m-0 p-0 list-none" id="report-grade-scale-listbox"></ul>
        <!-- #705 -- same "What's this?" link as #703's own entry-form
             picker (public/log/index.html), pointing at the reference
             page. location.pathname's own leading segment is USERNAME on
             every page this picker is used from (the three performance-
             report composition roots), same extraction every one of them
             already does for itself -- no need to thread it through this
             factory's own params. -->
        <a class="block text-[.72rem] text-accent text-center pt-[.4rem] mt-[.2rem] border-t border-border hover:brightness-90" id="report-grade-scale-reference-link" href="#">What's this?</a>
      </div>
    </div>`;

  const username = location.pathname.split("/").filter(Boolean)[0] || "";
  containerEl.querySelector("#report-grade-scale-reference-link").href = `/${encodeURIComponent(username)}/performance/grades`;

  const btnLabel = containerEl.querySelector("#report-grade-scale-btn-label");
  const picker = createListPicker({
    trigger: containerEl.querySelector("#report-grade-scale-btn"),
    popover: containerEl.querySelector("#report-grade-scale-popover"),
    listbox: containerEl.querySelector("#report-grade-scale-listbox"),
    containerSelector: "#report-grade-scale-wrap",
  });

  let scaleByType = { boulder: loadPref("boulder"), sport: loadPref("sport") };

  function currentScaleId() {
    return scaleByType[getType()];
  }
  // #754 -- what refresh() (below) last saw, tracked across calls --
  // see that method's own comment for why this can't just be two
  // currentScaleId() reads inside one refresh() call (found in review:
  // it used to be exactly that, comparing the same live value against
  // itself with nothing mutating scaleByType in between, so the
  // comparison was always false and onChange never fired from refresh()
  // at all, in any real caller, ever). Also kept in sync by
  // setOnSelect() below, a different code path that changes
  // scaleByType directly.
  let lastKnownScaleId = currentScaleId();
  function scaleName(scaleId) {
    return SCALES_BY_DISCIPLINE[getType()].find(s => s.id === scaleId)?.name ?? scaleId;
  }
  function updateLabel() {
    btnLabel.textContent = scaleName(currentScaleId());
  }

  picker.setRender(() => {
    const type = getType();
    const currentId = currentScaleId();
    renderOptionList(containerEl.querySelector("#report-grade-scale-listbox"), SCALES_BY_DISCIPLINE[type], {
      getKey: s => s.id, getLabel: s => s.name, isSelected: s => s.id === currentId,
    });
  });
  picker.setOnSelect(scaleId => {
    const type = getType();
    scaleByType[type] = scaleId;
    savePref(type, scaleId);
    updateLabel();
    // #754 -- keeps refresh()'s own "what did I last see" tracking in
    // sync with a direct user selection (a different code path from
    // refresh()'s own discipline-switch detection) -- without this, the
    // NEXT refresh() call would still be comparing against the value
    // from before this selection, firing a spurious duplicate onChange
    // even though nothing has changed since this real one.
    lastKnownScaleId = scaleId;
    onChange(scaleId);
  });

  updateLabel();

  return {
    getScaleId: currentScaleId,
    // #737 -- the pyramid page needs BOTH disciplines' current scale
    // preference at once (the server computes both in one response, so
    // it needs both as query params on every fetch), not just whichever
    // discipline is currently active -- every other caller of this
    // picker only ever needs getScaleId() for the active type.
    getScaleIdFor: t => scaleByType[t],
    // Called by the composition root's own render() when the active
    // discipline may have changed (the header's discipline picker,
    // exactly the same "type can change under us" case #703's own
    // gradeScaleByType handles) -- refreshes the trigger label to the
    // new discipline's own preference and fires onChange if that's a
    // different scale than whatever this method last saw. Compares
    // against `lastKnownScaleId` (state carried across calls), not two
    // reads within the same call -- currentScaleId() is a pure read of
    // already-settled state, so two reads with only a DOM-writing
    // updateLabel() in between can never differ.
    refresh() {
      updateLabel();
      const after = currentScaleId();
      if (lastKnownScaleId !== after) onChange(after);
      lastKnownScaleId = after;
    },
  };
}
