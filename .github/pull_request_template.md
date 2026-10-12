Closes #

## What's new

<!-- One plain sentence per change a climber would notice, listed on Help > What's new. Leave empty if they won't notice anything. -->

## Definition of done

See [docs/definition-of-done.md](https://github.com/ravendarque/climbing-logbook/blob/main/docs/definition-of-done.md).

- [ ] Tracked: issue linked, branch named by prefix, issue on the board
- [ ] Reviewed: code review against coding standards, blocking and should-fix findings fixed
- [ ] Tested: covered at the right layer; `pnpm test` passes, and the e2e areas the change touches (or the whole suite, see the definition of done)
- [ ] Verified: user-facing changes driven in a browser, light and dark, desktop and phone
- [ ] No slower: boot-perf test passes; boot-path changes compared before and after
- [ ] Documented: docs and ADRs updated; no narrative comments
- [ ] Clean: nothing the change replaced is left behind
- [ ] Labelled: correct release label
- [ ] Announced: "What's new" filled in if climbers will notice the change, empty if not
