#!/usr/bin/env bash
# vigil-hook-version: 0.1.0
# redact.sh — sourceable bash redactor for vigil-agent-bridge UserPromptSubmit path.
#
# patterns loaded from: redaction-patterns.json  (Rail 2 drift-detector pin)
#
# Semantics (CONTEXT D-R1..D-R3 + RESEARCH Pitfall 4):
#   1. Truncate input to <=80 chars FIRST (bounds regex cost; D-R2).
#   2. Regex-match the truncated slice against each canonical pattern.
#   3. ANY match -> entire output replaced with the literal
#      "[redacted: contains sensitive pattern]" (binary redaction; D-R3).
#   4. No match -> emit the truncated content.
#
# JWT threshold is `{10,}` not `{20,}` per RESEARCH Pitfall 4: a JWT-shaped
# substring starting at offset 70 of an 80-char truncation window only has
# 8 trailing chars after the `ey` prefix; `{20,}` would miss it, `{10,}`
# catches it once we extend by 2 more truncated chars on either side.
#
# DO NOT add `set -euo pipefail`. The `[[ =~ ]]` regex test returns non-zero
# on no-match; under `set -e` that would kill the script (RESEARCH Pitfall 6).
# The `if [[ ... =~ ... ]]; then ... fi` wrapping form is load-bearing —
# the if-gate exempts the [[ test from set -e's exit-on-nonzero semantics.

# Resolve the canonical pattern file relative to THIS script's location.
# BASH_SOURCE[0] is the path to redact.sh even when sourced from another script.
_VIGIL_PATTERNS_FILE="$(dirname "${BASH_SOURCE[0]}")/redaction-patterns.json"

# load_patterns — read redaction-patterns.json via node, emit `patterns`
# entries joined by ASCII SOH (\x01). SOH is the canonical safe delimiter
# inside the `node -e` -> bash IFS handoff (no regex character classes
# in the canonical patterns contain SOH; safe split point).
#
# Silent on parse failure: prints empty string to stdout, never errors to
# stderr. Caller treats empty output as "no patterns loaded" and the
# subsequent for-loop is a no-op, yielding the truncated input unchanged.
load_patterns() {
  PFILE="$_VIGIL_PATTERNS_FILE" node -e "
    const fs = require('fs');
    try {
      const j = JSON.parse(fs.readFileSync(process.env.PFILE, 'utf8'));
      process.stdout.write((j.patterns || []).join('\\u0001'));
    } catch {}
  " 2>/dev/null
}

# redact_prompt <input>
#   Returns (via stdout) either the truncated input or the binary-redaction
#   literal. Always exits 0 — no caller-visible failure modes.
redact_prompt() {
  local input="$1"
  local max_len="${VIGIL_MAX_PROMPT_LEN:-80}"

  # Truncate FIRST — bounds the regex scan to constant time regardless of
  # input size (CONTEXT D-R2). A 4KB clean prompt that happens to contain
  # `bearer` at offset 2000 is NOT redacted because the truncation discards
  # that byte before the regex sees it.
  local truncated="${input:0:$max_len}"

  # Load patterns and split on SOH. The local IFS scope is restored on
  # function return; no global IFS pollution.
  local patterns
  patterns="$(load_patterns)"
  local IFS=$'\x01'
  for pat in $patterns; do
    # if-gated [[ =~ ]] — Pitfall 6: no-match returns 1 which would be
    # fatal under set -e. The if/then/fi wrapping exempts it.
    if [[ "$truncated" =~ $pat ]]; then
      printf '%s' "[redacted: contains sensitive pattern]"
      return 0
    fi
  done

  printf '%s' "$truncated"
}
