-- Make the fee_terms scope indexes usable by ON CONFLICT.
--
-- 050 created them partial:
--
--   CREATE UNIQUE INDEX fee_terms_one_per_client
--     ON public.fee_terms (client_id) WHERE client_id IS NOT NULL;
--
-- which enforces the right rule and cannot be used as an arbiter. Postgres
-- will only pick a partial index for `ON CONFLICT (client_id)` when the
-- statement carries a predicate implying the index's own, and PostgREST's
-- upsert has no way to express one. Saving a client's agreement therefore
-- failed with "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" — a message that reads like a missing index
-- rather than an unusable one. Found by saving an agreement in a browser;
-- nothing in the type system or the test suite could have caught it.
--
-- The predicate was never doing any work. A plain unique index already
-- allows any number of NULLs, because Postgres treats NULLs as distinct in
-- a unique index by default — which is exactly the rule wanted here, since
-- `client_id` is NULL on every mandate-scoped row and those must not
-- collide with each other. So dropping the WHERE clause changes nothing
-- about what can be stored and makes the index an arbiter.
--
-- `fee_terms_one_scope` still guarantees exactly one of the two is set, so
-- a row can only ever be claimed by one of these indexes.

DROP INDEX IF EXISTS public.fee_terms_one_per_client;
DROP INDEX IF EXISTS public.fee_terms_one_per_project;

CREATE UNIQUE INDEX IF NOT EXISTS fee_terms_one_per_client
  ON public.fee_terms (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS fee_terms_one_per_project
  ON public.fee_terms (project_id);
