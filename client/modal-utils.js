import { escapeHtml } from "./escape-html.js";

// Inside a modal, pass escapeTarget: a document-level Escape would also close the modal.
// destroy() is for callers that rebuild their markup, or document listeners pile up.
export function createDisclosure(trigger, panel, containerSelector, { escapeTarget = document, onOpen } = {}) {
  function open() {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (onOpen) onOpen();
  }
  function close() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }
  const onTriggerClick = () => { if (panel.hidden) open(); else close(); };
  const onDocumentClick = e => {
    if (!panel.hidden && !e.target.closest(containerSelector)) close();
  };
  const onEscapeKeydown = e => {
    if (e.key !== "Escape" || panel.hidden) return;
    if (escapeTarget !== document) { e.preventDefault(); e.stopPropagation(); }
    close();
    trigger.focus();
  };
  trigger.addEventListener("click", onTriggerClick);
  document.addEventListener("click", onDocumentClick);
  escapeTarget.addEventListener("keydown", onEscapeKeydown);
  function destroy() {
    trigger.removeEventListener("click", onTriggerClick);
    document.removeEventListener("click", onDocumentClick);
    escapeTarget.removeEventListener("keydown", onEscapeKeydown);
  }
  return { open, close, destroy };
}

// onSelect gets the item's key, not the item: callers only need the key.
export function createSearchableListbox({
  trigger, popover, containerSelector, searchInput, listboxEl, idPrefix,
  filterItems,       // (query: string) => item[] -- caller owns the data source and match predicate
  getItemKey,        // (item) => string
  isSelected,        // (item) => boolean
  renderItemContent, // (item) => inner html string (pre-escaped by the caller, same policy as every other template string in this codebase)
  onSelect,          // (key: string) => void
}) {
  let filtered = [];
  let activeIndex = -1;

  function optionId(i) { return `${idPrefix}-${i}`; }

  function updateActiveDescendant() {
    searchInput.setAttribute("aria-activedescendant", activeIndex >= 0 ? optionId(activeIndex) : "");
    listboxEl.querySelectorAll("[role=option]").forEach((el, i) =>
      el.classList.toggle("bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]", i === activeIndex));
    listboxEl.querySelector(`#${optionId(activeIndex)}`)?.scrollIntoView({ block: "nearest" });
  }

  function render(filterText) {
    filtered = filterItems(filterText.trim().toLowerCase());
    activeIndex = filtered.length ? 0 : -1;
    listboxEl.innerHTML = filtered.length
      ? filtered.map((item, i) => `
          <li id="${optionId(i)}" role="option" data-key="${escapeHtml(getItemKey(item))}" aria-selected="${isSelected(item)}" class="flex items-center justify-between gap-[.5rem] px-[.6rem] py-[.5rem] rounded-[calc(var(--radius-app)-2px)] cursor-pointer text-[.9rem] text-foreground hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible">
            ${renderItemContent(item)}
            <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
          </li>`).join("")
      : `<li class="px-[.6rem] py-[.5rem] text-[.85rem] text-muted">No matches</li>`;
    updateActiveDescendant();
  }

  const { close } = createDisclosure(trigger, popover, containerSelector, {
    escapeTarget: searchInput,
    onOpen() {
      searchInput.value = "";
      render("");
      searchInput.focus();
    },
  });

  searchInput.addEventListener("input", () => render(searchInput.value));
  searchInput.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length) { activeIndex = (activeIndex + 1) % filtered.length; updateActiveDescendant(); }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length) { activeIndex = (activeIndex - 1 + filtered.length) % filtered.length; updateActiveDescendant(); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0) {
        onSelect(getItemKey(filtered[activeIndex]));
        close();
        trigger.focus();
      }
    }
  });
  listboxEl.addEventListener("click", e => {
    const opt = e.target.closest("[role=option][data-key]");
    if (!opt) return;
    onSelect(opt.dataset.key);
    close();
    trigger.focus();
  });

  return { close };
}

// render and onSelect are set later: callers close over state that isn't ready yet.
export function createListPicker({ trigger, popover, listbox, containerSelector }) {
  let render = () => {};
  let onSelect = () => {};
  const { close } = createDisclosure(trigger, popover, containerSelector, {
    onOpen: () => render(),
  });
  listbox.addEventListener("click", e => {
    const opt = e.target.closest("[role=option][data-key]");
    if (!opt) return;
    onSelect(opt.dataset.key);
    close();
    trigger.focus();
  });
  return {
    trigger, close,
    setRender(fn) { render = fn; },
    setOnSelect(fn) { onSelect = fn; },
  };
}

export function renderOptionList(listboxEl, items, { getKey, getLabel, isSelected }) {
  listboxEl.innerHTML = items.map(item => `
    <li role="option" data-key="${escapeHtml(getKey(item))}" aria-selected="${isSelected(item)}" class="flex items-center justify-between gap-[.5rem] px-[.6rem] py-[.5rem] rounded-[calc(var(--radius-app)-2px)] cursor-pointer text-[.85rem] text-foreground hover:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] [&_svg]:w-4 [&_svg]:h-4 [&_svg]:stroke-accent [&_svg]:fill-none [&_svg]:invisible aria-selected:[&_svg]:visible">
      ${escapeHtml(getLabel(item))}
      <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
    </li>`).join("");
}

export function focusableEls(overlay) {
  return [...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.offsetParent !== null);
}

// Stacking order, not DOM order: add-place sits above the entry form, so Escape closes it first.
const DEFAULT_OVERLAY_IDS = ["add-place-overlay", "entry-overlay", "notes-overlay", "footnote-overlay"];

export function createModalHelpers(overlayIds = DEFAULT_OVERLAY_IDS) {
  let lastFocusedEl = null;

  function openModal(overlay) {
    lastFocusedEl = document.activeElement;
    overlay.hidden = false;
    overlay.scrollTop = 0;
    (focusableEls(overlay)[0] ?? overlay).focus();
  }
  function closeModal(overlay) {
    overlay.hidden = true;
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  document.addEventListener("keydown", e => {
    // filter(Boolean): each page passes only the overlays it has.
    const overlays = overlayIds.map(id => document.getElementById(id)).filter(Boolean);
    const openOverlay = overlays.find(o => !o.hidden);
    if (!openOverlay) return;

    if (e.key === "Escape") {
      closeModal(openOverlay);
      return;
    }

    if (e.key === "Tab") {
      const focusable = focusableEls(openOverlay);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  return { openModal, closeModal };
}
