// Keeps the header, so the visitor can still log in or out.
export function renderBlockedPage(doc, { id, heading, text, link }) {
  const header = doc.querySelector("climbing-page-header");
  const container = header?.parentElement ?? doc.body;
  for (const el of container.children) {
    if (el !== header) el.hidden = true;
  }
  const section = doc.createElement("section");
  section.id = id;
  section.className = "max-w-[480px] mt-8 flex flex-col gap-3";
  const h = doc.createElement("h2");
  h.className = "card-section-heading";
  h.textContent = heading;
  const p = doc.createElement("p");
  p.className = "text-muted";
  p.textContent = text;
  section.append(h, p);
  if (link) {
    const a = doc.createElement("a");
    a.className = "btn btn-primary self-start";
    a.href = link.href;
    a.textContent = link.label;
    section.append(a);
  }
  container.append(section);
}
