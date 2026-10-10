// The count comes from the field's maxLength, which the page sets from shared/field-limits.js.
export function showCharactersLeft(field, counter) {
  const update = () => {
    const left = field.maxLength - field.value.length;
    counter.textContent = `${left.toLocaleString("en-GB")} ${left === 1 ? "character" : "characters"} left`;
  };
  field.addEventListener("input", update);
  field.form?.addEventListener("reset", () => setTimeout(update));
  field.setAttribute("aria-describedby", counter.id);
  update();
  return update;
}
