# 26. Local preview tooling can't validate real network performance — automated tests stop at cache correctness

## Status

Accepted

## Context

Investigating the remaining gap after [ADR-0025](0025-static-asset-caching-hash-or-version-query.md)'s caching work (2026-09-19): a fully-warm-cache reload under real GPRS-equivalent throttling (Playwright's CDP `Network.emulateNetworkConditions`, Chrome's own historical GPRS preset values) still took ~7.5 seconds against the local production-style build (`vite preview`, [ADR-0021](0021-vite-for-production-build-client-and-worker.md)), despite every JS/CSS asset on the page confirmed genuinely serving from disk cache (`transferSize: 0` on every one, via the Resource Timing API). Tracing it down: the HTML document itself — 42.8KB, uncompressed, correctly never cached since it's dynamic and per-session — accounted for the entire measured delay (`navResponseEnd` alone was ~7.5s of the ~7.5s total). At 50kbps GPRS bandwidth, 42.8KB alone takes ~6.7s regardless of any caching.

Checking *why* it was uncompressed surfaced the real finding: **local `vite preview`/Miniflare doesn't perform Cloudflare's real edge-network compression at all.** Confirmed directly — even a plain, already-verified-cacheable static asset (`tailwind.css`) came back with no `content-encoding` header despite the request explicitly sending `Accept-Encoding: gzip, br`. Cloudflare's own documentation confirms compression is applied "based on the content type" at Cloudflare's global network layer — infrastructure a local Miniflare simulation has no equivalent of. A real deploy, passing through Cloudflare's actual edge, would very likely compress this same 42.8KB HTML document to a small fraction of its size (HTML typically compresses 70-80%), meaningfully changing the real-world number — but there is no way to verify that, or measure how much, using only this project's local tooling.

## Decision

**Automated performance tests in this repo stay scoped to what's deterministically verifiable without a real Cloudflare edge in front of the response.** Concretely, two committed e2e tests each check something local tooling *can* answer honestly:

- `e2e/log-page-boot-perf.spec.js` — real content renders within a generous, small-margin budget with no artificial throttling at all. This measures genuine local performance (bundle size, boot-sequence blocking calls) and is meaningful precisely because it makes no claim about network conditions.
- `e2e/asset-caching.spec.js` — [ADR-0025](0025-static-asset-caching-hash-or-version-query.md)'s caching promise actually holds: a repeat visit serves the covered files from disk with zero bytes transferred. This is deterministic regardless of compression, bandwidth, or latency — it only depends on the browser's own cache behavior against the headers this project controls.

**No automated test in this repo asserts a specific page-load time under simulated throttled network conditions (GPRS or otherwise).** A number measured that way against local `vite preview` would be inflated relative to real production and actively misleading as a committed regression threshold — a future contributor "fixing" a failing throttled-timing test would be chasing a number that was never real to begin with.

Verifying real throttled-network behavior (does a real deploy feel acceptably fast on a genuinely slow connection) remains a manual check: devtools network throttling against a real deployed environment (beta or production), not local tooling.

## Consequences

- [#852](https://github.com/ravendarque/climbing-logbook/issues/852) (the open discovery ticket for a broader performance test suite) needs to account for this constraint directly if it's picked up — in particular, evaluating whether CI can exercise a real deployed preview URL (which *does* sit behind Cloudflare's real edge) for the specific class of test that needs real compression and real edge latency, rather than assuming local `vite preview` is sufficient for every kind of performance assertion.
- Any future investigation into "is this page fast enough on a slow connection" should test against a real deployed URL first, and treat a local-only throttled measurement as, at best, a rough relative comparison between two local runs — never as an absolute number to report or commit to.
- This does not affect [ADR-0025](0025-static-asset-caching-hash-or-version-query.md)'s own caching decision or its test coverage — the caching behavior itself is fully verified; only the *compounding* real-world benefit (how much faster a real, edge-compressed deploy is) stays unmeasured by this suite.
