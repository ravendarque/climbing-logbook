import { feedbackSection } from "../shared/feedback-section.js";

export function preselectSection(select, referrer) {
  const section = feedbackSection(referrer);
  if ([...select.options].some(option => option.value === section)) select.value = section;
}
