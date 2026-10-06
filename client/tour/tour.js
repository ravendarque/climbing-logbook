import { readSettingsCache } from "../settings-cache.js";
import { tourSteps } from "./steps.js";
import { isOnPage, readTourRequest, tourUrl } from "./tour-url.js";

const TARGET_TIMEOUT_MS = 8000;
const SPOT_PAD_PX = 6;

function currentSteps() {
  return tourSteps({ discipline: readSettingsCache()?.activeDiscipline });
}

function isTall(rect) {
  return !!rect && rect.height > window.innerHeight * 0.6;
}

function unionRect(elements) {
  const rects = elements.map(element => element.getBoundingClientRect()).filter(rect => rect.width || rect.height);
  if (!rects.length) return null;
  const left = Math.min(...rects.map(r => r.left));
  const top = Math.min(...rects.map(r => r.top));
  const right = Math.max(...rects.map(r => r.right));
  const bottom = Math.max(...rects.map(r => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

const STATES = {
  "add-form": {
    async enter(doc) {
      doc.getElementById("add-btn").click();
      await waitFor(() => !doc.getElementById("entry-overlay").hidden);
    },
    exit(doc) {
      doc.getElementById("entry-close").click();
    },
  },
};

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function waitFor(find, timeoutMs = TARGET_TIMEOUT_MS, doc = document) {
  const found = find();
  if (found) return Promise.resolve(found);
  return new Promise(resolve => {
    const finish = value => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      const next = find();
      if (next) finish(next);
    });
    observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildLayer(doc) {
  const layer = el(doc, "div", "fixed inset-0 z-[1000]");
  const shield = el(doc, "div", "absolute inset-0");
  const spot = el(doc, "div", "fixed rounded-[10px] pointer-events-none");
  spot.id = "tour-spot";
  spot.style.cssText =
    "box-shadow:0 0 0 100vmax rgba(0,0,0,.68);outline:2px solid var(--color-accent);outline-offset:2px";

  const card = el(
    doc,
    "div",
    "fixed inset-x-3 max-w-[26rem] mx-auto bg-surface text-foreground border border-border rounded-[12px] p-4 flex flex-col gap-3 shadow-[0_10px_30px_rgba(0,0,0,.4)]",
  );
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "tour-title");
  card.setAttribute("aria-describedby", "tour-body");

  const header = el(doc, "div", "flex items-center justify-between gap-3");
  const count = el(doc, "span", "text-xs text-muted tabular-nums");
  const skip = el(
    doc,
    "button",
    "bg-transparent border-0 p-0 text-foreground text-sm font-semibold underline min-h-6 cursor-pointer",
    "Skip tour",
  );
  skip.type = "button";
  header.append(count, skip);

  const title = el(doc, "h2", "section-heading mb-0 focus:outline-none");
  title.id = "tour-title";
  title.tabIndex = -1;
  const body = el(doc, "p", "text-muted");
  body.id = "tour-body";

  const actions = el(doc, "div", "flex gap-2");
  const back = el(doc, "button", "btn h-11 px-4 text-base", "Back");
  back.type = "button";
  const next = el(doc, "button", "btn btn-primary h-11 flex-1 text-base");
  next.type = "button";
  actions.append(back, next);

  card.append(header, title, body, actions);
  layer.append(shield, spot, card);
  return { layer, shield, spot, card, count, skip, title, body, back, next };
}

// The page is looked at, not used: everything but the tour is inert, and the tour drives it by script.
export function runTour(request, { doc = document, loc = window.location } = {}) {
  const ui = buildLayer(doc);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const steps = currentSteps();
  const stepAt = i => steps[i];
  const inerted = [...doc.body.children].filter(node => node.tagName !== "SCRIPT");
  let index = request.step;
  let activeState = null;
  let target = null;
  let frame = 0;
  let token = 0;

  function place() {
    frame = 0;
    const rect = target && unionRect(target);
    if (!rect) {
      ui.spot.hidden = true;
      ui.shield.style.background = "rgba(0,0,0,.68)";
      ui.card.style.cssText = "bottom:12px";
      return;
    }
    ui.shield.style.background = "";
    ui.spot.hidden = false;
    ui.spot.style.left = `${rect.left - SPOT_PAD_PX}px`;
    ui.spot.style.top = `${rect.top - SPOT_PAD_PX}px`;
    ui.spot.style.width = `${rect.width + SPOT_PAD_PX * 2}px`;
    ui.spot.style.height = `${rect.height + SPOT_PAD_PX * 2}px`;
    const inLowerHalf = rect.top + rect.height / 2 > window.innerHeight / 2;
    const cardOnTop = inLowerHalf && !isTall(rect) && stepAt(index).placement !== "bottom";
    ui.card.style.cssText = cardOnTop ? "top:12px" : "bottom:12px";
  }

  function schedulePlace() {
    if (!frame) frame = requestAnimationFrame(place);
  }

  async function setState(wanted) {
    if (activeState === wanted) return;
    if (activeState) STATES[activeState].exit(doc);
    activeState = wanted;
    if (wanted) await STATES[wanted].enter(doc);
    await nextFrame();
    await nextFrame();
  }

  async function show() {
    const step = stepAt(index);
    const mine = ++token;
    await setState(step.state ?? null);
    const found = await waitFor(() => doc.querySelector(step.target), TARGET_TIMEOUT_MS, doc);
    const matches = found ? [...doc.querySelectorAll(step.target)] : null;
    if (mine !== token) return;

    target = matches;
    // A target taller than most of the screen shows its start, with the card below.
    const block = matches && isTall(unionRect(matches)) ? "start" : "center";
    found?.scrollIntoView({ block, behavior: reduceMotion ? "auto" : "smooth" });
    ui.count.textContent = `${index + 1} of ${steps.length}`;
    ui.title.textContent = step.title;
    ui.body.textContent = step.body;
    ui.back.hidden = index === 0;
    ui.next.textContent = index === steps.length - 1 ? "Done" : "Next";
    window.history.replaceState(
      null,
      "",
      tourUrl({ user: request.user, page: step.page, step: index, returnTo: request.returnTo }),
    );
    place();
    ui.title.focus();
  }

  function leave() {
    token++;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", schedulePlace);
    window.removeEventListener("scroll", schedulePlace, true);
    doc.removeEventListener("keydown", onKeydown);
    if (activeState) STATES[activeState].exit(doc);
    for (const node of inerted) node.inert = false;
    ui.layer.remove();
    if (request.returnTo) {
      loc.assign(request.returnTo);
      return;
    }
    const url = new URL(loc.href);
    url.searchParams.delete("tour");
    url.searchParams.delete("returnTo");
    window.history.replaceState(null, "", url);
  }

  function go(next) {
    if (next < 0) return;
    if (next >= steps.length) {
      leave();
      return;
    }
    const from = stepAt(index);
    const to = stepAt(next);
    index = next;
    if (to.page !== from.page) {
      token++;
      if (activeState) STATES[activeState].exit(doc);
      loc.assign(tourUrl({ user: request.user, page: to.page, step: next, returnTo: request.returnTo }));
      return;
    }
    show().catch(leave);
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      leave();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [ui.skip, ui.back, ui.next].filter(button => !button.hidden);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  ui.skip.addEventListener("click", leave);
  ui.back.addEventListener("click", () => go(index - 1));
  ui.next.addEventListener("click", () => go(index + 1));
  window.addEventListener("resize", schedulePlace);
  window.addEventListener("scroll", schedulePlace, true);
  doc.addEventListener("keydown", onKeydown);

  doc.body.append(ui.layer);
  for (const node of inerted) node.inert = true;
  return show().catch(leave);
}

export function startTour() {
  const steps = currentSteps();
  const request = readTourRequest(window.location, steps.length);
  if (!request) return Promise.resolve();
  const step = steps[request.step];
  if (!isOnPage(window.location.pathname, request.user, step.page)) {
    window.location.replace(
      tourUrl({ user: request.user, page: step.page, step: request.step, returnTo: request.returnTo }),
    );
    return Promise.resolve();
  }
  return runTour(request);
}
