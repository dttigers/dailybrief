---
phase: 89-7-day-analysis-scope
reviewed: 2026-04-16T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - vigil-core/src/routes/insights.ts
  - vigil-core/src/routes/therapy.ts
  - vigil-pwa/src/api/client.ts
  - vigil-pwa/src/hooks/useInsights.ts
  - vigil-pwa/src/hooks/useTherapy.ts
  - vigil-pwa/src/pages/InsightsPage.tsx
  - vigil-pwa/src/pages/TherapyPage.tsx
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 89: Code Review Report

**Reviewed:** 2026-04-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This phase introduces server-side 7-day rolling window analysis for two new AI features: Insights (pattern/connection/actionPrompt/trend detection across all thoughts) and Therapy (classify, patterns, prep). The overall architecture is sound — rolling window via `getRollingDayWindow`, 200-row limits, confidence filtering, and proper 400/503/502 error shapes. One critical data-leak bug was found in the therapy routes. Three warnings cover a bearer-null header sent on every unauthenticated request, dead code in the prep prompt pipeline, and a scope mismatch between the patterns query and its prompt. Two info items flag array-index keys and shared error state in hooks.

---

## Critical Issues

### CR-01: Raw AI output (containing user thought content) leaked in error response body

**File:** `vigil-core/src/routes/therapy.ts:71` and `vigil-core/src/routes/therapy.ts:161`

**Issue:** Both `/therapy/classify` and `/therapy/patterns` catch JSON parse errors and return the raw AI response string in the HTTP response body:

```ts
return c.json({ error: "AI response parse error", raw }, 502)
```

The `raw` variable contains the full text output from Claude, which was constructed from the user's personal thought content passed in `userMessage`. This exposes potentially sensitive journaling content to any client-side consumer and will appear in network logs. The `/v1/insights` route correctly omits `raw` from its error response.

**Fix:** Remove `raw` from both 502 error responses in `therapy.ts`:

```ts
// therapy/classify — line 71
return c.json({ error: "AI response parse error" }, 502)

// therapy/patterns — line 161
return c.json({ error: "AI response parse error" }, 502)
```

If raw output is needed for debugging, log it server-side instead:

```ts
console.error("[therapy/classify] AI parse error. Raw:", raw)
return c.json({ error: "AI response parse error" }, 502)
```

---

## Warnings

### WR-01: Bearer header sends literal string "null" when no API key is stored

**File:** `vigil-pwa/src/api/client.ts:19`

**Issue:** `getStoredKey()` returns `null` (the JS value) when no key is in localStorage. Template literal interpolation coerces this to the string `"null"`, so every unauthenticated request is sent with `Authorization: Bearer null`. The server will reject these as unauthorized but the header is semantically wrong and could cause confusion in logs or if a future server check does a naive string match.

```ts
Authorization: `Bearer ${key}`,  // key is null → "Bearer null"
```

**Fix:** Conditionally include the header only when a key exists:

```ts
export async function vigilFetch(path: string, init?: RequestInit): Promise<Response> {
  const key = getStoredKey()
  const authHeaders: Record<string, string> = key
    ? { Authorization: `Bearer ${key}` }
    : {}
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...init?.headers,
    },
  })
}
```

---

### WR-02: `patternSection` is dead code — pattern context never reaches the prep prompt

**File:** `vigil-core/src/routes/therapy.ts:239`

**Issue:** Line 239 declares `patternSection` as an empty string constant that is concatenated into `userMessage` on line 241 but never populated:

```ts
const patternSection = "";  // line 239 — always empty

const userMessage = `...${thoughtLines}${patternSection}\n\n...`  // line 241
```

This looks like an incomplete implementation: the intent was to inject detected pattern data into the prep prompt so the AI could generate more contextually aware prep items. Currently the prep endpoint has no awareness of prior pattern analysis.

**Fix (option A — remove dead code until feature is ready):**

```ts
const userMessage = `Here are my recent thoughts marked for discussion with my therapist:\n${thoughtLines}\n\nGenerate a structured therapy session prep...`
```

**Fix (option B — wire it up):** Accept an optional `patterns` body parameter and include it in the prompt when present:

```ts
const body = await c.req.json().catch(() => ({}))
const patternSection = body.patterns?.length
  ? `\n\nDetected patterns for context:\n${JSON.stringify(body.patterns)}`
  : ""
```

---

### WR-03: `/therapy/patterns` query includes `selfLearnable` thoughts but prompt says "therapy-related thoughts"

**File:** `vigil-core/src/routes/therapy.ts:119`

**Issue:** The patterns query filters on `isNotNull(thoughtsTable.therapyClassification)` which returns ALL classified thoughts — both `selfLearnable` and `bringToTherapist`. The system prompt and user message both frame these as "therapy-related thoughts" to analyze:

```ts
// line 119
isNotNull(thoughtsTable.therapyClassification),

// line 140 — prompt tells Claude it's seeing therapy thoughts
const userMessage = `Here are my therapy-related thoughts from the last 7 days:\n...`
```

The prep endpoint correctly filters to only `bringToTherapist`. The patterns endpoint including self-learnable thoughts means Claude may surface patterns across a broader set than expected, and the framing mismatch may cause Claude to over-weight self-learnable entries in its pattern analysis.

**Fix:** Decide on intended scope and make the query match the prompt. If patterns should span all classified thoughts, update the prompt framing:

```ts
const userMessage = `Here are my classified thoughts from the last 7 days (both self-learnable and therapy-relevant):\n...`
```

Or restrict to `bringToTherapist` like the prep endpoint does:

```ts
eq(thoughtsTable.therapyClassification, "bringToTherapist"),
```

---

## Info

### IN-01: Array index used as `key` prop in rendered lists

**File:** `vigil-pwa/src/pages/InsightsPage.tsx:70`, `vigil-pwa/src/pages/TherapyPage.tsx:71`, `vigil-pwa/src/pages/TherapyPage.tsx:163`

**Issue:** All three list renderers use the array index as the React `key` prop:

```tsx
{insights.map((insight, i) => (
  <div key={i} ...>
```

For AI-generated result sets that are replaced wholesale on each generation (not updated in-place), this is low risk. However if the list ever becomes sortable or filterable client-side, React will produce incorrect diff behavior.

**Fix:** Use a derived stable key. The API returns thought IDs in `relatedThoughtIds`; alternatively, combine type/theme with index as a more stable key:

```tsx
key={`${insight.type}-${insight.title}-${i}`}
```

---

### IN-02: Shared `error` state across two independent async operations in `useTherapy`

**File:** `vigil-pwa/src/hooks/useTherapy.ts:33` and `vigil-pwa/src/hooks/useTherapy.ts:46`

**Issue:** `analyzePatterns` and `generatePrep` both write to the same `error` state slot. If patterns analysis fails, then the user triggers prep generation (which also calls `setError(null)` at the start), the patterns error is silently cleared before prep completes. Similarly, a prep error is cleared when patterns is retried.

```ts
const analyzePatterns = useCallback(async () => {
  setError(null)   // clears any prep error
  ...
}, [])

const generatePrep = useCallback(async () => {
  setError(null)   // clears any patterns error
  ...
}, [])
```

**Fix:** Split into two separate error states so each operation's failure is independently tracked:

```ts
const [patternsError, setPatternsError] = useState<string | null>(null)
const [prepError, setPrepError] = useState<string | null>(null)
```

Return both from the hook and display each error adjacent to the relevant section in `TherapyPage.tsx`.

---

_Reviewed: 2026-04-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
