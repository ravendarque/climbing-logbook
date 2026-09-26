# Definition of done

A PR is ready for review when every item below holds. The same list is the
checklist in `.github/pull_request_template.md`; tick it before marking the
PR ready. Each item points at the rule it comes from rather than restating it.

1. **Tracked.** A GitHub issue exists, the branch is linked to it and named
   by the right prefix, and the issue is on the board
   ([CLAUDE.md](../CLAUDE.md), Git and GitHub workflow).
2. **Reviewed.** The diff has had a code review against
   [coding-standards.md](coding-standards.md), and every blocking and
   should-fix finding is fixed.
3. **Tested.** New or changed behaviour is covered at the right layer
   ([ADR-0011](adr/0011-three-layer-test-pyramid.md)), and `pnpm test` and
   `pnpm run test:e2e` both pass.
4. **Verified.** User-facing changes have been driven in a browser, in light
   and dark themes, at desktop and phone widths
   ([coding-standards.md](coding-standards.md#verification)).
5. **No slower.** `e2e/log-page-boot-perf.spec.js` still passes, and a change
   to the boot path has its local render time compared before and after. No
   throttled-network timings ([ADR-0026](adr/0026-local-preview-cant-validate-network-performance.md)).
6. **Documented.** Docs and ADRs are updated where behaviour or a decision
   changed, and the diff adds no narrative comments
   ([coding-standards.md](coding-standards.md#comments-and-docs)).
7. **Clean.** Nothing the change replaced is left behind: no unused exports,
   CSS, fixtures, scripts or tests.
8. **Labelled.** The PR has the right release label
   ([versioning.md](versioning.md#what-semver-means-for-this-project)).
