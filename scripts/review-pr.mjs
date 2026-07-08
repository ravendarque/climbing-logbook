/**
 * Checks out a PR, installs dependencies, starts the dev server, seeds
 * some test data, and opens the app in the browser once it's ready --
 * all in the terminal you ran this from. Replaces review-pr.ps1/.bat
 * (see #72): those launched `pnpm dev` in a separate, detached
 * PowerShell window, which was both jarring UX and Windows-only. This
 * relays the dev server's own stdout back into this process instead --
 * one terminal, Ctrl+C stops both this script and the dev server
 * together, and it works on macOS/Linux for free.
 *
 * Usage:
 *   pnpm run review <pr-number> [--no-seed]
 */

import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";

const WIN = platform() === "win32";
const READY_RE = /Ready on (https?:\/\/\S+)/;
const READY_TIMEOUT_MS = 60_000;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = s => s.replace(ANSI_RE, "");

const prNumber = process.argv[2];
const noSeed = process.argv.includes("--no-seed");

if (!prNumber || prNumber.startsWith("-")) {
  console.error("Usage: pnpm run review <pr-number> [--no-seed]");
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: WIN });
  if (result.status !== 0) {
    console.error(`\n"${cmd} ${args.join(" ")}" failed (exit ${result.status ?? result.signal}).`);
    process.exit(result.status ?? 1);
  }
}

function openBrowser(url) {
  const [cmd, args] = WIN
    ? ["start", ["", url]] // empty title arg -- `start` treats the first quoted arg as a window title
    : platform() === "darwin"
      ? ["open", [url]]
      : ["xdg-open", [url]];
  // A missing opener (e.g. no xdg-open) shouldn't take the dev server down
  // with it -- an unhandled 'error' event on a failed spawn is an
  // uncaught exception by default, not just a no-op.
  const opener = spawn(cmd, args, { shell: WIN, stdio: "ignore", detached: true });
  opener.on("error", () => console.error(`Couldn't open a browser automatically -- open ${url} yourself.`));
  opener.unref();
}

console.log(`==> Checking out PR #${prNumber}`);
run("gh", ["pr", "checkout", prNumber]);

console.log("==> Installing dependencies");
run("pnpm", ["install"]);

console.log("==> Starting dev server");
const dev = spawn("pnpm", ["dev"], {
  stdio: ["inherit", "pipe", "inherit"],
  shell: WIN,
  // Piping stdout (so this script can scan it) means the child no longer
  // sees a TTY, and tools like concurrently/wrangler often mute their own
  // colored output in that case -- force it back on rather than losing
  // the readability the separate-window version had for free.
  env: { ...process.env, FORCE_COLOR: "1" },
  // `pnpm dev` itself runs concurrently, which runs wrangler and the
  // Tailwind watcher as further children -- killing just this direct
  // child leaves that whole subtree running. On POSIX, `detached: true`
  // makes this child the leader of its own process group, so
  // `process.kill(-dev.pid, sig)` below can signal the entire tree at
  // once instead of just the one PID.
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
  console.log(`\n==> Dev server ready at ${url}`);

  if (!noSeed) {
    console.log("==> Seeding test data");
    // A seeding failure shouldn't stop you from opening the app -- the
    // output above is enough to notice and rerun manually if it matters.
    spawnSync("node", ["scripts/seed-dev-data.mjs", url], { stdio: "inherit" });
  }

  console.log(`==> Opening ${url}/logbook`);
  openBrowser(`${url}/logbook`);
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
