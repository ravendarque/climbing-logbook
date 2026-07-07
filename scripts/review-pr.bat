@echo off
REM Thin wrapper so you can run `scripts\review-pr 56` directly from
REM cmd.exe without hitting PowerShell's default execution-policy
REM restriction on .ps1 files.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0review-pr.ps1" %*
