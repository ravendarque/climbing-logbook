/**
 * Countries deliberately excluded from every generated country/map
 * dataset, regardless of what the source package (`world-countries`)
 * says -- currently excluded from world climbing events over
 * international law/human rights violations (Russia/Belarus: invasion
 * of Ukraine; Israel: occupation). Palestine is NOT excluded -- it's
 * already present in world-countries as a non-UN-member state, so no
 * override is needed to keep it in.
 *
 * Shared between generate-countries.mjs and generate-world-map.mjs
 * rather than duplicated -- the two scripts' output has to agree on
 * exactly which countries exist, or generate-world-map.mjs would emit a
 * pin for a country generate-countries.mjs never listed, with nothing on
 * the client to join it against.
 */
export const EXCLUDED_CCA2 = ["IL", "RU", "BY"];
