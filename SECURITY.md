# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in this project, please report it
privately rather than opening a public issue.

Use GitHub's private vulnerability reporting: the "Report a vulnerability"
button under this repo's
[Security tab](https://github.com/ravendarque/climbing-logbook/security/advisories/new).
This opens a private draft advisory visible only to the maintainer until a
fix is ready.

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce (a minimal proof of concept where possible)
- A suggested fix, if you have one

## What to expect

This is a personal, single-maintainer project — response times are
best-effort, not SLA-backed. Confirmed vulnerabilities get fixed and
disclosed via a GitHub Security Advisory once a patch is available.

## Good-faith research

If you look for vulnerabilities in good faith and follow this policy, we won't take action against you, and we'll work with you to understand and fix what you find. Please:

- only use accounts you own, or that you've made for testing;
- never access, change or keep another person's data. If you come across some, stop and tell us;
- don't run denial-of-service or high-volume tests against `climbinglogbook.com` or its subdomains;
- don't use social engineering, phishing or physical attacks;
- give us a reasonable chance to fix a problem before you talk about it publicly.

We try to acknowledge a report within 7 days and keep you updated as we work on it.

## Scope

Covers the application code in this repository (`client/`, `server/`) and its
Terraform-managed infrastructure config (`infra/`). Does not cover the
underlying Cloudflare Workers/KV platform itself — report platform-level
issues to Cloudflare directly.

## Supported versions

Only the latest deployed version (the most recent `vX.Y.Z` git tag — see
`docs/versioning.md`) is supported. This is a continuously-deployed
application, not a versioned library; there's no backporting fixes to
older tags.
