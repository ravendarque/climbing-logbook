// Round-tripping through a text node (via div.innerHTML) escapes &, <, >
// but not quotes -- text-node serialization only escapes quotes in
// attribute-value context, not text content. Since this is used to build
// both text content AND quoted HTML attributes (data-*, href), quotes are
// encoded explicitly so it's safe in either context.
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML.replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
