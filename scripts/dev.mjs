// Starts Vite and the Tailwind watcher, seeds data and opens the login page; Ctrl+C stops it all.
// Vite, not wrangler dev: wrangler dev rewrites the origin to the production route and ignores my. hosts.
//   pnpm dev [--no-seed] [--no-open]

import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";

const WIN = platform() === "win32";
const READY_RE = /Local:\s+(https?:\/\/\S+)/;
const READY_TIMEOUT_MS = 60_000;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = s => s.replace(ANSI_RE, "");

const noSeed = process.argv.includes("--no-seed");
const noOpen = process.argv.includes("--no-open");

function openBrowser(url) {
  const [cmd, args] = WIN
    ? ["start", ["", url]] // empty title arg -- `start` treats the first quoted arg as a window title
    : platform() === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  // A missing opener must not crash the dev server; the URL is printed anyway.
  const opener = spawn(cmd, args, { shell: WIN, stdio: "ignore", detached: true });
  opener.on("error", () => console.error(`Couldn't open a browser automatically -- open ${url} yourself.`));
  opener.unref();
}

console.log("==> Starting dev server");
// concurrently directly: each nested pnpm layer prints its own ELIFECYCLE line on Ctrl+C.
const dev = spawn("concurrently", [
  "-n", "vite,tailwind,html",
  "-c", "blue,magenta,green",
  "vite dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/-/tailwind.css --watch",
  "pnpm run html:watch",
], {
  stdio: ["inherit", "pipe", "inherit"],
  shell: WIN,
  // Piped stdout isn't a TTY, so force colour back on.
  env: { ...process.env, FORCE_COLOR: "1" },
  // Its own process group, so one signal stops the whole tree.
  detached: !WIN,
});

function stopDev(sig) {
  if (WIN) {
    spawnSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"]);
  } else {
    try { process.kill(-dev.pid, sig); } catch { /* already gone */ }
  }
}

let ready = false;
let buffer = "";
let stopping = false;

const readyTimer = setTimeout(() => {
  if (ready) return;
  console.error("\n==> Timed out after 60s waiting for the dev server. Check the output above for errors.");
  stopping = true;
  stopDev("SIGTERM");
}, READY_TIMEOUT_MS);

dev.stdout.on("data", chunk => {
  process.stdout.write(chunk);
  if (ready) return;
  buffer += stripAnsi(chunk.toString());
  const match = buffer.match(READY_RE);
  if (!match) return;

  ready = true;
  clearTimeout(readyTimer);
  const url = match[1].replace(/\/+$/, "");
  const loginUrl = `${url}/login/`;
  console.log(`\n==> Dev server ready at ${url}`);

  if (!noSeed) {
    console.log("==> Seeding test data");
    spawnSync("node", ["scripts/seed-dev-data.mjs", url], { stdio: "inherit" });
  }

  console.log(`==> Login: ${loginUrl}`);
  if (!noOpen) openBrowser(loginUrl);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    stopDev(sig);
  });
}

// Wait for the tree to exit: exiting straight away made concurrently crash writing to a closed pipe.
dev.on("exit", code => process.exit(stopping ? 0 : (code ?? 0)));
