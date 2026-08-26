# LLM ROUTER — ESCALATION PAIRS GATE — PART G / O.5 — 2026-08-26 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. Build
starts only on the founder's written word against THIS document.
The router programme proper is closed (§154); this is the
post-programme work O.5 named: the TWO escalation pairs Part G
ruled worth wiring, on DETERMINISTIC signals only — never
model-reported confidence (rejected outright in the review, not
deferred).**

---

## A. What this slice is

When a capability's model answers but the answer's SHAPE is
unusable — the deterministic signal the seams already compute and
record as `schema_failed` — the seam retries ONCE on a stronger
model, records the hop, and hands the second answer to the same
validation. Two pairs, exactly as ruled:

- **parse_cv: claude-haiku-4-5 → claude-sonnet-4-6** — DORMANT
  today (B.2) and safe to wire now: the pair fires only when the
  capability actually runs its from-model.
- **generate_evaluation: claude-sonnet-5 → claude-opus-5** — live
  from day one.

A second failure after the hop is today's honest failure,
unchanged (090: the requester records it; agent-errors' sentence).
Never a chain, never a provider switch, never a retry of anything
but the one deterministic signal.

## B. Phase 0 — verified facts the design stands on

1. **Both target seams share one shape** (`generate-evaluation.ts`
   /`parse-cv.ts`): `runInference` → try { find text block,
   JSON.parse } catch { `markInferenceSchemaFailed(response)`;
   throw }. The catch block IS the deterministic signal — the
   escalation hop slots into exactly that branch, ~6 lines per
   seam. The other four schema_failed seams
   (sourcing/relationship/target-companies/search-health) get NO
   pairs — the review ruled only these two worth wiring.
2. **parse_cv runs claude-sonnet-4-6 today** — its Haiku flip
   waits on the founder's CVs (§150 residue). Its pair is wired
   DORMANT behind the from-guard (C): if the model that actually
   ran ≠ the pair's from-model, there is no hop. When the Haiku
   flip lands, the pair goes live with no further change.
3. **No migration needed.** `inference_runs.escalated_from` (text)
   has existed since 118; `buildRunRow` hardcodes it null — the
   column widens to carry the from-model string. NOTHING else in
   the schema moves: no CHECK, no door, no grants, no principals.
4. **The registry interplay is already correct**: the from-guard
   compares against the model that ACTUALLY ran (map or founder
   override) — an override to any other model silently disarms the
   pair rather than escalating off a model the founder moved away
   from.
5. **The request travels unchanged** on the hop — same system,
   messages, schema, max_tokens (4096 / 4500). The escalated model
   is not the map's model, so by the ruled thinking rule (J.6 of
   1885da9) no thinking param rides — opus-5 and sonnet-4-6 both
   take the default.

## C. Design — the hop lives in the seam, armed by the map

**model-map.ts** gains the pairs as data beside the map, pinned by
the tripwire like everything else there:

```
ESCALATION_PAIRS: Partial<Record<Capability, { from; to }>> = {
  parse_cv:            { from: "claude-haiku-4-5", to: "claude-sonnet-4-6" },
  generate_evaluation: { from: "claude-sonnet-5",  to: "claude-opus-5" },
}
```

**inference.ts**:

- A `WeakMap` twin of `runIdByResponse` records which model
  produced each response (`runModelByResponse`), so the from-guard
  reads what actually ran, not what should have.
- New export `escalateInference(capability, request, opts,
  failedResponse)`: marks the failed response `schema_failed`
  (callers drop their explicit mark in the escalating branch);
  looks up the pair; refuses to hop unless pair exists AND the
  failed response's model === pair.from AND not `MANDATE_EVAL`
  (benchmarks measure ONE model; the fence stays law); runs the
  SAME request once on pair.to through the normal call path —
  usage captured, `escalated_from = pair.from` on the new row —
  and returns the raw second response. No pair / guard refuses →
  returns null and the caller rethrows its original error
  (today's behavior, byte-identical).
- The forced to-model is an INTERNAL mechanism of the pair map —
  it is not the eval override and cannot be reached from product
  code with an arbitrary model (Part N holds: agents, skills, and
  models still get no say).

**The two seams**: the catch block becomes — try the hop; if it
returns a response, re-run the SAME extraction on it in a nested
try whose catch marks the second response `schema_failed` and
throws (one hop, then honesty). If the hop returns null, rethrow
as today.

**Cost note**: opus-5 is $5/$25 vs sonnet-5's $3/$15 — the hop
fires only where the alternative is a FAILED generation the
recruiter retries by hand anyway; a fired hop is cheaper than the
human retry it replaces.

## D. Tests

- Tripwire extension: the pairs are pinned exactly as ruled —
  editing them without a gate is the defect it catches.
- inference.test.ts, mocked SDK: invalid-JSON first response →
  hop runs pair.to with the identical request → second row carries
  `escalated_from`; first row marked schema_failed · from-guard:
  wrong first-model (the dormant parse_cv case) → no hop, null ·
  no pair → null · `MANDATE_EVAL=1` → no hop · valid first
  response → no hop, no extra call · second failure marks and
  throws.
- Green gate: tsc · vitest (1054 + new) · eslint · build · commit
  · deploy.

## E. Drive 109 — the null result is the pass

Escalation fires on a real schema failure, which cannot be forced
deterministically in production — the mocked proofs in D are the
fire-path evidence (the 142 precedent: a null result honestly
verified is a pass). Live: regenerate the standing candidate's
evaluation (the drive-106 recipe, byte-identical restore via the
DB-side sibling-key snapshot), verify the inference_runs row runs
claude-sonnet-5 with `escalated_from` NULL and the evaluation
lands — the wiring changed nothing on the happy path. Teardown:
sweep the drive's inference_runs rows and trail events by value;
restore the evaluation exactly; pins fresh-statement. First REAL
fired hop will announce itself in inference_runs
(`escalated_from` NOT NULL) during normal use — named as residue,
not re-driven.

## F. Deliberately NOT in this slice

Pairs for the other four schema_failed seams · chains (a hop from
the hop) · provider switches · escalation on anything but the
schema signal (timeouts, 429s, refusals keep today's handling
verbatim) · model-reported confidence (rejected, standing) · a DB
successor for the pair map (registry-as-data covers ASSIGNMENTS;
pairs join it only if a later gate rules so) · any change to the
demo route or the eval fence.

## G. Decisions requiring the founder's word

1. **The two pairs as ruled** — parse_cv wired dormant behind the
   from-guard (arms itself when the Haiku flip lands);
   generate_evaluation live to opus-5. Confirm?
2. **Opus-5 as evaluation's escalation target without a dedicated
   benchmark**: the hop fires only where sonnet-5 has ALREADY
   failed the deterministic gate, and the hop's answer passes the
   same validation before acceptance — failure-path fallback, not
   a quality flip. (The registry's activation doctrine governs
   what runs FIRST; this governs what runs after a recorded
   failure.) Confirm?
3. **One hop maximum**, second failure = today's honest failure.
   Confirm?

---

Numbers at drafting (§155 DRAFTED, awaits word): next migration
123 (UNUSED this slice — no schema change) · next § 156 · next
drive 109 · vitest 1054 · CHECK 89 / door 22 / allowlist 29 /
roster 12 · durable baseline unchanged. D-ladder on the word:
map pairs + tripwire · seam hop + WeakMap twin · two seam catch
blocks · unit tests · green gate · commit · deploy · drive 109 ·
§156 DRAFTED, no completion declared · memory updated.
