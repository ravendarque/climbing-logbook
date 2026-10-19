const OS = [
  [/Android/, "Android"],
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/CrOS/, "ChromeOS"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"],
];

const BROWSERS = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Vivaldi/, "Vivaldi"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/CriOS|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const match = (table, userAgent) => table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "";

// iPadOS asks for desktop sites, so its user agent says Macintosh; only the touch screen gives it away.
export function deviceName({ userAgent = "", maxTouchPoints = 0, brave = false } = {}) {
  let os = match(OS, userAgent);
  if (os === "Mac" && maxTouchPoints > 1) os = "iPad";
  const browser = brave ? "Brave" : match(BROWSERS, userAgent);
  return [browser, os].filter(Boolean).join(" on ");
}
