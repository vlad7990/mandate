-- The explicit global flag, and the two foreign keys 055 could not write.
--
-- 055 constrained 68 org/parent relationships and excluded two, because the
-- seeded catalogues encode "global" as a **NULL** `organization_id`:
--
--     executive_search_competencies.competency_id -> executive_competencies
--     executive_searches.template_id             -> executive_role_templates
--
-- A composite key over `(organization_id, competency_id)` would compare a
-- non-null child org against a null parent org and reject every row in the
-- catalogue. 055's header said the fix was to model global-ness with an
-- explicit flag rather than a null. This is that.
--
--
-- ## The hole this closes is real, and it is not a wart
--
-- Both catalogues are genuinely two-tier, and the RLS in 046 says so:
--
--     SELECT  organization_id IS NULL OR organization_id = current_user_org_id()
--     INSERT  organization_id IS NOT NULL AND = current_user_org_id() AND is_org_admin()
--
-- An org admin may write their own competencies, may never touch the global
-- ones, and reads global plus their own. So an org-private competency is a
-- real thing, and it is somebody's intellectual property.
--
-- Before this migration, org A could not *read* org B's private competency —
-- RLS returned zero rows — but could happily *attach* it to one of its own
-- searches by naming its id, because the only key on `competency_id` ignored
-- the organisation. That was verified against the live database before this
-- was written, and it is now case (5) of
-- `supabase/tests/global_catalogue_invariants.sql`.
--
-- Unlike most of what 055 fixed, this one leaks: `executive_search_competencies`
-- rows are read back with an embed on `executive_competencies(key, name)`, so
-- the borrowed competency's name renders on org A's screens.
--
--
-- ## Why one foreign key is not enough
--
-- The rule to enforce is a disjunction — *the competency is either global, or
-- owned by this row's own organisation* — and no single key expresses that.
-- It takes two, plus a generated column to pick between them.
--
-- **`is_global` on the parent**, a real column rather than a generated mirror
-- of `organization_id IS NULL`. It is what the first key references, and
-- making it declared rather than derived means an insert has to say which
-- kind of row it is: a CHECK ties the two together, so `is_global = true` with
-- an organisation, or `false` without one, are both refused. That also leaves
-- room to drop the null-org encoding later without touching these keys.
--
-- **`competency_is_global` on the child**, denormalised. The child has to
-- carry the discriminator because only the parent knows it, and a key cannot
-- consult a third table. The first key below is what keeps the copy honest.
--
-- **`competency_org_id` on the child, GENERATED** — `NULL` when the child
-- claims global, otherwise the row's own `organization_id`. Generated rather
-- than a second free column so that "this points at a global competency or at
-- one of mine, and never at anybody else's" is structurally unwriteable
-- rather than merely checked.
--
-- Then:
--
--   FK-1  (competency_id, competency_is_global)
--           -> executive_competencies (id, is_global)
--         The competency exists, and the child's claim about its tier is
--         true. On its own this is not enough: a row claiming
--         `is_global = false` passes it while pointing at *any* org's
--         private competency.
--
--   FK-2  (competency_org_id, competency_id)
--           -> executive_competencies (organization_id, id)
--         When the child claims org-owned, `competency_org_id` is its own
--         org and this proves the parent belongs to it. When the child
--         claims global, `competency_org_id` is NULL and MATCH SIMPLE skips
--         the check — which is sound only because FK-1 has already proved
--         the parent is global, and the parent's CHECK proves a global row
--         has no organisation.
--
-- The two together admit exactly the intended set and nothing else.
--
--
-- ## A property worth knowing
--
-- FK-1 references `is_global`, so a competency that searches already use
-- cannot be reclassified: promoting an org-private competency to global (or
-- demoting one) is refused while any `executive_search_competencies` row
-- points at it. That is correct — reclassifying it would silently change who
-- may see a search's competency list — but it means the migration path for
-- "publish my competency to everyone" is copy-and-repoint, not an UPDATE.


-- ---------------------------------------------------------------------------
-- 1. The flag, on both catalogues
-- ---------------------------------------------------------------------------

ALTER TABLE public.executive_competencies
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

ALTER TABLE public.executive_role_templates
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

-- Backfill from the encoding it replaces. All 24 competencies and all 8
-- templates are global today; the org-private tier is reachable but unused.
UPDATE public.executive_competencies
   SET is_global = (organization_id IS NULL)
 WHERE is_global IS DISTINCT FROM (organization_id IS NULL);

UPDATE public.executive_role_templates
   SET is_global = (organization_id IS NULL)
 WHERE is_global IS DISTINCT FROM (organization_id IS NULL);

-- The flag and the null cannot drift apart. Written as equality on purpose:
-- it refuses both "global with an owner" and "private with nobody".
ALTER TABLE public.executive_competencies
  DROP CONSTRAINT IF EXISTS executive_competencies_global_has_no_org;
ALTER TABLE public.executive_competencies
  ADD CONSTRAINT executive_competencies_global_has_no_org
  CHECK (is_global = (organization_id IS NULL));

ALTER TABLE public.executive_role_templates
  DROP CONSTRAINT IF EXISTS executive_role_templates_global_has_no_org;
ALTER TABLE public.executive_role_templates
  ADD CONSTRAINT executive_role_templates_global_has_no_org
  CHECK (is_global = (organization_id IS NULL));


-- The two referenced keys each parent now needs.
CREATE UNIQUE INDEX IF NOT EXISTS executive_competencies_id_global_idx
  ON public.executive_competencies (id, is_global);
CREATE UNIQUE INDEX IF NOT EXISTS executive_competencies_org_id_idx
  ON public.executive_competencies (organization_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS executive_role_templates_id_global_idx
  ON public.executive_role_templates (id, is_global);
CREATE UNIQUE INDEX IF NOT EXISTS executive_role_templates_org_id_idx
  ON public.executive_role_templates (organization_id, id);


-- ---------------------------------------------------------------------------
-- 2. Search competencies
-- ---------------------------------------------------------------------------

ALTER TABLE public.executive_search_competencies
  ADD COLUMN IF NOT EXISTS competency_is_global boolean NOT NULL DEFAULT false;

-- Backfill before the keys go on: every existing row points at a global
-- competency, but read it from the parent rather than assuming so.
UPDATE public.executive_search_competencies c
   SET competency_is_global = e.is_global
  FROM public.executive_competencies e
 WHERE e.id = c.competency_id
   AND c.competency_is_global IS DISTINCT FROM e.is_global;

ALTER TABLE public.executive_search_competencies
  ADD COLUMN IF NOT EXISTS competency_org_id uuid
  GENERATED ALWAYS AS (
    CASE WHEN competency_is_global THEN NULL ELSE organization_id END
  ) STORED;

ALTER TABLE public.executive_search_competencies
  ADD CONSTRAINT executive_search_competencies_competency_tier
  FOREIGN KEY (competency_id, competency_is_global)
  REFERENCES public.executive_competencies (id, is_global) ON DELETE NO ACTION;

ALTER TABLE public.executive_search_competencies
  ADD CONSTRAINT executive_search_competencies_competency_in_org
  FOREIGN KEY (competency_org_id, competency_id)
  REFERENCES public.executive_competencies (organization_id, id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS executive_search_competencies_competency_tier_idx
  ON public.executive_search_competencies (competency_id, competency_is_global);
CREATE INDEX IF NOT EXISTS executive_search_competencies_competency_org_idx
  ON public.executive_search_competencies (competency_org_id, competency_id);


-- ---------------------------------------------------------------------------
-- 3. Search templates
-- ---------------------------------------------------------------------------
--
-- Same shape. `template_id` is nullable — most searches are opened without a
-- template — and MATCH SIMPLE skips both keys when it is NULL, which is why
-- the flag can carry a meaningless `false` on those rows without harm.

ALTER TABLE public.executive_searches
  ADD COLUMN IF NOT EXISTS template_is_global boolean NOT NULL DEFAULT false;

UPDATE public.executive_searches s
   SET template_is_global = t.is_global
  FROM public.executive_role_templates t
 WHERE t.id = s.template_id
   AND s.template_is_global IS DISTINCT FROM t.is_global;

ALTER TABLE public.executive_searches
  ADD COLUMN IF NOT EXISTS template_org_id uuid
  GENERATED ALWAYS AS (
    CASE WHEN template_is_global THEN NULL ELSE organization_id END
  ) STORED;

ALTER TABLE public.executive_searches
  ADD CONSTRAINT executive_searches_template_tier
  FOREIGN KEY (template_id, template_is_global)
  REFERENCES public.executive_role_templates (id, is_global) ON DELETE NO ACTION;

ALTER TABLE public.executive_searches
  ADD CONSTRAINT executive_searches_template_in_org
  FOREIGN KEY (template_org_id, template_id)
  REFERENCES public.executive_role_templates (organization_id, id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS executive_searches_template_tier_idx
  ON public.executive_searches (template_id, template_is_global);
CREATE INDEX IF NOT EXISTS executive_searches_template_org_idx
  ON public.executive_searches (template_org_id, template_id);
