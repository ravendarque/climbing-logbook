/**
 * Starts the local dev server (vite + Tailwind watcher + client JS bundle
 * watchers, via `concurrently` directly), waits for it to be ready, seeds
 * some test data, and opens the login page in a browser -- all in one
 * terminal, Ctrl+C stops everything together.
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
 * `pnpm run dev:vite` as a second such layer, doubling the noise. It now
 * spawns `concurrently` (dev:vite's actual command) directly instead,
 * leaving only the one, unavoidable line from the outer `pnpm dev`
 * invocation itself. `dev:vite` stays in package.json for standalone use.
 *
 * vite, not `wrangler dev` (#468, was `dev:raw`'s command until this
 * changed) -- confirmed empirically that `wrangler dev`'s local
 * simulation of a `routes`-configured Worker silently rewrites the
 * request's own hostname/origin to the first configured production route
 * (climbinglogbook.com), regardless of what you actually connect to on
 * localhost. That's harmless for most of this app, but it breaks Better
 * Auth's origin/CSRF check outright (a real https-only trusted origin
 * doesn't match the rewritten http://climbinglogbook.com), on top of
 * `wrangler dev` already being unable to honor a `my.`-prefixed hostname
 * at all (#407/#442). `@cloudflare/vite-plugin`'s dev server doesn't have
 * either problem -- see vite.config.js's own #442 comment. `dev:raw`
 * (plain `wrangler dev`) still exists in package.json for anyone who
 * specifically needs it, but expect both quirks above if you reach for it
 * instead of this script.
 *
 * Usage:
 *   pnpm dev [--no-seed] [--no-open]
 */

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
// Spawning `concurrently` directly (rather than `pnpm run dev:vite`) skips
// a second nested pnpm layer -- each pnpm layer that's directly exposed to
// the terminal's Ctrl+C prints its own "[ELIFECYCLE] Command failed" line
// on SIGINT independent of its child's actual exit code, so going through
// `pnpm run dev:vite` here doubled that noise. `dev:vite` stays in
// package.json for anyone who wants to run it standalone.
const dev = spawn("concurrently", [
  "-n", "vite,tailwind,map,performance-pyramid,performance-hub,performance-injury,performance-strengths,performance-trends,log,profile,account,account-edit,account-import,sync",
  "-c", "blue,magenta,yellow,cyan,white,gray,blue,magenta,yellow,cyan,white,gray,blue,magenta",
  "vite dev",
  "tailwindcss -i ./styles/tailwind.css -o ./public/logbook/tailwind.css --watch",
  "pnpm run map:watch",
  "pnpm run performance-pyramid:watch",
  "pnpm run performance-hub:watch",
  "pnpm run performance-injury:watch",
  "pnpm run performance-strengths:watch",
  "pnpm run performance-trends:watch",
  "pnpm run log:watch",
  "pnpm run profile:watch",
  "pnpm run account:watch",
  "pnpm run account-edit:watch",
  "pnpm run account-import:watch",
  "pnpm run sync:watch",
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
  // vite's own "Local:" line ends in a trailing slash (e.g.
  // "http://localhost:5173/") unlike wrangler's old "Ready on <url>"
  // message -- stripped so `${url}/login/` below doesn't end up with a
  // doubled slash.
  const url = match[1].replace(/\/+$/, "");
  // /logbook is retired (#375) -- opening /login/ here is a real,
  // reachable, useful next step regardless of what page you actually
  // want; the my.<domain>-hostname-gated app pages (/:username/log etc,
  // #375) are reachable too now that this runs on vite rather than plain
  // `wrangler dev` (#468/#407/#442), just not a single fixed URL this
  // script could open on your behalf without knowing your username.
  const loginUrl = `${url}/login/`;
  console.log(`\n==> Dev server ready at ${url}`);

  if (!noSeed) {
    console.log("==> Seeding test data");
    // A seeding failure shouldn't stop you from opening the app -- the
    // output above is enough to notice and rerun manually if it matters.
    spawnSync("node", ["scripts/seed-dev-data.mjs", url], { stdio: "inherit" });
  }

  // Printed unconditionally, regardless of --no-open or whether the OS
  // opener actually works -- a clickable link beats retyping it by hand
  // either way.
  console.log(`==> Login: ${loginUrl}`);
  if (!noOpen) openBrowser(loginUrl);
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
