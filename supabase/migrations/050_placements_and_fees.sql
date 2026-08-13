-- The placement and fee record.
--
-- Until this migration the only trace that a search ended was
-- `candidates.pipeline_stage = 'hired'`. No offer date, no salary, no fee,
-- no start date, no guarantee, no way to say a placement fell through and
-- no number anywhere in the schema — `information_schema` had not one
-- money column in it. The product could tell you who you placed and not
-- what you earned, which is the difference between a sourcing tool and a
-- recruiting one. The acceptance test for this migration is that
-- "what did we bill this quarter" is a query.
--
-- ## Five decisions, all the founder's, none derivable from the code
--
-- 1. **Both fee models.** Contingent percentage and retained-in-stages,
--    chosen per client or per mandate. That is why the fee is a ledger of
--    lines rather than a column: a contingent fee is one line, a retained
--    search is three, and a model that can only hold one of those has to
--    be migrated the first time the other is sold.
-- 2. **Terms default on the client, override on the mandate, snapshot on
--    the placement.** Same frozen-copy reasoning as `company_context` in
--    049 and the calibration snapshots in 029 — if the placement read
--    through to the live client terms, raising your rate next year would
--    silently restate last year's revenue.
-- 3. **A fallthrough is a status change plus a reversal line**, not a
--    deletion and not a status change alone. The original fee stays
--    booked in the quarter it was booked; the clawback lands in the
--    quarter it happened. A report run in March never changes in June.
-- 4. **Multi-currency, rate fixed at booking.** The rate is captured on
--    the fee when it is earned and stored beside the amount, so the base
--    -currency total is a stored fact rather than a function of today's
--    rate. Asking "what did we bill in Q1" twice returns the same number.
-- 5. **Fee data is read-segregated.** This is the first thing in the
--    product that is not covered by `org:read`. See §1.
--
-- Scope stops at "fee earned / invoiceable". There is no invoice number
-- and no payment received: that is an accounting system's book of record
-- and a second one here would drift from it.
--
-- ## Why the money is in different tables from the placement
--
-- RLS is row-level. A researcher who may see that a placement happened
-- but not what it paid cannot be expressed as a policy on a table that
-- holds both, so the split is not tidiness — it is the only way to write
-- the rule. `placements` carries the event and its dates and is readable
-- by every active role; `fee_terms`, `placement_fees` and
-- `placement_fee_lines` carry every number and are not.
--
-- Compensation is on the fee side for the same reason. A salary is money,
-- and a percentage applied to a salary is a fee — leaving the package on
-- the readable row would hand the whole revenue book to anyone who can
-- multiply.
--
-- Mirrors `src/lib/auth/roles.ts`, which gained `fees:read` in the same
-- commit. Keep them in sync; that file and migration 046 both say so.


-- ---------------------------------------------------------------------------
-- 1. The capability
-- ---------------------------------------------------------------------------
--
-- `fees:read` is a fifth capability rather than a reuse of `clients:share`,
-- which resolves to the same two roles today. They are kept apart for the
-- same reason 046 kept `mandates:write` and `clients:share` apart: "may
-- put something in front of a client" and "may see what we billed" are
-- unrelated questions that will diverge — the first agency to hire a
-- delivery consultant who presents slates but has no visibility of the
-- book will need them separate, and re-splitting a merged capability
-- means revisiting every policy below.
--
-- Writes deliberately reuse `can_write_mandates()` rather than gaining a
-- `can_write_fees()`. The role sets are identical and, unlike the read
-- side, there is no second question hiding inside the write: recording
-- what a placement paid is part of running the mandate. A separate
-- predicate here would be a name with no meaning behind it.

CREATE OR REPLACE FUNCTION public.can_read_fees()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'recruiter')
$$;

REVOKE ALL ON FUNCTION public.can_read_fees() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_read_fees() TO authenticated, service_role;

-- The own-placement half of the read rule needs `placements` to exist
-- before it can be written, because a LANGUAGE sql body is parsed at
-- creation and not at first call. It is therefore in §8 with the policies
-- that use it rather than here with the capability it belongs to.


-- ---------------------------------------------------------------------------
-- 2. Base currency
-- ---------------------------------------------------------------------------
--
-- One base currency per organisation, and every fee stores its own rate
-- back to it. Defaulting to USD because that is what the product is
-- priced in; an agency billing in GBP changes it once and every
-- subsequent placement records its own rate against the new base. Existing
-- rows are unaffected because there are none — nothing has ever recorded
-- a fee.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'USD';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_base_currency_iso;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_base_currency_iso
  CHECK (base_currency ~ '^[A-Z]{3}$');


-- ---------------------------------------------------------------------------
-- 3. The instalment plan, and validating it in the database
-- ---------------------------------------------------------------------------
--
-- A retained search bills in stages, and the stages are a template — a
-- list of {label, trigger, percent_of_fee} that the placement expands
-- into real lines with real dates. jsonb rather than a `fee_term_stages`
-- table because it is a template, always read whole, never queried across
-- and never joined; a table would be three rows and a join for something
-- that is one value.
--
-- The cost of jsonb is that nothing checks it, so this function does. It
-- is IMMUTABLE so it can sit in a CHECK constraint, which means a plan
-- that does not sum to 100% cannot be written at all — not by the app,
-- not by a hand-run UPDATE, not by a future migration. `src/lib/fees/terms.ts`
-- parses the same shape and has a test that says the two agree.

CREATE OR REPLACE FUNCTION public.fee_instalment_plan_is_valid(p_plan jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      -- An empty plan is the contingent and fixed case: one line, no stages.
      WHEN p_plan IS NULL OR jsonb_typeof(p_plan) <> 'array' THEN false
      WHEN jsonb_array_length(p_plan) = 0 THEN true
      ELSE (
        SELECT bool_and(
                 jsonb_typeof(e.value) = 'object'
                 AND coalesce(btrim(e.value->>'label'), '') <> ''
                 AND (e.value->>'trigger') IN (
                       'engagement', 'shortlist', 'offer_accepted',
                       'start_date', 'guarantee_passed')
                 AND (e.value->>'percent_of_fee') ~ '^[0-9]+(\.[0-9]+)?$'
                 AND (e.value->>'percent_of_fee')::numeric > 0
               )
          FROM jsonb_array_elements(p_plan) e
      )
      AND (
        SELECT round(sum((e.value->>'percent_of_fee')::numeric), 4) = 100
          FROM jsonb_array_elements(p_plan) e
      )
    END
$$;

REVOKE ALL ON FUNCTION public.fee_instalment_plan_is_valid(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fee_instalment_plan_is_valid(jsonb)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. Fee terms — the agreement, on the client or on the mandate
-- ---------------------------------------------------------------------------
--
-- One table with a polymorphic scope rather than `client_fee_terms` and
-- `project_fee_terms`, which would be the same eleven columns twice and
-- two RLS policies to keep in step. Exactly one of `client_id` and
-- `project_id` is set; the partial unique indexes make each scope hold at
-- most one agreement.
--
-- Resolution order is mandate, then client, then nothing — and "nothing"
-- is a legitimate state. A placement can be recorded with terms typed by
-- hand, because the first thing a recruiter does with a new product is
-- record the placement they just made, not fill in a client agreement
-- screen first.

CREATE TABLE IF NOT EXISTS public.fee_terms (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  client_id           uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id          uuid REFERENCES public.projects(id) ON DELETE CASCADE,

  fee_model           text NOT NULL
                        CHECK (fee_model IN ('contingent', 'retained', 'fixed')),

  -- Percentage of the fee basis. Held to three decimals because thirds of
  -- a retained fee are quoted as 33.333% and rounding them to whole
  -- numbers loses money on a large search.
  fee_percentage      numeric(6,3) CHECK (fee_percentage > 0 AND fee_percentage <= 100),
  fixed_fee_amount    numeric(14,2) CHECK (fixed_fee_amount >= 0),

  currency            text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),

  -- What the percentage applies to. Executive search usually quotes on
  -- total first-year cash; contingent tech recruiting usually quotes on
  -- base. Getting this wrong is a mis-billing, not a display bug, so it
  -- is stored rather than assumed.
  fee_basis           text NOT NULL DEFAULT 'total_first_year_cash'
                        CHECK (fee_basis IN ('base_salary', 'total_first_year_cash')),

  guarantee_days      integer NOT NULL DEFAULT 90 CHECK (guarantee_days >= 0),
  payment_terms_days  integer NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),

  instalment_plan     jsonb NOT NULL DEFAULT '[]'::jsonb
                        CHECK (public.fee_instalment_plan_is_valid(instalment_plan)),

  notes               text,

  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Exactly one scope. `<>` on two null tests is the shortest way to say
  -- "one and only one" and it is null-safe because IS NULL never is.
  CONSTRAINT fee_terms_one_scope CHECK ((client_id IS NULL) <> (project_id IS NULL)),

  -- Each model needs the number it is computed from. Without these a
  -- contingent agreement with no percentage saves happily and fails at
  -- the moment someone tries to bill it.
  CONSTRAINT fee_terms_model_has_amount CHECK (
    CASE fee_model
      WHEN 'contingent' THEN fee_percentage IS NOT NULL
      WHEN 'fixed'      THEN fixed_fee_amount IS NOT NULL
      WHEN 'retained'   THEN fee_percentage IS NOT NULL OR fixed_fee_amount IS NOT NULL
    END
  ),

  -- A retainer without stages is a contingent fee wearing a different
  -- name, and an unstaged plan on a non-retained model is a plan nothing
  -- will ever expand.
  -- `jsonb_typeof` first: `jsonb_array_length` raises on a non-array rather
  -- than returning false, and CHECK constraints are not evaluated in a
  -- guaranteed order, so this cannot lean on the plan validator above
  -- having already rejected it.
  CONSTRAINT fee_terms_retained_has_stages CHECK (
    jsonb_typeof(instalment_plan) = 'array'
    AND (fee_model = 'retained') = (jsonb_array_length(instalment_plan) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fee_terms_one_per_client
  ON public.fee_terms (client_id) WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fee_terms_one_per_project
  ON public.fee_terms (project_id) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fee_terms_org_idx ON public.fee_terms (organization_id);
CREATE INDEX IF NOT EXISTS fee_terms_created_by_idx ON public.fee_terms (created_by);


-- ---------------------------------------------------------------------------
-- 5. Placements — the event, readable by everyone
-- ---------------------------------------------------------------------------
--
-- One row per candidate per mandate, from the offer going out to the
-- guarantee expiring. It holds dates and names and nothing you could
-- invoice.
--
-- `status` is only ever set by a person: offered, declined, accepted,
-- started, fell_through. There is deliberately no `guarantee_passed`
-- status, because it would be a value that becomes wrong by the passage
-- of time and there is nothing scheduled anywhere in this project — no
-- cron, no `pg_cron`, no `vercel.json` — to go and correct it. Whether the
-- guarantee has cleared is derived from `guarantee_ends_on` against
-- today, which is right on every read without anything having to run.

CREATE TABLE IF NOT EXISTS public.placements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id          uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id        uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,

  -- Denormalised from the project so revenue can be grouped by client
  -- without joining through mandates, and so a placement keeps its client
  -- if the mandate is later re-pointed. Nullable because `projects.client_id`
  -- is — a mandate whose company is still "Analyzing…" has no client yet.
  client_id           uuid REFERENCES public.clients(id) ON DELETE SET NULL,

  status              text NOT NULL DEFAULT 'offered'
                        CHECK (status IN ('offered', 'declined', 'accepted',
                                          'started', 'fell_through')),

  offer_date          date NOT NULL,
  declined_date       date,
  accepted_date       date,
  start_date          date,

  guarantee_days      integer CHECK (guarantee_days >= 0),
  guarantee_ends_on   date GENERATED ALWAYS AS (start_date + guarantee_days) STORED,

  fell_through_date   date,
  fell_through_reason text,

  -- Who is credited. `owner_user_id` is the recruiter accountable for the
  -- placement; `sourced_by_user_id` is whoever found the candidate, which
  -- is often a researcher and is the whole reason the fee read rule has an
  -- exception. Both nullable and ON DELETE SET NULL: a placement outlives
  -- the employment of the person who made it, and losing the credit must
  -- not lose the revenue.
  owner_user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  sourced_by_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,

  notes               text,

  created_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- A candidate is placed on a mandate once. Re-offering after a
  -- fallthrough updates this row rather than opening a second one, so the
  -- fee ledger stays attached to the placement it belongs to.
  CONSTRAINT placements_one_per_candidate_per_mandate UNIQUE (project_id, candidate_id),

  -- Each status implies the date that got it there. Enforced because
  -- "started, start date unknown" makes every revenue query silently
  -- wrong rather than visibly incomplete — the fee has nothing to be
  -- earned on.
  CONSTRAINT placements_status_has_date CHECK (
    CASE status
      WHEN 'declined'     THEN declined_date IS NOT NULL
      WHEN 'accepted'     THEN accepted_date IS NOT NULL
      WHEN 'started'      THEN accepted_date IS NOT NULL AND start_date IS NOT NULL
      WHEN 'fell_through' THEN fell_through_date IS NOT NULL
      ELSE true
    END
  ),

  CONSTRAINT placements_dates_ordered CHECK (
    (accepted_date IS NULL OR accepted_date >= offer_date)
    AND (start_date IS NULL OR accepted_date IS NULL OR start_date >= accepted_date)
  )
);

CREATE INDEX IF NOT EXISTS placements_org_idx ON public.placements (organization_id);
CREATE INDEX IF NOT EXISTS placements_project_idx ON public.placements (project_id);
CREATE INDEX IF NOT EXISTS placements_candidate_idx ON public.placements (candidate_id);
CREATE INDEX IF NOT EXISTS placements_client_idx ON public.placements (client_id);
CREATE INDEX IF NOT EXISTS placements_owner_idx ON public.placements (owner_user_id);
CREATE INDEX IF NOT EXISTS placements_sourced_by_idx ON public.placements (sourced_by_user_id);
CREATE INDEX IF NOT EXISTS placements_created_by_idx ON public.placements (created_by);
CREATE INDEX IF NOT EXISTS placements_status_idx ON public.placements (organization_id, status);


-- ---------------------------------------------------------------------------
-- 6. The fee header — terms snapshot, package, and the rate at booking
-- ---------------------------------------------------------------------------
--
-- One row per placement, holding what the fee was computed from. Every
-- column here is a copy taken at the moment the fee was set, including
-- the ones that also exist on `fee_terms` — that is the point of it.
--
-- `fx_rate` is the rate from `currency` to `base_currency` fixed on
-- `fx_rate_fixed_on`, entered by hand. There is no FX feed and adding one
-- would be a scheduled job this project has no place to run. Storing the
-- rate rather than fetching it is also what makes a quarter's revenue
-- stop moving: `total_fee_base_amount` is generated from numbers that are
-- already frozen.

CREATE TABLE IF NOT EXISTS public.placement_fees (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  placement_id          uuid NOT NULL UNIQUE
                          REFERENCES public.placements(id) ON DELETE CASCADE,

  -- Terms snapshot.
  fee_model             text NOT NULL
                          CHECK (fee_model IN ('contingent', 'retained', 'fixed')),
  fee_percentage        numeric(6,3) CHECK (fee_percentage > 0 AND fee_percentage <= 100),
  fee_basis             text NOT NULL
                          CHECK (fee_basis IN ('base_salary', 'total_first_year_cash')),
  payment_terms_days    integer NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),

  -- Which agreement this came from, so a fee that disagrees with the
  -- client's standard terms can be explained rather than looking like a
  -- typo. 'manual' means someone typed the numbers with no agreement on
  -- file, which is a legitimate first-week state.
  terms_source          text NOT NULL DEFAULT 'manual'
                          CHECK (terms_source IN ('client', 'mandate', 'manual')),
  fee_terms_id          uuid REFERENCES public.fee_terms(id) ON DELETE SET NULL,

  -- The package, in `currency`. Split into components because the fee
  -- basis picks some of them and not others, and a single `salary` column
  -- makes "was this billed on base or on total cash" unanswerable after
  -- the fact.
  currency              text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  base_salary           numeric(14,2) CHECK (base_salary >= 0),
  guaranteed_bonus      numeric(14,2) CHECK (guaranteed_bonus >= 0),
  other_cash            numeric(14,2) CHECK (other_cash >= 0),

  -- What the percentage was actually applied to, and the result. Stored
  -- rather than generated: a negotiated fee is often not exactly
  -- percentage x basis, and a generated column would quietly overwrite
  -- the number that was agreed.
  fee_basis_amount      numeric(14,2) CHECK (fee_basis_amount >= 0),
  total_fee_amount      numeric(14,2) NOT NULL CHECK (total_fee_amount >= 0),

  -- Conversion, fixed at booking.
  base_currency         text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  fx_rate               numeric(18,8) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
  fx_rate_fixed_on      date NOT NULL DEFAULT current_date,
  total_fee_base_amount numeric(14,2)
                          GENERATED ALWAYS AS (round(total_fee_amount * fx_rate, 2)) STORED,

  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT placement_fees_percentage_when_percentage_based CHECK (
    fee_model = 'fixed' OR fee_percentage IS NOT NULL
  ),

  -- Same currency on both sides means the rate must be 1, or the same fee
  -- reports as two different numbers depending on which column you read.
  CONSTRAINT placement_fees_same_currency_rate_is_one CHECK (
    currency <> base_currency OR fx_rate = 1
  )
);

CREATE INDEX IF NOT EXISTS placement_fees_org_idx ON public.placement_fees (organization_id);
CREATE INDEX IF NOT EXISTS placement_fees_terms_idx ON public.placement_fees (fee_terms_id);
CREATE INDEX IF NOT EXISTS placement_fees_created_by_idx ON public.placement_fees (created_by);


-- ---------------------------------------------------------------------------
-- 7. The fee ledger
-- ---------------------------------------------------------------------------
--
-- Instalments and reversals in one table with a `kind` discriminator,
-- rather than a `placement_fee_instalments` table and a
-- `placement_fee_adjustments` table beside it. They are the same shape —
-- an amount, a date, a reason — and "what did we bill this quarter" is
-- then one SUM over one table rather than a sum minus a sum, which is the
-- form that goes wrong when someone forgets the second half.
--
-- Signs carry the meaning: instalments positive, reversals and write-offs
-- negative, and the CHECK constraints make it impossible to write a
-- positive clawback. Revenue in a period is
--
--   SELECT sum(base_amount) FROM placement_fee_lines
--    WHERE status = 'earned' AND earned_on >= :from AND earned_on < :to
--
-- and nothing about that query has to know the difference.
--
-- `placement_id` is here as well as on the header so the RLS policy is
-- the same predicate on both tables and neither has to join to the other
-- to decide whether the caller may read it.

CREATE TABLE IF NOT EXISTS public.placement_fee_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  placement_id      uuid NOT NULL REFERENCES public.placements(id) ON DELETE CASCADE,
  placement_fee_id  uuid NOT NULL REFERENCES public.placement_fees(id) ON DELETE CASCADE,

  kind              text NOT NULL DEFAULT 'instalment'
                      CHECK (kind IN ('instalment', 'reversal', 'write_off')),

  label             text NOT NULL CHECK (length(btrim(label)) > 0),
  sequence          integer NOT NULL DEFAULT 1,

  -- Which event makes this line earnable. Null on reversals, which are
  -- triggered by something going wrong rather than by a stage.
  trigger           text CHECK (trigger IN ('engagement', 'shortlist', 'offer_accepted',
                                            'start_date', 'guarantee_passed')),

  amount            numeric(14,2) NOT NULL,
  currency          text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  base_currency     text NOT NULL CHECK (base_currency ~ '^[A-Z]{3}$'),
  fx_rate           numeric(18,8) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
  base_amount       numeric(14,2) GENERATED ALWAYS AS (round(amount * fx_rate, 2)) STORED,

  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'earned', 'cancelled')),

  -- The date that decides the quarter. Distinct from `due_on`, which is
  -- when it is payable — an instalment earned on 28 March with net-30
  -- terms is Q1 revenue and Q2 cash, and conflating them is how a
  -- recruiting product ends up disagreeing with its own accounts.
  earned_on         date,
  due_on            date,

  reason            text,
  reverses_line_id  uuid REFERENCES public.placement_fee_lines(id) ON DELETE SET NULL,

  created_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fee_lines_sign_matches_kind CHECK (
    CASE kind
      WHEN 'instalment' THEN amount >= 0
      ELSE amount <= 0
    END
  ),

  -- Earned with no date is a line that belongs to no quarter, which is
  -- the one state that makes the acceptance query wrong.
  CONSTRAINT fee_lines_earned_has_date CHECK (status <> 'earned' OR earned_on IS NOT NULL),

  CONSTRAINT fee_lines_reversal_points_somewhere CHECK (
    kind = 'instalment' OR reverses_line_id IS NOT NULL OR reason IS NOT NULL
  ),

  CONSTRAINT fee_lines_same_currency_rate_is_one CHECK (
    currency <> base_currency OR fx_rate = 1
  )
);

CREATE INDEX IF NOT EXISTS fee_lines_org_idx ON public.placement_fee_lines (organization_id);
CREATE INDEX IF NOT EXISTS fee_lines_placement_idx ON public.placement_fee_lines (placement_id);
CREATE INDEX IF NOT EXISTS fee_lines_fee_idx ON public.placement_fee_lines (placement_fee_id);
CREATE INDEX IF NOT EXISTS fee_lines_reverses_idx ON public.placement_fee_lines (reverses_line_id);
CREATE INDEX IF NOT EXISTS fee_lines_created_by_idx ON public.placement_fee_lines (created_by);

-- The acceptance query's index: earned lines in a date window, per org.
CREATE INDEX IF NOT EXISTS fee_lines_earned_idx
  ON public.placement_fee_lines (organization_id, earned_on)
  WHERE status = 'earned';


-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
--
-- `placements` follows the shape every domain table has had since 046 —
-- read for any active member, write at the mandate tier. The three money
-- tables do not: their SELECT is `can_read_fees()` OR credited on the
-- placement, which is the first read restriction in the product.
--
-- Note what the exception deliberately does not do. It does not let a
-- credited researcher *write* a fee, and it does not extend to
-- `fee_terms`, which is the client agreement rather than one placement's
-- money and has no placement to be credited on.
--
-- SECURITY INVOKER on purpose — the helper reads `placements`, which has
-- its own RLS, so a placement the caller cannot see cannot be used to
-- unlock a fee they cannot see either. Making it DEFINER would turn a
-- helper into a hole. It does not recurse: nothing in the `placements`
-- policies reads the fee tables.
--
-- Credit is two columns rather than a `placement_credits` join table
-- because commission splits are out of scope, and a table whose only
-- purpose is to answer "is this yours" with at most two rows is a join on
-- every fee read for nothing. It becomes a table the day a fee is split.

CREATE OR REPLACE FUNCTION public.is_placement_credited(p_placement_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.placements p
     WHERE p.id = p_placement_id
       AND (SELECT auth.uid()) IN (p.owner_user_id, p.sourced_by_user_id)
  )
$$;

REVOKE ALL ON FUNCTION public.is_placement_credited(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_placement_credited(uuid) TO authenticated, service_role;

ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_fee_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_terms ENABLE ROW LEVEL SECURITY;

-- --- placements ------------------------------------------------------------

DROP POLICY IF EXISTS placements_role_select ON public.placements;
CREATE POLICY placements_role_select ON public.placements
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

DROP POLICY IF EXISTS placements_role_insert ON public.placements;
CREATE POLICY placements_role_insert ON public.placements
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS placements_role_update ON public.placements;
CREATE POLICY placements_role_update ON public.placements
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS placements_role_delete ON public.placements;
CREATE POLICY placements_role_delete ON public.placements
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));

-- --- fee_terms -------------------------------------------------------------

DROP POLICY IF EXISTS fee_terms_role_select ON public.fee_terms;
CREATE POLICY fee_terms_role_select ON public.fee_terms
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_fees()));

DROP POLICY IF EXISTS fee_terms_role_insert ON public.fee_terms;
CREATE POLICY fee_terms_role_insert ON public.fee_terms
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS fee_terms_role_update ON public.fee_terms;
CREATE POLICY fee_terms_role_update ON public.fee_terms
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS fee_terms_role_delete ON public.fee_terms;
CREATE POLICY fee_terms_role_delete ON public.fee_terms
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));

-- --- placement_fees --------------------------------------------------------

DROP POLICY IF EXISTS placement_fees_role_select ON public.placement_fees;
CREATE POLICY placement_fees_role_select ON public.placement_fees
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND ((SELECT public.can_read_fees())
              OR public.is_placement_credited(placement_id)));

DROP POLICY IF EXISTS placement_fees_role_insert ON public.placement_fees;
CREATE POLICY placement_fees_role_insert ON public.placement_fees
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS placement_fees_role_update ON public.placement_fees;
CREATE POLICY placement_fees_role_update ON public.placement_fees
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS placement_fees_role_delete ON public.placement_fees;
CREATE POLICY placement_fees_role_delete ON public.placement_fees
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));

-- --- placement_fee_lines ---------------------------------------------------

DROP POLICY IF EXISTS fee_lines_role_select ON public.placement_fee_lines;
CREATE POLICY fee_lines_role_select ON public.placement_fee_lines
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND ((SELECT public.can_read_fees())
              OR public.is_placement_credited(placement_id)));

DROP POLICY IF EXISTS fee_lines_role_insert ON public.placement_fee_lines;
CREATE POLICY fee_lines_role_insert ON public.placement_fee_lines
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS fee_lines_role_update ON public.placement_fee_lines;
CREATE POLICY fee_lines_role_update ON public.placement_fee_lines
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS fee_lines_role_delete ON public.placement_fee_lines;
CREATE POLICY fee_lines_role_delete ON public.placement_fee_lines
  FOR DELETE TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));


-- ---------------------------------------------------------------------------
-- 9. Keeping the pipeline stage and the placement in step
-- ---------------------------------------------------------------------------
--
-- `candidates.pipeline_stage` was the only record of a placement before
-- this migration and is still what every funnel, leaderboard and health
-- metric reads. Two places now know the same fact, and the failure mode
-- is a candidate sitting at 'interviewed' with a signed offer against
-- them — the funnel would under-report and the revenue screen would
-- over-report the same person.
--
-- A trigger rather than application code because the placement is written
-- from three different actions and will be written from more, and because
-- the stage must move even when the row is updated by a hand-run
-- statement during a fix.
--
-- It only ever moves the stage forwards into the placement's own
-- vocabulary and never touches 'rejected' — a candidate rejected on this
-- mandate whose placement fell through is still rejected, and resurrecting
-- them would lose the reason.

CREATE OR REPLACE FUNCTION public.sync_candidate_stage_with_placement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage text;
BEGIN
  v_stage := CASE NEW.status
    WHEN 'offered'  THEN 'offer'
    WHEN 'accepted' THEN 'offer'
    WHEN 'started'  THEN 'hired'
    ELSE NULL          -- declined and fell_through leave the stage alone
  END;

  IF v_stage IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.candidates
     SET pipeline_stage = v_stage,
         updated_at = now()
   WHERE id = NEW.candidate_id
     AND coalesce(pipeline_stage, '') <> v_stage
     AND coalesce(pipeline_stage, '') <> 'rejected'
     -- 'hired' outranks 'offer': accepting after starting must not demote.
     AND NOT (v_stage = 'offer' AND pipeline_stage = 'hired');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_candidate_stage_with_placement() FROM public, anon;

DROP TRIGGER IF EXISTS placements_sync_stage ON public.placements;
CREATE TRIGGER placements_sync_stage
  AFTER INSERT OR UPDATE OF status ON public.placements
  FOR EACH ROW EXECUTE FUNCTION public.sync_candidate_stage_with_placement();
