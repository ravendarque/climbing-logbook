export function renderBlockedPage(doc, { id, heading, text, link }) {
  const main = doc.querySelector("main") ?? doc.body;
  for (const el of main.children) el.hidden = true;
  const wrapper = doc.createElement("div");
  wrapper.className = "max-w-[960px] mx-auto";
  const section = doc.createElement("section");
  section.id = id;
  section.className = "max-w-[480px] mt-8 flex flex-col gap-3";
  const h = doc.createElement("h1");
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
  wrapper.append(section);
  main.append(wrapper);
}
