-- 103 — skill version history (the §101-tabled hardening slice, on
-- the founder's word 2026-08-25): every change to a skill preserves
-- what it said before.
--
-- The Skills Studio is the one control surface that steers every
-- agent principal, and 102 gave it a trail of WHO changed WHAT and
-- WHEN. This migration adds the missing dimension — what did it say
-- BEFORE — as an append-only snapshot table fed by a trigger on the
-- skills table itself (the 098 resolver doctrine: the DATA LAYER
-- covers every write path; no app code has to remember to record a
-- version, so none can forget).
--
--   * `skill_versions` — one snapshot per skills INSERT/UPDATE,
--     versions numbered per skill. NO foreign key to skills: history
--     SURVIVES deletion of the current row (a cascading FK would
--     destroy the behavioral record the table exists to keep). The
--     org FK stays and cascades — tenant erasure erases the tenant's
--     history, which is the correct scope for it.
--   * `changed_by` is auth.uid() at write time with the actor's name
--     denormalized alongside (the 053 actor_label doctrine: the
--     label survives the person). Owner-side writes — migrations,
--     operator repairs — snapshot with a NULL actor, honestly.
--   * APPEND-ONLY: SELECT is the only policy anyone holds; the rows
--     are born by the SECURITY DEFINER trigger function. No
--     authenticated UPDATE or DELETE path exists, for anyone.
--   * BACKFILL: the five durable skills get a v1 'created' snapshot
--     (actor NULL — the migration wrote it), so the FIRST future
--     edit of an existing skill still leaves its prior text
--     reconstructable.
--
-- Run-provenance (which versions steered a given agent run) is
-- DEFERRED to the Scout era per the confirmed scope — this table is
-- the prerequisite, not the whole feature.

-- ---------------------------------------------------------------------------
-- 1. skill_versions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.skill_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Deliberately NOT a foreign key: history outlives the skill.
  skill_id               uuid NOT NULL,
  organization_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version                int NOT NULL CHECK (version >= 1),
  change_kind            text NOT NULL CHECK (change_kind IN ('created', 'updated')),
  name                   text NOT NULL,
  description            text NOT NULL,
  skill_type             text NOT NULL,
  trigger_conditions     text NOT NULL,
  instructions           text NOT NULL,
  -- Plain uuids on purpose: a deleted project or client must not
  -- rewrite what the skill's scope WAS.
  applies_to_project_id  uuid,
  applies_to_client_id   uuid,
  is_active              boolean NOT NULL,
  changed_by             uuid,
  changed_by_label       text,
  changed_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_versions_one_per_step UNIQUE (skill_id, version)
);

CREATE INDEX IF NOT EXISTS skill_versions_org_idx
  ON public.skill_versions (organization_id);
CREATE INDEX IF NOT EXISTS skill_versions_skill_idx
  ON public.skill_versions (skill_id, version DESC);

ALTER TABLE public.skill_versions ENABLE ROW LEVEL SECURITY;

-- Same read boundary as the skills themselves (can_read_org): history
-- is not a wider exposure than the current row. NO INSERT / UPDATE /
-- DELETE policies for anyone — the trigger is the only author, and
-- nothing mutates a snapshot. No agent face: an agent reads the
-- ACTIVE skill through 074's grant; the archive is not its input.
CREATE POLICY skill_versions_role_select ON public.skill_versions
  FOR SELECT TO authenticated
  USING (
    organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
  );

-- ---------------------------------------------------------------------------
-- 2. The recorder — SECURITY DEFINER (the resolver pattern), fired on
--    every skills INSERT and UPDATE. Version = last + 1 per skill.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_skill_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version int;
  v_actor   uuid := auth.uid();
  v_label   text;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.skill_versions WHERE skill_id = NEW.id;

  IF v_actor IS NOT NULL THEN
    SELECT full_name INTO v_label FROM public.users WHERE id = v_actor;
  END IF;

  INSERT INTO public.skill_versions
    (skill_id, organization_id, version, change_kind,
     name, description, skill_type, trigger_conditions, instructions,
     applies_to_project_id, applies_to_client_id, is_active,
     changed_by, changed_by_label)
  VALUES
    (NEW.id, NEW.organization_id, v_version,
     CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END,
     NEW.name, NEW.description, NEW.skill_type,
     NEW.trigger_conditions, NEW.instructions,
     NEW.applies_to_project_id, NEW.applies_to_client_id, NEW.is_active,
     v_actor, v_label);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skills_record_version ON public.skills;
CREATE TRIGGER skills_record_version
  AFTER INSERT OR UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.record_skill_version();

-- ---------------------------------------------------------------------------
-- 3. Backfill: every existing skill gets its v1, actor NULL (the
--    migration wrote it) — so the first future edit still leaves the
--    prior text reconstructable.
-- ---------------------------------------------------------------------------

INSERT INTO public.skill_versions
  (skill_id, organization_id, version, change_kind,
   name, description, skill_type, trigger_conditions, instructions,
   applies_to_project_id, applies_to_client_id, is_active,
   changed_by, changed_by_label, changed_at)
SELECT s.id, s.organization_id, 1, 'created',
       s.name, s.description, s.skill_type, s.trigger_conditions,
       s.instructions, s.applies_to_project_id, s.applies_to_client_id,
       s.is_active, NULL, NULL, s.created_at
  FROM public.skills s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.skill_versions v WHERE v.skill_id = s.id
 );
