export function renderAgreementPoints(listEl, points) {
  listEl.replaceChildren(
    ...points.map(point => {
      const li = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = `${point.label}:`;
      li.append(label, ` ${point.text}`);
      return li;
    }),
  );
}
