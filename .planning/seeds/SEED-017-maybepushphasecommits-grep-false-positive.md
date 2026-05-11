---
id: SEED-017
status: ripe
planted: 2026-05-11
ripened: 2026-05-11
planted_during: gsd-update --reapply smoke test of restored Phase 56 deploy_targets feature
trigger_when: NEXT deliberate edit to `~/.claude/get-shit-done/bin/lib/phase.cjs` — land the regex fix as a piggy-back so it survives the next gsd-update --reapply via the gsd-local-patches mechanism. Also fires on: a false-positive observed in the wild (push log says deploy target touched but the named phase didn't actually touch it); OR a future GSD update reapply cycle touches the function again.
scope: Small (≤ 5-line localized regex change + a smoke test invocation against phase 9999, 120, and one false-positive candidate like 122)
---

# SEED-017: maybePushPhaseCommits grep regex false-positives on body matches

## The bug

`maybePushPhaseCommits(cwd, phaseNum)` in
`~/.claude/get-shit-done/bin/lib/phase.cjs` selects "this phase's commits"
via:

```js
const grepPattern = `\\(${escapedPhase}[^0-9]`;
execGit(cwd, ['log', `--grep=${grepPattern}`, '--extended-regexp', '--pretty=format:%H', 'main']);
```

`git log --grep` searches the **entire** commit message (subject + body),
not just the subject. So any commit whose body contains `(NNN<non-digit>`
as a literal substring — for any reason — gets pulled into the phase's
commit set.

## How it surfaced

Smoke-tested `maybePushPhaseCommits(cwd, 122)` on dailybrief main during
the post-reapply verification of the v1.41.2 GSD update (2026-05-11).
Function reported `push: true, commit_count: 17, touched_targets: ["vigil-core"]`.
Investigation:

- Phase 122 is `vigil-watch-core-watcher-parser-emitter-config` — Mac-only,
  zero vigil-core/ touches by design.
- The `vigil-core/` hit came from SHA `dc73066…`, subject
  `test(79.1-03): add regression coverage for scopes + account_email …`.
- Its body contains the prose `127/127 tests pass (122 existing + 5 new), 0 regressions.`
- `(122 ` matches `\(122[^0-9]` because `' '` is non-digit.

Push was a no-op (`origin/main…main` was 0/0), so no actual deploy harm.
But if the false-matched commit had been local-only, the function would
have triggered a spurious push and a Railway redeploy from a phase the
operator believed was Mac-isolated. That's the exact 53-04 foot-gun
Phase 56 was built to *prevent*, just routed through a different vector.

## Concrete fix

Replace the loose substring grep with an **anchored conventional-commit
subject-line** match. Two approaches:

### Approach A — anchor in git's regex (minimal diff)

```js
// Conventional commits subject form: type(scope): summary
// scope = "<phase>" or "<phase>-<plan>" or "<phase>.<sub>-<plan>"
// Anchor with ^ so we only match the subject; require ':' after the scope
// so prose-parens in bodies never match.
const escapedPhase = escapeRegex(String(phaseNum));
const grepPattern = `^[a-zA-Z]+\\(${escapedPhase}(-[0-9]+(\\.[0-9]+)?|\\.[0-9]+(-[0-9]+)?)?\\):`;
```

`git log --grep` with `--extended-regexp` honors `^` per-line. Subjects
are the first line of the message, so `^` anchors to subject-only when
the pattern excludes characters that appear mid-body (the `:` requirement
is what carries the load — bodies that contain `feat(122):` *would* still
match, but that's borderline-correct: that body is explicitly citing
phase 122 work).

### Approach B — switch to per-commit subject check

Grep loosely (or list all commits in a date range), then post-filter
each candidate SHA with `git log -1 --pretty=format:%s <sha>` and a JS
regex test on the subject. Strictly correct, slightly more git calls.
Not worth it if Approach A works.

**Test cases to assert after fix:**

| Commit subject / body fragment | phase=122 result |
|---|---|
| `feat(122): add foo` | match |
| `docs(122-03): wire bar` | match |
| `fix(122.1-01): hot patch` | match |
| `chore(1220): unrelated` | no match |
| `test(79.1-03): … (122 existing + 5 new) …` | **no match** (regression case) |
| body-only mention of phase 122 (no subject prefix) | no match |

## Why dormant, not active

- The function reapplied cleanly during this update cycle. No urgent
  correctness loss — push behavior degrades to a no-op when origin is
  already in sync, which it usually is during routine flow.
- The false-positive vector requires (a) loose-pattern grep match in a
  body, AND (b) the falsely-matched commit touches a deploy-target dir.
  Co-incidence rate is low.
- Fix is ~3-line localized change in a file that GSD itself owns
  (`~/.claude/get-shit-done/bin/lib/phase.cjs`). Cleanest path is to bake
  the fix into the project's local-patches set so the next
  `gsd-update --reapply` carries it forward — meaning the natural place
  to land this is alongside the next deliberate edit to phase.cjs, not
  as a one-off chore.
- Worth doing before any phase where origin/main has drifted from local
  (common during long away-from-desk sessions where push lag can
  accumulate). At that point a false-positive *does* trigger a real
  Railway redeploy.

## Related files

- `~/.claude/get-shit-done/bin/lib/phase.cjs` — `maybePushPhaseCommits`
  (the function), `module.exports.maybePushPhaseCommits` (export)
- `~/.claude/gsd-local-patches/get-shit-done/bin/lib/phase.cjs` —
  the backup that gets re-applied on the next GSD update
- `~/.claude/gsd-pristine/get-shit-done/bin/lib/phase.cjs` — clean
  v1.34.2 baseline (regenerable from `gsd-build/get-shit-done@v1.34.2`)
- Memory `feedback_confirm_prerequisites.md` — same theme: assumptions
  about "what the code does" need empirical verification before
  shipping the dependent feature
