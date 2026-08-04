# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in this project, please report it
privately rather than opening a public issue.

**Preferred: GitHub private vulnerability reporting.** Use the "Report a
vulnerability" button under this repo's
[Security tab](https://github.com/ravendarque/climbing-logbook/security/advisories/new).
This opens a private draft advisory visible only to the maintainer until a
fix is ready.

**Alternative: email** nix@ravendarque.com.

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce (a minimal proof of concept where possible)
- A suggested fix, if you have one

## What to expect

This is a personal, single-maintainer project — response times are
best-effort, not SLA-backed. Confirmed vulnerabilities get fixed and
disclosed via a GitHub Security Advisory once a patch is available.

## Scope

Covers the application code in this repository (`client/`, `src/`) and its
Terraform-managed infrastructure config (`infra/`). Does not cover the
underlying Cloudflare Workers/KV platform itself — report platform-level
issues to Cloudflare directly.

## Supported versions

Only the latest deployed version (the most recent `vX.Y.Z` git tag — see
`docs/versioning.md`) is supported. This is a continuously-deployed
application, not a versioned library; there's no backporting fixes to
older tags.
