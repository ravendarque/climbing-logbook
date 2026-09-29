import { STATUS_ICONS } from "../status-icons.js";
import {
  COPIES,
  centreCopyIndex,
  easeOutCubic,
  itemLook,
  nearestCopyIndex,
  recentre,
  statusAt,
} from "../status-carousel.js";

const SETTLE_MS = 260;
const VISIBLE = 3;
const TAP_SLOP_PX = 6;
const FLICK_MS = 120;

const ARROW = direction =>
  `<svg viewBox="0 0 10 12" aria-hidden="true"><path d="${direction < 0 ? "M8 1 2 6l6 5z" : "M2 1l6 5-6 5z"}" fill="currentColor"/></svg>`;

class ClimbingStatusPicker extends HTMLElement {
  #radios = [];
  #viewport;
  #track;
  #items = [];
  #position = 0;
  #target = null;
  #frame = 0;
  #drag = null;
  #slot = 0;

  connectedCallback() {
    if (this.#track) return;
    this.#radios = [...this.querySelectorAll('input[type="radio"]')];
    const count = this.#radios.length;

    const visual = document.createElement("div");
    visual.className = "status-picker";
    visual.setAttribute("aria-hidden", "true");
    visual.innerHTML = `
      <button type="button" class="status-picker-arrow" tabindex="-1" data-step="-1">${ARROW(-1)}</button>
      <div class="status-picker-viewport">
        <div class="status-picker-track">${Array.from({ length: count * COPIES }, (_, k) => {
          const radio = this.#radios[k % count];
          return `<div class="status-picker-item" data-index="${k}" data-status="${radio.value}">${STATUS_ICONS[radio.value]}<span class="status-picker-caption"></span></div>`;
        }).join("")}</div>
        <div class="status-picker-frame"><span></span><span></span><span></span><span></span></div>
      </div>
      <button type="button" class="status-picker-arrow" tabindex="-1" data-step="1">${ARROW(1)}</button>`;
    this.append(visual);

    this.#viewport = visual.querySelector(".status-picker-viewport");
    this.#track = visual.querySelector(".status-picker-track");
    this.#items = [...visual.querySelectorAll(".status-picker-item")];
    this.#syncCaptions();
    this.#position = centreCopyIndex(
      Math.max(
        0,
        this.#radios.findIndex(r => r.checked),
      ),
      count,
    );

    new MutationObserver(() => this.#syncCaptions()).observe(this.querySelector("fieldset") ?? this, {
      subtree: true,
      characterData: true,
      childList: true,
    });
    new ResizeObserver(() => this.#render()).observe(this.#viewport);

    for (const arrow of visual.querySelectorAll(".status-picker-arrow")) {
      arrow.addEventListener("click", () =>
        this.#goTo((this.#target ?? Math.round(this.#position)) + Number(arrow.dataset.step)),
      );
    }
    this.addEventListener("change", e => {
      if (!this.#radios.includes(e.target) || e.isTrusted === false) return;
      this.#goTo(nearestCopyIndex(this.#position, this.#radios.indexOf(e.target), count), { commit: false });
    });
    this.#viewport.addEventListener("pointerdown", e => this.#startDrag(e));
    this.#viewport.addEventListener("pointermove", e => this.#moveDrag(e));
    this.#viewport.addEventListener("pointerup", e => this.#endDrag(e));
    this.#viewport.addEventListener("pointercancel", () => {
      if (!this.#drag) return;
      this.#drag = null;
      this.#goTo(Math.round(this.#position));
    });
    this.#render();
  }

  get value() {
    return this.#radios.find(r => r.checked)?.value;
  }

  set value(value) {
    const index = this.#radios.findIndex(r => r.value === value);
    if (index < 0) return;
    this.#radios[index].checked = true;
    cancelAnimationFrame(this.#frame);
    this.#target = null;
    this.#position = centreCopyIndex(index, this.#radios.length);
    this.#render();
  }

  #syncCaptions() {
    const count = this.#radios.length;
    this.#items.forEach((item, k) => {
      item.querySelector(".status-picker-caption").textContent =
        this.#radios[k % count].labels[0]?.textContent.trim() ?? "";
    });
  }

  #render() {
    if (!this.#viewport) return;
    this.#slot = this.#viewport.clientWidth / VISIBLE;
    this.style.setProperty("--status-slot", `${this.#slot}px`);
    this.#track.style.transform = `translateX(${this.#slot * ((VISIBLE - 1) / 2 - this.#position)}px)`;
    this.#items.forEach((item, k) => {
      const { scale, opacity, muted } = itemLook(k - this.#position);
      item.style.transform = `scale(${scale})`;
      item.style.setProperty("--status-icon-opacity", String(opacity));
      item.style.setProperty("--status-muted", `${muted * 100}%`);
    });
  }

  #goTo(target, { commit = true } = {}) {
    const count = this.#radios.length;
    if (commit) {
      const radio = this.#radios[statusAt(target, count)];
      if (!radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    cancelAnimationFrame(this.#frame);
    const shift = recentre(target, count) - target;
    const from = this.#position + shift;
    target += shift;
    this.#target = target;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    const step = now => {
      const t = reduced ? 1 : Math.min(1, (now - started) / SETTLE_MS);
      this.#position = from + (target - from) * easeOutCubic(t);
      if (t < 1) {
        this.#render();
        this.#frame = requestAnimationFrame(step);
      } else {
        this.#position = recentre(target, count);
        this.#target = null;
        this.#render();
      }
    };
    this.#frame = requestAnimationFrame(step);
  }

  #startDrag(e) {
    cancelAnimationFrame(this.#frame);
    this.#target = null;
    this.#viewport.setPointerCapture(e.pointerId);
    this.#drag = { x: e.clientX, from: this.#position, moved: false, samples: [{ x: e.clientX, t: e.timeStamp }] };
  }

  #moveDrag(e) {
    const drag = this.#drag;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > TAP_SLOP_PX) drag.moved = true;
    if (!drag.moved) return;
    const next = drag.from - dx / this.#slot;
    const wrapped = recentre(next, this.#radios.length);
    drag.from += wrapped - next;
    this.#position = wrapped;
    drag.samples = [...drag.samples, { x: e.clientX, t: e.timeStamp }].filter(s => e.timeStamp - s.t <= FLICK_MS);
    this.#render();
  }

  #endDrag(e) {
    const drag = this.#drag;
    this.#drag = null;
    if (!drag) return;
    if (!drag.moved) {
      const item = document.elementFromPoint(e.clientX, e.clientY)?.closest(".status-picker-item");
      if (item) this.#goTo(Number(item.dataset.index));
      else this.#goTo(Math.round(this.#position));
      return;
    }
    const first = drag.samples[0];
    const elapsed = e.timeStamp - first.t;
    const velocity = elapsed > 0 ? (e.clientX - first.x) / elapsed : 0;
    const projected = this.#position - (velocity * FLICK_MS) / this.#slot;
    const target = Math.round(Math.max(this.#position - 2, Math.min(this.#position + 2, projected)));
    this.#goTo(target);
  }
}

customElements.define("climbing-status-picker", ClimbingStatusPicker);
