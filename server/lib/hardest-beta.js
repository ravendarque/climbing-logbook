import { parse, toMovements } from "@ravendarque/beta-interpreter";
import pkg from "../../package.json" with { type: "json" };

// The pinned package version, so a stored movement shows how far behind the current vocabulary it is.
export const VOCABULARY_VERSION = pkg.dependencies["@ravendarque/beta-interpreter"];

const ids = terms => terms.map(t => t.id);

function compactHold(hold) {
  if (!hold) return null;
  return {
    role: hold.role,
    ori: hold.ori?.id ?? null,
    kinds: ids(hold.kinds),
    qualifiers: hold.qualifiers,
    plural: hold.plural,
  };
}

function compactContact(contact) {
  return {
    side: contact.side,
    hold: compactHold(contact.hold),
    holdSource: contact.holdSource,
    techniques: ids(contact.techniques),
  };
}

function compactState(state) {
  return {
    limbs: Object.fromEntries(Object.entries(state.limbs).map(([limb, contact]) => [limb, compactContact(contact)])),
    body: ids(state.body),
    unplaced: state.unplaced.map(u => ({ part: u.part, ...compactContact(u) })),
  };
}

export function hardestBetaMovements(text) {
  if (!text?.trim()) return [];
  const record = toMovements(parse(text));
  const terrain = JSON.stringify({ terrain: ids(record.terrain), features: ids(record.features) });
  return record.movements.map((movement, position) => ({
    position,
    crux: movement.crux,
    terrain,
    transition: movement.transition
      ? { terms: ids(movement.transition.terms), limbs: movement.transition.limbs, side: movement.transition.side }
      : null,
    start: compactState(movement.start),
    end: compactState(movement.end),
  }));
}
