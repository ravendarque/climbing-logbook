// Extracted from client/main.js (#206).

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatDate(d) {
  if (!d) return "—";
  const p = d.split("-");
  if (p.length === 1) return p[0];
  if (p.length === 2) return `${MONTHS[+p[1]-1]} ${p[0]}`;
  return `${+p[2]} ${MONTHS[+p[1]-1]} ${p[0]}`;
}

export function dateRank(d) {
  if (!d) return -1;
  return new Date(d).getTime();
}
