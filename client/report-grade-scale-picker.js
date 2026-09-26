// The trigger and popover are built once: rebuilding them would detach the disclosure's listeners.
import { createListPicker, renderOptionList } from "./modal-utils.js";
import { STANDARD_SCALES_BY_DISCIPLINE, resolveScaleId, DEFAULT_SCALE_BY_TYPE } from "../shared/grade-data.js";
import { resolveApexUrl } from "./resolve-cross-hostname-url.js";

function prefKey(type) {
  return `logbook_grade_scale_reports_${type}`;
}
// Guarded: the Workers test pool has no localStorage.
function loadPref(type) {
  let stored = null;
  try { stored = localStorage.getItem(prefKey(type)); } catch { /* ignore */ }
  // Standard scales only: an old or tampered preference falls back to the default.
  return resolveScaleId(type, stored, DEFAULT_SCALE_BY_TYPE[type], STANDARD_SCALES_BY_DISCIPLINE[type]);
}
function savePref(type, scaleId) {
  try { localStorage.setItem(prefKey(type), scaleId); } catch { /* ignore */ }
}

const TRIGGER_CLASSES = "group inline-flex items-center gap-[.35rem] h-[var(--field-h)] px-[.8rem] bg-surface border border-border rounded-app text-foreground text-[.85rem] font-semibold cursor-pointer hover:border-accent [&_svg]:stroke-current [&_svg]:fill-none [&_.chevron-icon]:transition-transform [&_.chevron-icon]:duration-150 aria-expanded:[&_.chevron-icon]:rotate-180";
const CHEVRON_SVG = `<svg class="chevron-icon w-3 h-3" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>`;

// A getter: the discipline can change after construction.
export function createReportGradeScalePicker({ containerEl, getType, onChange }) {
  containerEl.innerHTML = `
    <div class="relative inline-block" id="report-grade-scale-wrap">
      <button type="button" class="${TRIGGER_CLASSES}" id="report-grade-scale-btn" aria-haspopup="listbox" aria-expanded="false">
        <span id="report-grade-scale-btn-label"></span>
        ${CHEVRON_SVG}
      </button>
      <div class="absolute top-[calc(100%+.4rem)] right-0 z-20 bg-background border border-border rounded-app p-[.35rem] min-w-full w-max max-w-[calc(100vw-2rem)] shadow-[0_8px_24px_color-mix(in_srgb,black_35%,transparent)]" id="report-grade-scale-popover" role="listbox" aria-label="Grade scale" hidden>
        <ul class="max-h-[13rem] overflow-y-auto listbox-scrollbar m-0 p-0 list-none" id="report-grade-scale-listbox"></ul>
        <a class="block text-[.72rem] text-accent text-center pt-[.4rem] mt-[.2rem] border-t border-border hover:brightness-90" id="report-grade-scale-reference-link" data-apex-link href="#">What's this?</a>
      </div>
    </div>`;

  containerEl.querySelector("#report-grade-scale-reference-link").href = resolveApexUrl(location.hostname, "/help/grade-scales/");

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
  // State across calls, so refresh() can see a discipline change; kept in step by setOnSelect().
  let lastKnownScaleId = currentScaleId();
  function scaleName(scaleId) {
    return STANDARD_SCALES_BY_DISCIPLINE[getType()].find(s => s.id === scaleId)?.name ?? scaleId;
  }
  function updateLabel() {
    btnLabel.textContent = scaleName(currentScaleId());
  }

  picker.setRender(() => {
    const type = getType();
    const currentId = currentScaleId();
    renderOptionList(containerEl.querySelector("#report-grade-scale-listbox"), STANDARD_SCALES_BY_DISCIPLINE[type], {
      getKey: s => s.id, getLabel: s => s.name, isSelected: s => s.id === currentId,
    });
  });
  picker.setOnSelect(scaleId => {
    const type = getType();
    scaleByType[type] = scaleId;
    savePref(type, scaleId);
    updateLabel();
    lastKnownScaleId = scaleId;
    onChange(scaleId);
  });

  updateLabel();

  return {
    getScaleId: currentScaleId,
    // The pyramid needs both disciplines' scales for its one request.
    getScaleIdFor: t => scaleByType[t],
    refresh() {
      updateLabel();
      const after = currentScaleId();
      if (lastKnownScaleId !== after) onChange(after);
      lastKnownScaleId = after;
    },
  };
}
