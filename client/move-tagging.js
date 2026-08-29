// Shared cascading-dropdown row-list widget (#575 Phase 2 entry-data
// plan) -- one implementation, two instances on the entry form: Move
// difficulty's Hardest/Easiest lists (hasDifficulty: true, one instance
// each) and Pain/injury's single list (hasDifficulty: false). Per the
// design doc's own "Pain / injury" section: "the cascading-dropdown UI
// component... is reused as-is, same code, DRY."
//
// The "Limb" dropdown combines limb+side into six options (see this
// plan's own Global Constraints ruling) -- the design doc's 4-visible-
// field grid (Limb, Hold type, Movement, Wall angle) only reconciles with
// the 5-column schema (limb+side both always required) this way.
import { escapeHtml } from "./escape-html.js";
import { HOLD_TYPES_BY_LIMB, MOVEMENT_STYLES_BY_LIMB, VALID_WALL_ANGLES } from "../shared/entry-schema.js";

const LIMB_SIDE_OPTIONS = [
  { value: "hand-left", limb: "hand", side: "left", label: "Left Hand" },
  { value: "hand-right", limb: "hand", side: "right", label: "Right Hand" },
  { value: "foot-left", limb: "foot", side: "left", label: "Left Foot" },
  { value: "foot-right", limb: "foot", side: "right", label: "Right Foot" },
  { value: "knee-left", limb: "knee", side: "left", label: "Left Knee" },
  { value: "knee-right", limb: "knee", side: "right", label: "Right Knee" },
];

function limbSideOption(value) {
  return LIMB_SIDE_OPTIONS.find(o => o.value === value) ?? LIMB_SIDE_OPTIONS[0];
}

function optionsHtml(values, selected) {
  return values.map(v => `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(v)}</option>`).join("");
}

function rowHtml(row) {
  const { limb, side, holdType, movementStyle, wallAngle } = row;
  const limbSideValue = `${limb}-${side}`;
  return `<div class="row-card mb-2" data-move-row>
    <button type="button" class="border-none bg-transparent cursor-pointer text-muted text-[.9rem] mb-2 hover:text-foreground" data-remove-row aria-label="Remove move">✕ Remove</button>
    <div class="grid gap-2" style="grid-template-columns: repeat(auto-fit, minmax(85px, 1fr));">
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Limb</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="limbSide">
          ${LIMB_SIDE_OPTIONS.map(o => `<option value="${o.value}"${o.value === limbSideValue ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>
      </label>
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Hold type</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="holdType">
          ${optionsHtml(HOLD_TYPES_BY_LIMB[limb], holdType)}
        </select>
      </label>
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Movement</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="movementStyle">
          ${optionsHtml(MOVEMENT_STYLES_BY_LIMB[limb], movementStyle)}
        </select>
      </label>
      <label class="block">
        <span class="text-[.65rem] text-muted block mb-1">Wall angle</span>
        <select class="w-full bg-surface border border-border rounded-app px-2 py-1 text-[.85rem]" data-field="wallAngle">
          ${optionsHtml(VALID_WALL_ANGLES, wallAngle)}
        </select>
      </label>
    </div>
  </div>`;
}

function defaultRow(hasDifficulty, defaultDifficulty) {
  const first = LIMB_SIDE_OPTIONS[0];
  const row = { limb: first.limb, side: first.side, holdType: HOLD_TYPES_BY_LIMB[first.limb][0], movementStyle: MOVEMENT_STYLES_BY_LIMB[first.limb][0], wallAngle: VALID_WALL_ANGLES[0] };
  if (hasDifficulty) row.difficulty = defaultDifficulty;
  return row;
}

export function createMoveRowList({ listEl, addBtnEl, hasDifficulty, defaultDifficulty }) {
  let rows = [];

  function render() {
    listEl.innerHTML = rows.map(rowHtml).join("");
  }

  function rowIndexOf(el) {
    return Array.from(listEl.children).indexOf(el.closest("[data-move-row]"));
  }

  listEl.addEventListener("click", e => {
    const removeBtn = e.target.closest("[data-remove-row]");
    if (!removeBtn) return;
    const index = rowIndexOf(removeBtn);
    rows.splice(index, 1);
    render();
  });

  listEl.addEventListener("change", e => {
    const select = e.target.closest("select[data-field]");
    if (!select) return;
    const index = rowIndexOf(select);
    const row = rows[index];
    const field = select.dataset.field;

    if (field === "limbSide") {
      const { limb, side } = limbSideOption(select.value);
      row.limb = limb;
      row.side = side;
      row.holdType = HOLD_TYPES_BY_LIMB[limb][0];
      row.movementStyle = MOVEMENT_STYLES_BY_LIMB[limb][0];
      render(); // re-render this row so its holdType/movementStyle <select>s reflect the new limb's filtered options
    } else {
      row[field] = select.value;
    }
  });

  addBtnEl.addEventListener("click", () => {
    rows.push(defaultRow(hasDifficulty, defaultDifficulty));
    render();
  });

  return {
    getRows: () => rows.map(r => ({ ...r })),
    setRows: newRows => { rows = newRows.map(r => ({ ...r })); render(); },
    reset: () => { rows = []; render(); },
  };
}
