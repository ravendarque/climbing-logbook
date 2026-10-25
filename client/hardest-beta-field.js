// Only the Performance page uses the interpreter, so it stays out of the log page's first load.
let interpreter = null;
let loading = null;
const loadInterpreter = () =>
  (loading ??= import("@ravendarque/beta-interpreter").then(module => {
    interpreter = module;
  }));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function facetOfSpan(span) {
  if (span.facet === "limb") return "limb";
  if (!span.term) return span.facet;
  return span.term.facets[0];
}

// A wording the interpreter can only read one way, so picking a meaning edits the text, which is all that's saved.
function unambiguousWording(term) {
  const { lexicon, norm } = interpreter;
  return term.match.find(m => lexicon.get(norm(m))?.length === 1) ?? term.match[0];
}

function questionsFor(reading, dismissed) {
  const { norm } = interpreter;
  const questions = [];
  for (const a of reading.amb) {
    questions.push({
      key: `amb:${a.s}`,
      chip: `${a.word}?`,
      label: `Check “${a.word}”`,
      prompt: `Which ${a.word} did you mean?`,
      answers: a.options.map(term => ({
        label: term.name,
        replace: { s: a.s, e: a.s + a.word.length, text: unambiguousWording(term) },
      })),
    });
  }
  for (const u of reading.unknown) {
    if (dismissed.has(norm(u.raw))) continue;
    questions.push({
      key: `unk:${u.s}`,
      chip: `${u.raw}?`,
      label: `Check “${u.raw}”`,
      prompt: u.guess
        ? `“${u.raw}” isn’t a word it knows. Did you mean “${u.guess}”?`
        : `“${u.raw}” isn’t a word it knows.`,
      answers: [
        ...(u.guess ? [{ label: `Use “${u.guess}”`, replace: { s: u.s, e: u.e, text: u.guess } }] : []),
        { label: "Keep as written", dismiss: norm(u.raw) },
      ],
    });
  }
  return questions;
}

export function createHardestBetaField({ input, reading, readback, chips, panel, steps }) {
  let dismissed = new Set();
  let openKey = null;

  function renderReadback(text, result) {
    const unknownStarts = new Set(result.unknown.map(u => u.s));
    const spans = [...result.spans, ...result.unknown.map(u => ({ s: u.s, e: u.e, facet: "unknown" }))].sort(
      (a, b) => a.s - b.s,
    );
    const nodes = [];
    let at = 0;
    for (const span of spans) {
      if (span.s < at) continue;
      if (span.s > at) nodes.push(document.createTextNode(text.slice(at, span.s)));
      const word = text.slice(span.s, span.e);
      if (span.facet === "unknown" && unknownStarts.has(span.s)) {
        nodes.push(el("span", "beta-unknown", word));
      } else {
        const mark = el("mark", `beta-mark beta-${facetOfSpan(span)}${span.ambiguous ? " beta-unknown" : ""}`, word);
        if (span.term) mark.title = span.term.name;
        nodes.push(mark);
      }
      at = span.e;
    }
    if (at < text.length) nodes.push(document.createTextNode(text.slice(at)));
    readback.replaceChildren(...nodes);
  }

  function renderQuestions(questions) {
    if (!questions.some(q => q.key === openKey)) openKey = null;
    chips.replaceChildren(
      ...questions.map(q => {
        const chip = el("button", "beta-chip", q.chip);
        chip.type = "button";
        chip.setAttribute("aria-label", q.label);
        chip.setAttribute("aria-controls", panel.id);
        chip.setAttribute("aria-expanded", String(q.key === openKey));
        chip.addEventListener("click", () => {
          openKey = openKey === q.key ? null : q.key;
          render();
        });
        return chip;
      }),
    );
    const open = questions.find(q => q.key === openKey);
    panel.hidden = !open;
    if (!open) return panel.replaceChildren();
    const buttons = el("div", "flex flex-wrap gap-2");
    for (const answer of open.answers) {
      const button = el("button", "beta-answer", answer.label);
      button.type = "button";
      button.addEventListener("click", () => {
        openKey = null;
        if (answer.dismiss) dismissed.add(answer.dismiss);
        if (answer.replace) {
          const { s, e, text } = answer.replace;
          input.value = input.value.slice(0, s) + text + input.value.slice(e);
          input.dispatchEvent(new Event("input"));
        } else render();
      });
      buttons.append(button);
    }
    panel.replaceChildren(el("p", "m-0", open.prompt), buttons);
  }

  function renderSteps(result) {
    steps.replaceChildren(
      ...result.beats.map(beat => {
        const item = el("li", "", interpreter.say(beat));
        if (beat.crux) item.append(" ", el("span", "beta-crux", "Crux"));
        for (const issue of beat.issues) item.append(el("span", "block text-xs text-warning-ink", issue));
        return item;
      }),
    );
  }

  function render() {
    const text = input.value;
    reading.hidden = !text.trim();
    if (reading.hidden) return;
    if (!interpreter) return void loadInterpreter().then(render);
    const result = interpreter.parse(text);
    renderReadback(text, result);
    renderQuestions(questionsFor(result, dismissed));
    renderSteps(result);
  }

  input.addEventListener("input", render);

  return {
    setValue(text) {
      input.value = text ?? "";
      dismissed = new Set();
      openKey = null;
      render();
    },
    getValue() {
      return input.value.trim() || null;
    },
    ready: loadInterpreter,
  };
}
