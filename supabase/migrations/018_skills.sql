-- Mandate Skills Studio: org-scoped, agent-injected behavioural plug-ins.
--
-- A skill is a recruiter-authored instruction block that the agent
-- runners splice into a system prompt at request time. Three flavours
-- live in this single table:
--   * role_skill   — applies to a single project (project_id is set)
--   * client_skill — applies to every project for the org's clients
--   * search_skill — applies to every project belonging to the org
--
-- Skills are intentionally a single table (not three) because the
-- injection layer reads them in one query, and the only behavioural
-- difference between flavours is the scope filter.
--
-- `instructions` is plain text — it's spliced verbatim into a "<skills>"
-- block appended to the agent's existing system prompt. `trigger_conditions`
-- is plain text describing when the recruiter wants the skill to fire;
-- it isn't evaluated programmatically — the model reads the description
-- and decides whether to apply, in line with the rest of the agent
-- prompts.

CREATE TABLE IF NOT EXISTS public.skills (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  name                  text NOT NULL CHECK (length(btrim(name)) > 0),
  description           text NOT NULL DEFAULT '',
  skill_type            text NOT NULL CHECK (skill_type IN ('role_skill', 'client_skill', 'search_skill')),
  trigger_conditions    text NOT NULL DEFAULT '',
  instructions          text NOT NULL CHECK (length(btrim(instructions)) > 0),
  is_active             boolean NOT NULL DEFAULT true,
  applies_to_project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- role_skill must point at exactly one project; the other flavours
  -- must NOT specify a project (they apply org-wide).
  CONSTRAINT skills_scope_matches_type CHECK (
    (skill_type = 'role_skill' AND applies_to_project_id IS NOT NULL)
    OR (skill_type <> 'role_skill' AND applies_to_project_id IS NULL)
  )
);

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_skills_only ON public.skills;
CREATE POLICY org_skills_only ON public.skills
  FOR ALL TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = public.current_user_org_id()
  );

-- Hot path: load active skills for an org by type. The injector hits
-- this once per agent invocation, so the index keeps the call cheap.
CREATE INDEX IF NOT EXISTS skills_org_type_active_idx
  ON public.skills (organization_id, skill_type, is_active);

-- Secondary lookup for project-scoped skills.
CREATE INDEX IF NOT EXISTS skills_project_idx
  ON public.skills (applies_to_project_id)
  WHERE applies_to_project_id IS NOT NULL;

-- updated_at is maintained by the application layer (every other table
-- in this schema follows the same convention — see job_specs / candidates).

-- ───────────────────────────────────────────────────────────────────────
-- Seed: five default skills for the Mandate HQ org.
--
-- Idempotent: each insert is gated on a NOT EXISTS check against
-- (organization_id, name) so re-running the migration is safe. We pick
-- the first user in the org as created_by; if no users exist yet (fresh
-- env) the seed simply skips.
-- ───────────────────────────────────────────────────────────────────────

DO $seed$
DECLARE
  hq_org_id  uuid;
  hq_user_id uuid;
BEGIN
  SELECT id INTO hq_org_id
  FROM public.organizations
  WHERE slug = 'mandate-hq'
  LIMIT 1;

  IF hq_org_id IS NULL THEN
    RAISE NOTICE 'Seeding skills: mandate-hq organisation not found, skipping.';
    RETURN;
  END IF;

  SELECT id INTO hq_user_id
  FROM public.users
  WHERE organization_id = hq_org_id
    AND status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  -- 1. Capital Markets Evaluation
  IF NOT EXISTS (
    SELECT 1 FROM public.skills
    WHERE organization_id = hq_org_id AND name = 'Capital Markets Evaluation'
  ) THEN
    INSERT INTO public.skills (
      organization_id, created_by, name, description, skill_type,
      trigger_conditions, instructions
    ) VALUES (
      hq_org_id, hq_user_id,
      'Capital Markets Evaluation',
      'Sharper evaluation lens for investment-banking, sell-side, and capital-markets roles.',
      'search_skill',
      'Apply when the role context references investment banking, capital markets, sell-side, equities, fixed income, prime services, FICC, or post-trade.',
      'Push the evaluation beyond generic finance experience. Ask:
- Which asset class does the candidate own (equities / FICC / FX / rates / credit / commodities)?
- Front office vs middle / back office — quote concrete trading desks, products, or P&L sizes when stating depth.
- Have they shipped through a market crisis (LIBOR transition, COVID volatility, gilt crisis, SVB)?
- Distinguish bulge-bracket scope from boutique scope explicitly in the executive summary.
Where the CV is silent on asset class, flag the gap rather than assuming generalist coverage.'
    );
  END IF;

  -- 2. Post-Trade Systems Check
  IF NOT EXISTS (
    SELECT 1 FROM public.skills
    WHERE organization_id = hq_org_id AND name = 'Post-Trade Systems Check'
  ) THEN
    INSERT INTO public.skills (
      organization_id, created_by, name, description, skill_type,
      trigger_conditions, instructions
    ) VALUES (
      hq_org_id, hq_user_id,
      'Post-Trade Systems Check',
      'Verifies hands-on ownership of post-trade platforms (clearing, settlement, reconciliation, custody).',
      'search_skill',
      'Apply when the role mentions post-trade, clearing, settlement, custody, T+1, recon, corporate actions, or middle office.',
      'For any candidate claiming post-trade leadership, the evaluation must distinguish:
- Platform OWNERSHIP (owned the roadmap / P&L / vendor relationship) vs platform USE (consumer of someone else''s system).
- Specific systems by name when the CV provides them — e.g. Murex, Calypso, OpenLink, FIS GMI, BNY Mellon Eagle, Broadridge.
- T+1 readiness work, recon platform consolidations, and any history with CCP / clearing-house integrations are concrete differentiators — quote them when present.
If ownership cannot be substantiated, downgrade the relevant fit dimension and call out the gap explicitly.'
    );
  END IF;

  -- 3. Scale Leadership Threshold
  IF NOT EXISTS (
    SELECT 1 FROM public.skills
    WHERE organization_id = hq_org_id AND name = 'Scale Leadership Threshold'
  ) THEN
    INSERT INTO public.skills (
      organization_id, created_by, name, description, skill_type,
      trigger_conditions, instructions
    ) VALUES (
      hq_org_id, hq_user_id,
      'Scale Leadership Threshold',
      'Enforces a minimum bar for team and budget scope on senior leadership roles.',
      'search_skill',
      'Apply on any role with a leadership weight ≥ 7/10 or where the calibration model lists director / head-of / CXO seniority.',
      'For senior leadership roles, the candidate review and evaluation must explicitly state:
- Direct headcount (managers reporting in) vs total headcount.
- Budget owned (capex, opex, or run-the-bank).
- Multi-region / multi-LOB span when applicable.
If any of those numbers are missing from the CV, do not infer them — flag the gap.
A candidate without managers-of-managers experience cannot score above 6/10 on the leadership dimension for a head-of role; the narrative must state this explicitly when the gap exists.'
    );
  END IF;

  -- 4. Regulatory Exposure Validator
  IF NOT EXISTS (
    SELECT 1 FROM public.skills
    WHERE organization_id = hq_org_id AND name = 'Regulatory Exposure Validator'
  ) THEN
    INSERT INTO public.skills (
      organization_id, created_by, name, description, skill_type,
      trigger_conditions, instructions
    ) VALUES (
      hq_org_id, hq_user_id,
      'Regulatory Exposure Validator',
      'Cross-checks claimed regulatory experience against named regulators, frameworks, and audit findings.',
      'search_skill',
      'Apply when the regulatory dimension weight is ≥ 6/10 or the company context lists Banking, Insurance, Healthcare, or Public Sector.',
      'When evaluating regulatory exposure, require named evidence:
- UK: FCA / PRA — SMCR, Consumer Duty, Operational Resilience, Basel III/IV submissions.
- US: SEC / FINRA / OCC — Reg SCI, CAT, Reg BI, Dodd-Frank.
- EU: ESMA / EBA / ECB — MiFID II, EMIR, DORA.
A candidate who only references "compliance experience" without naming a regulator or framework cannot score above 5/10 on the regulatory dimension. Quote the specific regime when scoring 7+. Flag any history of personal accountability (SMF / SCF designations) or regulator-led remediation as a differentiator.'
    );
  END IF;

  -- 5. Transformation Evidence Required
  IF NOT EXISTS (
    SELECT 1 FROM public.skills
    WHERE organization_id = hq_org_id AND name = 'Transformation Evidence Required'
  ) THEN
    INSERT INTO public.skills (
      organization_id, created_by, name, description, skill_type,
      trigger_conditions, instructions
    ) VALUES (
      hq_org_id, hq_user_id,
      'Transformation Evidence Required',
      'Demands concrete change-leadership artefacts before scoring transformation highly.',
      'search_skill',
      'Apply when the transformation dimension weight is ≥ 6/10, or when role_origin is "expansion" or the role is described as turnaround / modernisation / post-merger.',
      'Transformation cannot be scored from generic phrases ("led change", "drove modernisation"). Require at least one of:
- Named programme with budget, duration, and outcome (e.g. "$120M, 24-month core banking re-platforming, decommissioned 7 legacy systems").
- Post-merger integration with the two named entities and headcount reconciled.
- Cost-take-out or run-rate savings with an audited number.
- Cloud / SaaS migration with the source and target platforms named.
Without one of those artefacts, transformation cannot exceed 5/10 and the gap must be called out in the executive summary. The recruiter''s positioning notes should anticipate the hiring-manager objection on this dimension.'
    );
  END IF;
END
$seed$;
