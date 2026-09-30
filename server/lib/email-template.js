import { escapeHtml } from "./html-escape.js";

const COLOURS = {
  page: "#f5f5f5",
  card: "#ffffff",
  border: "#dcdcdc",
  text: "#1a1a1a",
  muted: "#6b6b6b",
  accent: "#c8161b",
  onAccent: "#ffffff",
};
const BODY_FONT = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
const DISPLAY_FONT = "'Bebas Neue', Impact, 'Arial Narrow Bold', 'Helvetica Neue', Arial, sans-serif";
const LOCKUP_PATH = "/-/email-lockup.png";

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function htmlParagraph(part) {
  const style = `margin:0 0 16px;font-size:16px;line-height:1.5;color:${COLOURS.text}`;
  if (typeof part === "string") return `<p style="${style}">${escapeHtml(part)}</p>`;
  return `<p style="${style}"><strong style="word-break:break-all">${escapeHtml(part.strong)}</strong></p>`;
}

function textParagraph(part) {
  return typeof part === "string" ? part : part.strong;
}

// Tables and inline styles: most mail clients ignore <style> blocks and modern layout.
export function renderEmail({ title, paragraphs, action, note }) {
  const url = escapeHtml(action.url);
  const origin = originOf(action.url);
  const brand = origin
    ? `<img src="${escapeHtml(origin + LOCKUP_PATH)}" width="200" height="30" alt="Climbing Logbook" style="display:block;border:0;width:200px;height:30px;font-family:${DISPLAY_FONT};font-size:24px;color:${COLOURS.text}">`
    : `<span style="font-family:${DISPLAY_FONT};font-size:24px;letter-spacing:.02em;color:${COLOURS.text}">CLIMBING LOGBOOK</span>`;

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOURS.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOURS.page}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 4px 20px">${brand}</td></tr>
<tr><td style="background:${COLOURS.card};border:1px solid ${COLOURS.border};border-radius:8px;padding:32px 28px;font-family:${BODY_FONT}">
<h1 style="margin:0 0 20px;font-family:${DISPLAY_FONT};font-size:32px;line-height:1.1;font-weight:400;letter-spacing:.02em;text-transform:uppercase;color:${COLOURS.accent}">${escapeHtml(title)}</h1>
${paragraphs.map(htmlParagraph).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
<tr><td style="border-radius:8px;background:${COLOURS.accent}">
<a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${BODY_FONT};font-size:16px;font-weight:700;line-height:1;color:${COLOURS.onAccent};text-decoration:none;border-radius:8px">${escapeHtml(action.label)}</a>
</td></tr>
</table>
<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${COLOURS.muted}">If the button doesn't work, paste this link into your browser:</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.5;word-break:break-all"><a href="${url}" style="color:${COLOURS.accent}">${url}</a></p>
<p style="margin:0;padding-top:20px;border-top:1px solid ${COLOURS.border};font-size:14px;line-height:1.5;color:${COLOURS.muted}">${escapeHtml(note)}</p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${BODY_FONT};font-size:12px;line-height:1.5;color:${COLOURS.muted}">Climbing Logbook sent this email about your account.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    title,
    ...paragraphs.map(textParagraph),
    `${action.label}: ${action.url}`,
    note,
    "Climbing Logbook",
  ].join("\n\n");

  return { html, text };
}
