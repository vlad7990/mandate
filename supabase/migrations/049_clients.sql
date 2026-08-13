-- The client entity.
--
-- `projects.company_name` has been a text column since 001. There was no
-- clients table, no way to see the two mandates you have run for the same
-- bank as related, and no place to attach anything that belongs to the
-- client rather than to one search. `skills/page.tsx` already admitted the
-- consequence in its own copy: Client Skills are "same scope as search
-- skills today; the type tags intent."
--
-- ## The schema was already written, on the wrong row
--
-- `executive_searches` intake captures industry, business model, revenue
-- range, headcount, funding stage, ownership structure, geographic
-- footprint and regulatory environment — a complete company profile, stored
-- per search. Opening a second executive search at the same company means
-- typing all of it again. Those eight columns are lifted here verbatim
-- rather than invented afresh, so the EI intake can populate a client and a
-- client can prefill the intake.
--
-- ## What the client owns, and what the mandate keeps
--
-- Company research and client psychology become canonical on the client and
-- are reused across its mandates — today a second mandate at the same bank
-- re-runs the same research from scratch, which is the most concrete waste
-- the entity removes.
--
-- But each mandate keeps the copy it actually used. A shortlist PDF
-- exported in March must still render what it was built from; if mandates
-- read through to a live client record, that document silently changes when
-- the client is re-researched in June. This is the same reason migration 029
-- freezes calibration snapshots. `projects.company_context` and
-- `projects.client_psychology` therefore stay exactly where they are and
-- change meaning from "the only copy" to "the frozen copy".
--
-- ## What is deliberately not here
--
-- No contacts, no notes, no commercial terms. Fee percentages and payment
-- terms in particular belong with the placement and fee record (the next
-- priority item), because terms live on the client but amounts live on the
-- placement, and splitting that across two passes would make the second
-- harder rather than easier.


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clients (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  name                   text NOT NULL CHECK (length(btrim(name)) > 0),

  -- Dedupe key, maintained by Postgres rather than by the application, so
  -- two recruiters typing "RBC Capital Markets" and "rbc capital markets "
  -- cannot create two clients. Generated rather than a trigger because the
  -- rule is a pure function of the name and should not be skippable.
  name_key               text GENERATED ALWAYS AS (lower(btrim(name))) STORED,

  -- Nullable and not unique: the same group can appear under several
  -- domains, and a client that has only ever been named has no domain yet.
  domain                 text,

  -- The company profile, lifted from the executive_searches intake.
  industry               text,
  business_model         text,
  revenue_range          text,
  employee_count         text,
  funding_stage          text,
  ownership_structure    text,
  geographic_footprint   text,
  regulatory_environment text,

  -- Canonical intelligence. Mandates snapshot these; see the header.
  company_context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_psychology      jsonb,

  -- When the canonical copies were last rebuilt. Null means never — which
  -- is why they are timestamps rather than a boolean: the question a
  -- recruiter asks is "how old is this", not "is there any".
  company_context_refreshed_at   timestamptz,
  client_psychology_refreshed_at timestamptz,

  created_by             uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_org_name_key_idx
  ON public.clients (organization_id, name_key);

CREATE INDEX IF NOT EXISTS clients_organization_id_idx
  ON public.clients (organization_id);


-- ---------------------------------------------------------------------------
-- 2. The relations
-- ---------------------------------------------------------------------------
--
-- `ON DELETE SET NULL` on the two search tables: deleting a client must not
-- delete the searches run for it. `projects.company_name` stays NOT NULL and
-- becomes the label the mandate was opened under — the historical string,
-- which survives the client being renamed or removed. The UI prefers the
-- client's current name when the row is linked.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.executive_searches
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

-- A client skill is meaningless once its client is gone, so this one
-- cascades rather than orphaning a rule that would silently become org-wide.
ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS applies_to_client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;

-- Indexed because the advisor flags unindexed foreign keys, and because
-- every one of these is a join the product actually makes.
CREATE INDEX IF NOT EXISTS projects_client_id_idx ON public.projects (client_id);
CREATE INDEX IF NOT EXISTS executive_searches_client_id_idx ON public.executive_searches (client_id);
CREATE INDEX IF NOT EXISTS skills_applies_to_client_id_idx ON public.skills (applies_to_client_id);


-- ---------------------------------------------------------------------------
-- 3. Skill scope
-- ---------------------------------------------------------------------------
--
-- `applies_to_client_id` is nullable on a client skill on purpose: a client
-- skill written before this migration has no client to point at, and must
-- keep firing org-wide rather than silently stopping. Null therefore means
-- "every client", and setting it narrows the rule.

ALTER TABLE public.skills DROP CONSTRAINT IF EXISTS skills_scope_matches_type;

ALTER TABLE public.skills
  ADD CONSTRAINT skills_scope_matches_type CHECK (
       (skill_type = 'role_skill'
         AND applies_to_project_id IS NOT NULL
         AND applies_to_client_id IS NULL)
    OR (skill_type = 'client_skill'
         AND applies_to_project_id IS NULL)
    OR (skill_type = 'search_skill'
         AND applies_to_project_id IS NULL
         AND applies_to_client_id IS NULL)
  );


-- ---------------------------------------------------------------------------
-- 4. Backfill
-- ---------------------------------------------------------------------------
--
-- `projects/new/actions.ts` inserts a mandate with the placeholder
-- "Analyzing…" and lets the role-analysis agent fill the real name in
-- afterwards. Without excluding it, the first migration run would create a
-- client called "Analyzing…" and attach every half-analysed mandate in the
-- org to it. The ellipsis is matched in both its forms because the
-- placeholder is a single character U+2026 in the source but survives a
-- round trip through some editors as three dots.

INSERT INTO public.clients (organization_id, name)
SELECT DISTINCT ON (p.organization_id, lower(btrim(p.company_name)))
       p.organization_id, btrim(p.company_name)
  FROM public.projects p
 WHERE p.organization_id IS NOT NULL
   AND btrim(coalesce(p.company_name, '')) <> ''
   AND lower(btrim(p.company_name)) NOT IN ('analyzing…', 'analyzing...')
ON CONFLICT (organization_id, name_key) DO NOTHING;

INSERT INTO public.clients (organization_id, name)
SELECT DISTINCT ON (s.organization_id, lower(btrim(s.company_name)))
       s.organization_id, btrim(s.company_name)
  FROM public.executive_searches s
 WHERE btrim(coalesce(s.company_name, '')) <> ''
ON CONFLICT (organization_id, name_key) DO NOTHING;

UPDATE public.projects p
   SET client_id = c.id
  FROM public.clients c
 WHERE c.organization_id = p.organization_id
   AND c.name_key = lower(btrim(p.company_name))
   AND p.client_id IS NULL;

UPDATE public.executive_searches s
   SET client_id = c.id
  FROM public.clients c
 WHERE c.organization_id = s.organization_id
   AND c.name_key = lower(btrim(s.company_name))
   AND s.client_id IS NULL;

-- Seed the canonical intelligence from the most recently updated mandate for
-- each client. `DISTINCT ON` with a matching ORDER BY is the cheapest way to
-- take one row per group; the mandate keeps its own copy regardless.
UPDATE public.clients c
   SET company_context = src.company_context,
       company_context_refreshed_at = src.updated_at
  FROM (
    SELECT DISTINCT ON (client_id)
           client_id, company_context, updated_at
      FROM public.projects
     WHERE client_id IS NOT NULL
       AND company_context IS NOT NULL
       AND company_context <> '{}'::jsonb
     ORDER BY client_id, updated_at DESC
  ) src
 WHERE c.id = src.client_id;

UPDATE public.clients c
   SET client_psychology = src.client_psychology,
       client_psychology_refreshed_at = src.updated_at
  FROM (
    SELECT DISTINCT ON (client_id)
           client_id, client_psychology, updated_at
      FROM public.projects
     WHERE client_id IS NOT NULL
       AND client_psychology IS NOT NULL
     ORDER BY client_id, updated_at DESC
  ) src
 WHERE c.id = src.client_id;

-- `company_context` is {company_name, industry, business_model}, so two of
-- the profile columns can be filled from the research a mandate already did.
-- Without this a client created from an ordinary mandate shows an empty
-- profile while the answer sits in the jsonb beside it.
UPDATE public.clients
   SET industry       = coalesce(industry, nullif(btrim(company_context->>'industry'), '')),
       business_model = coalesce(business_model, nullif(btrim(company_context->>'business_model'), ''))
 WHERE company_context IS NOT NULL
   AND company_context <> '{}'::jsonb;

-- The company profile, from whichever executive search stated it most
-- recently. COALESCE per column rather than per row: two searches at the
-- same client may each have filled in different halves of the intake.
UPDATE public.clients c
   SET industry               = coalesce(c.industry, src.industry),
       business_model         = coalesce(c.business_model, src.business_model),
       revenue_range          = coalesce(c.revenue_range, src.revenue_range),
       employee_count         = coalesce(c.employee_count, src.employee_count),
       funding_stage          = coalesce(c.funding_stage, src.funding_stage),
       ownership_structure    = coalesce(c.ownership_structure, src.ownership_structure),
       geographic_footprint   = coalesce(c.geographic_footprint, src.geographic_footprint),
       regulatory_environment = coalesce(c.regulatory_environment, src.regulatory_environment)
  FROM (
    SELECT DISTINCT ON (client_id)
           client_id, industry, business_model, revenue_range, employee_count,
           funding_stage, ownership_structure, geographic_footprint,
           regulatory_environment
      FROM public.executive_searches
     WHERE client_id IS NOT NULL
     ORDER BY client_id, updated_at DESC
  ) src
 WHERE c.id = src.client_id;


-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
--
-- Same shape as every other domain table since 046: read for any active
-- member of the org, write at the mandate tier. Opening a client is opening
-- a search relationship, which is a recruiter act — a researcher sources
-- into mandates that already exist and does not create the client.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_role_select ON public.clients;
CREATE POLICY clients_role_select ON public.clients
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

DROP POLICY IF EXISTS clients_role_insert ON public.clients;
CREATE POLICY clients_role_insert ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS clients_role_update ON public.clients;
CREATE POLICY clients_role_update ON public.clients
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS clients_role_delete ON public.clients;
CREATE POLICY clients_role_delete ON public.clients
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));


-- ---------------------------------------------------------------------------
-- 6. Find-or-create
-- ---------------------------------------------------------------------------
--
-- The role-analysis agent resolves a company name in a background `after()`
-- callback, and two mandates opened at the same client within the same
-- second would otherwise race to insert. Doing it in one statement with
-- `ON CONFLICT` makes the unique index the arbiter rather than a read
-- followed by a write.
--
-- SECURITY INVOKER — deliberately not DEFINER. The caller's own RLS decides
-- whether they may create a client, so a viewer calling this RPC directly
-- gets nothing, exactly as if they had inserted by hand.

CREATE OR REPLACE FUNCTION public.resolve_client(
  p_organization_id uuid,
  p_name            text,
  p_created_by      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_id   uuid;
BEGIN
  IF v_name = '' OR lower(v_name) IN ('analyzing…', 'analyzing...') THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.clients (organization_id, name, created_by)
  VALUES (p_organization_id, v_name, p_created_by)
  ON CONFLICT (organization_id, name_key) DO NOTHING
  RETURNING id INTO v_id;

  -- DO NOTHING returns no row when the client already existed, which is the
  -- common path on the second mandate for a client.
  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.clients
     WHERE organization_id = p_organization_id
       AND name_key = lower(v_name);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_client(uuid, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_client(uuid, text, uuid) TO authenticated, service_role;
