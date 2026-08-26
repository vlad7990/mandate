-- 119 — INFERENCE RUNS: CACHE-WRITE CAPTURE (router slice 2 gate
-- confirmed, 0788898)
--
-- Slice 1 captured cache READS (cached_input_tokens); slice 2 turns
-- caching on for the copilot conversation, and the WRITE is the
-- proof the cache entry exists — and is billed at 1.25×, so cost
-- math later needs it too. One nullable column; no policy, grant,
-- or roster change (deny-all stands as 118 ruled it).

alter table public.inference_runs
  add column cache_creation_input_tokens integer;
