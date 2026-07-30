/**
 * Starts the local dev server (wrangler + Tailwind watcher + client JS
 * bundle watcher, via `concurrently` directly), waits for it to be ready,
 * seeds some test data, and opens the app in a browser at the actual
 * /logbook path --
 * all in one terminal, Ctrl+C stops everything together.
 *
 * This used to be `pnpm run review`-only behavior (see #72/#88/#116);
 * moved here so plain `pnpm dev` gets the same experience. The old
 * review-pr.mjs wrapper (checkout a PR, install, then delegate to this
 * script) was removed (#124) -- it added a whole extra nested `pnpm`
 * layer just to save typing `gh pr checkout <pr>` yourself first.
 *
 * That wasn't the whole story on Ctrl+C noise, though (#124 follow-up):
 * every `pnpm run <script>` layer directly exposed to the terminal's
 * SIGINT prints its own "[ELIFECYCLE] Command failed" line, regardless
 * of what its child actually exits with -- so this used to spawn
 * `pnpm run dev:raw` as a second such layer, doubling the noise. It now
 * spawns `concurrently` (dev:raw's actual command) directly instead,
 * leaving only the one, unavoidable line from the outer `pnpm dev`
 * invocation itself. `dev:raw` stays in package.json for standalone use.
 *
 * Usage:
 *   pnpm dev [--no-seed] [--no-open]
 */

import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";

const WIN = platform() === "win32";
const READY_RE = /Ready on (https?:\/\/\S+)/;
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
  // A missing opener (e.g. no xdg-open, or a headless/no-GUI environment)
  // shouldn't take the dev server down with it -- an unhandled 'error'
  // event on a failed spawn is an uncaught exception by default, not just
  // a no-op. The URL is already printed unconditionally above this call
  // either way, so this is purely a convenience, not the only way to get
  // the link.
  const opener = spawn(cmd, args, { shell: WIN, stdio: "ignore", detached: true });
  opener.on("error", () => console.error(`Couldn't open a browser automatically -- open ${url} yourself.`));
  opener.unref();
}

console.log("==> Starting dev server");
// Spawning `concurrently` directly (rather than `pnpm run dev:raw`) skips
// a second nested pnpm layer -- each pnpm layer that's directly exposed to
// the terminal's Ctrl+C prints its own "[ELIFECYCLE] Command failed" line
// on SIGINT independent of its child's actual exit code, so going through
// `pnpm run dev:raw` here doubled that noise. `dev:raw` stays in
// package.json for anyone who wants to run it standalone.
const dev = spawn("concurrently", [
  "-n", "wrangler,tailwind,client",
  "-c", "blue,magenta,green",
  "wrangler dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch",
  "pnpm run client:watch",
], {
  stdio: ["inherit", "pipe", "inherit"],
  shell: WIN,
  // Piping stdout (so this script can scan it) means the child no longer
  // sees a TTY, and tools like concurrently/wrangler often mute their own
  // colored output in that case -- force it back on rather than losing
  // the readability running this directly in a terminal has for free.
  env: { ...process.env, FORCE_COLOR: "1" },
  // concurrently runs wrangler and the Tailwind watcher as further
  // children -- killing just this direct child leaves that whole subtree
  // running. On POSIX, `detached: true` makes this child the leader of
  // its own process group, so `process.kill(-dev.pid, sig)` below can
  // signal the entire tree at once instead of just the one PID.
  detached: !WIN,
});

function stopDev(sig) {
  if (WIN) {
    // No POSIX process groups on Windows -- kill the whole tree by PID.
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
  const url = match[1];
  const logbookUrl = `${url}/logbook`;
  console.log(`\n==> Dev server ready at ${url}`);

  if (!noSeed) {
    console.log("==> Seeding test data");
    // A seeding failure shouldn't stop you from opening the app -- the
    // output above is enough to notice and rerun manually if it matters.
    spawnSync("node", ["scripts/seed-dev-data.mjs", url], { stdio: "inherit" });
  }

  // Printed unconditionally, regardless of --no-open or whether the OS
  // opener actually works -- a clickable link beats retyping /logbook by
  // hand every time either way.
  console.log(`==> Logbook: ${logbookUrl}`);
  if (!noOpen) openBrowser(logbookUrl);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    // A second signal means "stop waiting, just go" -- don't let an
    // unresponsive child hang the script forever.
    if (stopping) process.exit(1);
    stopping = true;
    stopDev(sig);
  });
}

// Exit once the child (and, via stopDev's process-group signal, its
// whole subtree) has actually finished -- exiting immediately after
// sending the signal races the child's own shutdown and made
// concurrently crash mid-teardown trying to write to our now-closed
// stdout pipe (harmless, but an ugly stack trace on every Ctrl+C).
dev.on("exit", code => process.exit(stopping ? 0 : (code ?? 0)));
