import { SUBMISSION_SECTIONS } from "../../shared/submission-sections.js";
import { SAVE_ERROR, addField, api, cardClass, el, formatDate, onPlainClick, refreshCounts } from "./shared.js";

const KINDS = {
  reports: { title: "Reports", noun: "report" },
  feedback: { title: "Feedback", noun: "feedback" },
};

function sectionLabel(section) {
  return SUBMISSION_SECTIONS[section] ?? "Not set";
}

export function startSubmissions(kind) {
  const listPane = document.getElementById("list-pane");
  const listStatus = document.getElementById("list-status");
  const list = document.getElementById("submission-list");
  const detailPane = document.getElementById("detail-pane");
  const detailMessage = document.getElementById("detail-message");
  const detailFields = document.getElementById("detail-fields");
  const detailError = document.getElementById("detail-error");
  const toggleRead = document.getElementById("toggle-read");
  const toggleArchived = document.getElementById("toggle-archived");
  const deleteDialog = document.getElementById("delete-dialog");

  let archived = new URLSearchParams(location.search).get("archived") === "1";
  let selectedId = new URLSearchParams(location.search).get("id");
  let submissions = [];

  function urlFor({ id = selectedId, showArchived = archived } = {}) {
    const params = new URLSearchParams();
    if (showArchived) params.set("archived", "1");
    if (id) params.set("id", id);
    const query = params.toString();
    return `/${kind}${query ? `?${query}` : ""}`;
  }

  function renderList() {
    list.replaceChildren(
      ...submissions.map(submission => {
        const unread = !submission.readAt;
        const item = el("li");
        const link = el("a", cardClass(submission.id === selectedId));
        link.href = urlFor({ id: submission.id });
        if (submission.id === selectedId) link.setAttribute("aria-current", "true");
        link.dataset.id = submission.id;

        const meta = el("span", "flex items-center gap-2 text-xs text-muted");
        const dot = el("span", `w-2 h-2 rounded-full shrink-0 ${unread ? "bg-accent" : ""}`);
        meta.append(dot, el("span", "", sectionLabel(submission.section)));
        if (unread) meta.append(el("span", "sr-only", "Unread"));
        meta.append(el("span", "ml-auto", formatDate(submission.createdAt)));

        const preview = el(
          "span",
          `text-sm leading-snug line-clamp-2 break-words ${unread ? "font-bold" : "text-foreground/85"}`,
          submission.message,
        );
        link.append(meta, preview);
        item.append(link);
        return item;
      }),
    );
    listStatus.textContent = submissions.length
      ? ""
      : archived
        ? `No archived ${KINDS[kind].noun}.`
        : `No ${KINDS[kind].noun} waiting.`;
  }

  function renderDetail() {
    const submission = submissions.find(s => s.id === selectedId);
    detailPane.hidden = !submission;
    listPane.classList.toggle("max-[899px]:hidden", !!submission);
    detailError.hidden = true;
    if (!submission) return;

    document.getElementById("detail-back").href = urlFor({ id: null });
    document.getElementById("detail-back-label").textContent = KINDS[kind].title;
    document.getElementById("detail-heading").textContent =
      `${KINDS[kind].title} from ${formatDate(submission.createdAt, { withYear: true })}`;
    detailMessage.textContent = submission.message;
    detailFields.replaceChildren();
    addField(detailFields, "Section", sectionLabel(submission.section));
    addField(detailFields, "Page", submission.sourcePage ?? "Not recorded");
    addField(detailFields, "From", submission.username ?? "Not signed in");
    if (submission.contactEmail) {
      const mail = el("a", "underline underline-offset-2", submission.contactEmail);
      mail.href = `mailto:${submission.contactEmail}`;
      addField(detailFields, "Contact", mail);
    } else {
      addField(detailFields, "Contact", "None given");
    }
    addField(detailFields, "Sent", formatDate(submission.createdAt, { withYear: true }));

    toggleRead.textContent = submission.readAt ? "Mark as unread" : "Mark as read";
    toggleArchived.textContent = submission.archivedAt ? "Unarchive" : "Archive";
    document.getElementById("delete-title").textContent = `Delete this ${KINDS[kind].noun}?`;
  }

  function render() {
    document.getElementById("show-active").setAttribute("aria-pressed", String(!archived));
    document.getElementById("show-archived").setAttribute("aria-pressed", String(archived));
    renderList();
    renderDetail();
  }

  async function patch(id, change) {
    const updated = await api(`${kind}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    submissions = submissions.map(s => (s.id === id ? updated : s));
    return updated;
  }

  function navigate(url) {
    history.pushState(null, "", url);
    readUrl();
  }

  function readUrl() {
    const params = new URLSearchParams(location.search);
    const wasArchived = archived;
    archived = params.get("archived") === "1";
    selectedId = params.get("id");
    if (wasArchived !== archived) return load();
    render();
    return openSelected();
  }

  // Opening one is reading it.
  async function openSelected() {
    const submission = submissions.find(s => s.id === selectedId);
    if (!submission || submission.readAt) return;
    try {
      await patch(submission.id, { read: true });
      render();
      refreshCounts();
    } catch {}
  }

  function leave(id) {
    submissions = submissions.filter(s => s.id !== id);
    navigate(urlFor({ id: null }));
    refreshCounts();
  }

  async function act(change, then) {
    const id = selectedId;
    detailError.hidden = true;
    try {
      const updated = await patch(id, change);
      then(updated);
    } catch {
      detailError.textContent = SAVE_ERROR;
      detailError.hidden = false;
    }
  }

  async function load() {
    listStatus.textContent = "Loading…";
    list.replaceChildren();
    detailPane.hidden = true;
    try {
      ({ submissions } = await api(`${kind}${archived ? "?archived=1" : ""}`));
    } catch {
      submissions = [];
      listStatus.textContent = "Couldn't load these. Check your connection and reload.";
      return;
    }
    render();
    openSelected();
  }

  onPlainClick(list, "a[data-id]", link => navigate(urlFor({ id: link.dataset.id })));

  onPlainClick(detailPane, "#detail-back", () => navigate(urlFor({ id: null })));

  document
    .getElementById("show-active")
    .addEventListener("click", () => navigate(urlFor({ id: null, showArchived: false })));
  document
    .getElementById("show-archived")
    .addEventListener("click", () => navigate(urlFor({ id: null, showArchived: true })));

  toggleRead.addEventListener("click", () =>
    act({ read: !submissions.find(s => s.id === selectedId).readAt }, updated => {
      if (updated.readAt) render();
      else navigate(urlFor({ id: null }));
      refreshCounts();
    }),
  );

  toggleArchived.addEventListener("click", () => act({ archived: !archived }, updated => leave(updated.id)));

  // Escape leaves returnValue as it was, so a previous "delete" would otherwise go through again.
  document.getElementById("delete-btn").addEventListener("click", () => {
    deleteDialog.returnValue = "";
    deleteDialog.showModal();
  });

  deleteDialog.addEventListener("close", async () => {
    if (deleteDialog.returnValue !== "delete") return;
    const id = selectedId;
    try {
      await api(`${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
      leave(id);
    } catch {
      detailError.textContent = "Couldn't delete that. Check your connection and try again.";
      detailError.hidden = false;
    }
  });

  window.addEventListener("popstate", readUrl);
  load();
}
