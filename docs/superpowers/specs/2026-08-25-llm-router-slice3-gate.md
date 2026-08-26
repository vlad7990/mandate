# LLM ROUTER — SLICE 3 GATE — EVALS + TIER FLIPS — 2026-08-25 — DRAFT

**Status: Phase-0-verified gate DRAFT. Nothing is built. Build
starts only on the founder's written word against THIS document.
Slices 1–2 are closed law (§147, §149); slice 4 (Part R + providers)
gates after. This slice carries TWO word-points: the build word
(harness + benchmarks run) and, later, the FLIP word against a
drafted results table — no production model changes on the first
word alone.**

---

## A. What this slice is

Q3's authorization comes due: benchmark **Sonnet 5** (current
generation; intro $2/$10 through 2026-08-31, then $3/$15 — same
list as 4.6) as the Standard-tier default upgrade, and **Haiku 4.5**
($1/$5 — 3× cheaper) on the five Economy capabilities. Flips happen
ONLY where evals pass, only on the founder's second word, one map
edit at a time. Alongside, two debts from earlier slices land here
by their recorded dispositions: `schema_failed` wiring (§146) and
re-judging the eight deferred caching candidates (§148).

## B. Phase 0 — verified facts the design stands on

1. **max_tokens is tight on three seams**: analyze-role 1024,
   derive-calibration 1024, generate-sourcing's regenerate 1024.
   Sonnet 5's tokenizer produces ~30% more tokens for the same
   text AND adaptive thinking is ON by default with thinking
   counted inside max_tokens — these three are truncation canaries.
   The harness must treat `stop_reason: "max_tokens"` as a FAILURE
   signal, and Sonnet 5 runs benchmark in two variants: thinking
   disabled (like-for-like with today) and adaptive (the model's
   native default).
2. **Haiku 4.5 is shape-compatible**: structured outputs supported,
   200K context / 64K output covers every economy seam (largest
   request 4096), no adaptive thinking (omitting `thinking` = none,
   which is exactly today's behavior).
3. **All five economy seams** (parse_cv, generate_sourcing,
   run_target_companies, run_search_health, run_relationship) carry
   `output_config` schemas — the deterministic grader exists for
   free.
4. **Fixture material splits two ways.** Repo-derivable: the two
   live mandates' calibration/company/onboarding JSON, the one
   structured candidate, the job spec — enough for
   generate_sourcing, run_target_companies, run_search_health,
   run_relationship, analyze_role, generate_evaluation.
   **Founder-only: real CV files (PDF/DOCX) for parse_cv** — the
   §128 material. parse_cv's Haiku benchmark WAITS on those files;
   it is surfaced once here, not nagged.
5. **Web seams are excluded** from this slice's benchmarks entirely
   (Part G: web+structured+long output is the fragile combination,
   never moved first — and benchmark searches would spend live
   web-search fees and reach real sites). Copilot stays Standard,
   no flip. The demo door stays out of scope (Q6).
6. **Conventions**: offline scripts live in `scripts/` (.mjs);
   vitest resolves the TS aliases. The harness therefore runs as an
   env-gated vitest invocation (below) — Part I's "not in the
   suite" honored by exclusion, not by rebuilding module
   resolution.
7. **Cost of the full benchmark matrix ≈ $2–4** (~105 calls: 5
   economy caps × ~5 fixtures × 3 models, + 3 standard
   representatives × ~5 × 2 variants). Stated so nobody has to
   wonder; eval telemetry rows do NOT land in prod inference_runs
   (the local runner has no service key — the seam's telemetry
   no-ops honestly, and results go to a file).

## C. Deliverable 1 — the eval harness (Part I's smallest shape)

- **`evals/` directory**, excluded from the default vitest run:
  `*.eval.ts` files run only via `npm run eval` (a separate vitest
  invocation gated on `MANDATE_EVAL=1` + a live `ANTHROPIC_API_KEY`
  — absent either, every eval skips with an honest message; `npm
  test` never spends a cent).
- **`evals/fixtures/`**: sanitized JSON exported from the two live
  mandates (a small script writes them once; no live DB reads
  during eval runs), plus a `fixtures/cvs/` drop-point for the
  founder's CV files (gitignored — candidate documents never enter
  the repo).
- **Model override, fenced**: `runInference` gains
  `opts.modelOverride`, honored ONLY when `MANDATE_EVAL=1`; in its
  absence a passed override THROWS. Agents and product code can
  never choose a model (Part N holds); the override exists for the
  harness alone, and the telemetry row records the overridden model
  when it does run.
- **Two graders per capability** (Part I): (a) deterministic —
  schema parse + the seam's own normalize + per-capability
  assertions (required fields present, counts sane,
  `stop_reason !== "max_tokens"`); (b) rubric — a stronger-model
  pass (Sonnet 4.6 as judge this slice) scoring instruction
  adherence/omissions 1–5 with a one-line reason. Founder spot
  checks stay human.
- **Output**: one results table per (capability × model ×
  thinking-variant): pass rate, deterministic failures by kind,
  rubric mean, input/output tokens, latency, est. cost — written to
  `evals/results/<date>.md`, and its summary DRAFTED into the
  ledger as the flip decision's evidence.

## D. Deliverable 2 — schema_failed wiring (§146's debt)

The five economy seams + generate-evaluation get the one honest
change slice 1 couldn't make mechanically: the parse/normalize step
moves into its OWN try — `catch { markInferenceSchemaFailed(response);
throw; }` — inside the existing outer handling, which stays
byte-identical in behavior (same errors, same 090 bookkeeping).
From then on, prod telemetry distinguishes "the model returned
unusable shape" from "the provider failed" — the exact signal both
the flip decision and Part G's later escalation pairs need.

## E. Deliverable 3 — benchmarks, results, and the SECOND word

1. Run the matrix offline: economy five on {sonnet-4-6, sonnet-5
   (×2 variants), haiku-4-5}; standard representatives
   (analyze_role, generate_evaluation, generate_job_spec) on
   {sonnet-4-6, sonnet-5 ×2}. parse_cv runs only if CV files are
   present.
2. **Results table DRAFTED as a §** with a per-capability
   recommendation (flip / hold / raise max_tokens first) — and the
   re-judgment of the eight deferred caching candidates using the
   harness's own repeat-run measurements (does any tools+system
   prefix actually cross 1024 tokens; do eval repeats prove reads).
3. **On the founder's word against the results table**: apply
   exactly the ruled flips in model-map.ts, update the all-sonnet
   tripwire test to pin the NEW ruled mapping (the tripwire's
   purpose is "no flips without a gate", not "sonnet forever"),
   green gate, deploy, **drive 106**: run one flipped capability
   live, verify the row carries the new model with honest
   tokens/outcome and product behavior intact; teardown by value
   (all traps incl. localStorage). §150 DRAFTED.

NOT in this slice: web-seam or copilot flips, escalation pairs
(they come only when this slice's data exists — O.5), providers,
batch, org policy, prices in code, any change to the demo door.

## F. D-ladder on the FIRST word

1. Harness + fixtures export + override fence + `npm run eval`
   wiring.
2. schema_failed wiring (six seams) + unit tests (override fence
   throws without MANDATE_EVAL; parse-failure branch marks; outer
   behavior unchanged).
3. Green gate (tsc / eslint / vitest 1018+new / build) — commit —
   deploy (schema_failed wiring ships; the harness is inert in
   prod).
4. Run the benchmark matrix locally; results table + caching
   re-judgment DRAFTED (the § IS the deliverable of the first
   word). parse_cv row waits on founder CVs — surfaced once.
5. The SECOND word rules the flips; then E.3 runs (flips → tripwire
   update → deploy → drive 106 → §150).

## G. Numbers at gate drafting (fresh, 2026-08-25)

Next migration 120 (none expected this slice — no schema change) ·
next § 150 · next drive 106 · vitest 1018 · CHECK 87 · door 20 ·
allowlist 29 (ruled) · anon roster 12 named grants (ruled) ·
durable baseline unchanged incl. inference_runs 0 · Sonnet 5 intro
pricing window closes 2026-08-31.

**Awaiting the founder's written word against this document.**
