<#
.SYNOPSIS
  Checks out a PR, installs dependencies, starts the dev server, seeds
  some test data, and opens the app in the browser once it's ready.

.DESCRIPTION
  Runs `gh pr checkout <number>` and `pnpm install`, then starts `pnpm dev`
  in its own PowerShell window (so you keep a normal interactive dev
  terminal -- Ctrl+C there stops the server same as always) while this
  script tails its output for wrangler's "Ready on http://..." line.
  Once that appears, it seeds a handful of realistic logbook entries
  (scripts/seed-dev-data.mjs -- safe to re-run, it no-ops on entries that
  already exist) and opens <that url>/logbook in your default browser.
  The port isn't hardcoded on purpose -- wrangler bumps to the next free
  port (8788, 8789, ...) if 8787 is already in use, so we read whatever
  it actually printed rather than guessing.

.PARAMETER PrNumber
  The PR number to check out (e.g. 56).

.PARAMETER NoSeed
  Skip seeding test data -- just start the server and open the browser.

.EXAMPLE
  scripts\review-pr.ps1 56

.EXAMPLE
  scripts\review-pr.ps1 56 -NoSeed
#>
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$PrNumber,

  [switch]$NoSeed
)

$ErrorActionPreference = "Stop"

Write-Host "==> Checking out PR #$PrNumber"
gh pr checkout $PrNumber
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Installing dependencies"
pnpm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$logFile = Join-Path $env:TEMP "climbing-logbook-dev.log"
Remove-Item $logFile -ErrorAction SilentlyContinue

Write-Host "==> Starting dev server in a new window"
# Tee-Object keeps the new window's output visible AND writable to a file,
# so this script can watch for readiness without swallowing the console
# output you'd normally want to see (errors, live-reload messages, etc).
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "pnpm dev 2>&1 | Tee-Object -FilePath `"$logFile`""
)

Write-Host "==> Waiting for the dev server to report ready..."
$url = $null
$deadline = (Get-Date).AddSeconds(60)
while (-not $url -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $logFile) {
    $match = Select-String -Path $logFile -Pattern "Ready on (http://\S+)" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($match) { $url = $match.Matches[0].Groups[1].Value }
  }
}

if (-not $url) {
  Write-Host "==> Timed out after 60s waiting for the dev server. Check the new pnpm dev window for errors."
  exit 1
}

Write-Host "==> Dev server ready at $url"

if (-not $NoSeed) {
  Write-Host "==> Seeding test data"
  pnpm run seed $url
  # A seeding failure shouldn't stop you from opening the app -- the log
  # above is enough to notice and rerun manually if it matters.
}

Write-Host "==> Opening $url/logbook"
Start-Process "$url/logbook"
