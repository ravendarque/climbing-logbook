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
import { SCALES_BY_DISCIPLINE } from "../shared/grade-data.js";

// A Non-standard scale is never the default here either -- same reasoning
// as #703's own DEFAULT_SCALE_BY_TYPE (Raven, 2026-09-11): it exists for
// when a guidebook's notation doesn't match the real published scale, not
// as the ordinary starting point for viewing already-logged data.
const DEFAULT_SCALE_BY_TYPE = { boulder: "font", sport: "french" };

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
  const validIds = SCALES_BY_DISCIPLINE[type].map(s => s.id);
  return validIds.includes(stored) ? stored : DEFAULT_SCALE_BY_TYPE[type];
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
      </div>
    </div>`;

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
    onChange(scaleId);
  });

  updateLabel();

  return {
    getScaleId: currentScaleId,
    // Called by the composition root's own render() when the active
    // discipline may have changed (the header's discipline picker,
    // exactly the same "type can change under us" case #703's own
    // gradeScaleByType handles) -- refreshes the trigger label to the
    // new discipline's own preference and fires onChange if that's a
    // different scale than whatever was showing before.
    refresh() {
      const before = currentScaleId();
      updateLabel();
      const after = currentScaleId();
      if (before !== after) onChange(after);
    },
  };
}
