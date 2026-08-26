# LLM ROUTER — SLICE 2 GATE — PROMPT CACHING — 2026-08-25 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. Build starts
only on the founder's written word against THIS document. Slice 1
(the seam) is closed law (§147); slices 3 (evals + tier flips) and 4
(Part R + providers) gate separately (R4).**

---

## A. Phase 0 — the measurement that rewrites Part J

Part J of the review named nine caching candidates: copilot, the
five web/research seams, and the three evaluation/interview
composers, with the breakpoint "at the END of the base prompt,
BEFORE skills injection." Phase 0 measured the actual prompts
(2026-08-25, live repo) and the plan does not survive contact:

1. **Every candidate base prompt is UNDER Sonnet 4.6's 1024-token
   minimum cacheable prefix.** Estimated (chars/4): copilot 513 ·
   evaluation 831 · company-intelligence 991 (the largest) ·
   candidate-research 618 · hm-research 680 · exec-context 545 ·
   sourcing-search 585 · interview-plan 629 · client-interview 532.
   A breakpoint at the ruled base/skills boundary would **silently
   never cache** — no error, `cache_creation_input_tokens: 0`,
   pure dead code.
2. **The eight non-copilot candidates are single-shot per run.**
   The 5-minute ephemeral TTL means a cache entry pays only when an
   identical-prefix call repeats within 5 minutes. Research re-runs
   are days apart (the UI shows "researched 116d ago"); evaluations
   per candidate differ in the user turn but share only the
   sub-minimum system prefix. Even where a write happened, reads
   would not follow — a 1.25× write premium with no payback.
3. **Copilot is the one genuine win, and it is bigger than Part J
   guessed.** The panel re-sends the full conversation every turn —
   system + skills + the project snapshot (front-loaded in the first
   user message) + all prior turns. Drive 104 measured **7,869 input
   tokens on a single turn** — seven times the minimum. A breakpoint
   at the end of the last user message caches the whole growing
   prefix: turn N reads what turn N−1 wrote, at 0.1×.
4. **The snapshot is byte-stable except one query.** No timestamps
   or volatile fields are injected; but the `candidates` snapshot
   query carries no ORDER BY (copilot-context.ts:68) — an unordered
   array is a silent cache invalidator. Scores, feedback, and
   shortlist queries are already ordered.
5. **Slice 1's capture is one column short for verification.**
   `inference_runs` records cache READS (`cached_input_tokens`) but
   not cache WRITES — and writes are the proof the entry exists,
   and are billed at 1.25×.

**Ruling this gate records: slice 2 caches the copilot conversation
and nothing else.** The eight measured-out candidates are DEFERRED
with their numbers, to be revisited at slice 3 — the eval harness
creates exactly the repeated identical runs that would make their
caching pay, and slice 3 may also grow base prompts past the
minimum. Nothing about the review's mechanism is discarded; its
target list is corrected by measurement.

## B. Deliverable 1 — migration 119

```sql
alter table public.inference_runs
  add column cache_creation_input_tokens integer;
```

No new table, no policy change, no grant change — the roster stays
TWELVE, CHECK stays 87, door stays 20, allowlist stays 29. The
seam starts recording `usage.cache_creation_input_tokens` (response
usage on the non-streaming path; `message_start` on the stream).

## C. Deliverable 2 — seam-owned conversation caching

Per Part J's own rule, caching lives in the seam, driven by a
per-capability flag — no prompt builder learns about caching:

- **`model-map.ts`** gains
  `CACHED_CONVERSATION_CAPABILITIES: ReadonlySet<Capability>` —
  containing exactly `copilot` this slice.
- **`inference.ts`**: when the capability is flagged, the seam
  stamps `cache_control: {type: "ephemeral"}` on the LAST content
  block of the LAST user message before sending — converting a
  string `content` to its equivalent single text block
  (wire-identical otherwise). Applied in both `runInference` and
  `runInferenceStream`; a pure exported helper
  (`stampConversationCache(messages)`) so the logic is unit-tested
  without the SDK. Requests for unflagged capabilities are
  byte-identical to today.
- **Cache economics, stated honestly:** a one-turn conversation
  pays the 1.25× write premium for nothing (~$0.006 at drive-104
  size — accepted); every conversation of ≥2 turns within the TTL
  reads its whole prefix at 0.1×. Turn gaps over 5 minutes re-write
  once. No 1h TTL — the 2× write cost needs ≥3 reads to break even
  and copilot conversations are short.
- **Snapshot byte-stability:** pin the candidates snapshot query
  with `.order("id")` (copilot-context.ts) — deterministic bytes,
  zero behavior change. The JSON key order is already code-fixed.

NOT in this slice: caching any other capability, base-prompt
breakpoints, 1h TTLs, cache prewarming, any model change, any
prompt-text change, cost math.

## D. Deliverable 3 — tests

- `stampConversationCache`: stamps the last user message's last
  block; converts string content to a text block; leaves earlier
  messages untouched; no-ops on an empty/assistant-tailed list.
- Seam: flagged capability sends stamped messages; unflagged sends
  the caller's messages byte-identically.
- `buildRunRow`: maps `cache_creation_input_tokens`, null when
  absent.
- The existing all-sonnet tripwire and 1010-test suite stay green.

## E. D-ladder on the founder's word

1. Migration 119 (file + MCP apply).
2. Map flag + seam stamping + snapshot ORDER BY pin.
3. Tests → green gate (tsc / eslint / vitest 1010+new / build).
4. Commit → deploy (`vercel --prod --yes`).
5. **Drive 105**, scratch principal (all §-recorded traps carried,
   incl. §146's new one — direct SQL member promotion fires the
   member-audit trigger): a TWO-TURN Mandy conversation on a real
   mandate. Verify in `inference_runs`: turn 1 carries
   `cache_creation_input_tokens > 0`; turn 2 carries
   `cached_input_tokens > 0` at roughly turn 1's prefix size; the
   answers stream normally. Teardown by value; fresh-statement
   baseline exact; sweep the drive's rows.
6. §148 DRAFTED, no completion declared.
7. Memory updated.

## F. Numbers at gate drafting (fresh, 2026-08-25)

Next migration 119 · next § 148 · next drive 105 · vitest 1010 ·
activity CHECK 87 · intent door 20 · allowlist 29 (ruled) · anon
roster 12 named grants (ruled) · durable baseline unchanged incl.
inference_runs 0 · slice-2 scope = ONE capability flagged, ONE
column added, ONE ORDER BY pinned.

**Awaiting the founder's written word against this document.**
