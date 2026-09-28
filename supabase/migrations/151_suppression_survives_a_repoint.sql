-- §207 SLICE ONE — SUPPRESSION SURVIVES A REPOINT
--
-- Gate: docs/superpowers/specs/2026-09-28-erasure-key-retroactivity-gate.md
-- (five rulings, all recommendations taken, D5 split into two decline
-- outcomes, built DNC-first). This is D3, and only D3: the erasure rule
-- itself — the person/key/records union, the merge repoint, the two
-- doors, the split decline — is slice two.
--
-- ## The defect, measured before any code (2026-09-28, scratch row since
-- ## removed)
--
--   row created, person suppressed   profile fc9835a3…  dnc = TRUE
--   recruiter adds an email          profile 9201646e…  dnc = FALSE
--
-- `candidates_link_network_profile` re-resolves the person on every edit
-- of email / linkedin_url / full_name / current_company. When the identity
-- key changes and no alias claims the new one, `resolve_network_profile`
-- MINTS A NEW PERSON and the row is repointed to it. The suppression stays
-- behind on a profile that now has no rows. **Adding somebody's email
-- un-suppresses them.**
--
-- This is not a Network-page cosmetic. `send-candidate-message` reads
-- do-not-contact from the profile the row points at, so the row that moved
-- is contactable again — and since 098 an erasure request SETS DNC on the
-- person ('erasure requested via their portal'), the protection this drops
-- is the one standing between a person who asked to be forgotten and the
-- next outreach email.
--
-- ## The rule
--
-- §203 D2 is already law for the merge: *suppression is contagious, and a
-- merge can never lower it.* The same sentence, applied to the other way a
-- row changes person: **when a repoint moves a row from one person to
-- another, the suppression comes with it, and the destination's own
-- suppression is never lowered.** Monotone — it only ever spreads. The old
-- person keeps theirs, because their other records still belong to them.
--
-- Over-suppressing is the safe failure here. The alternative failure is
-- emailing somebody who asked you not to.
--
-- ## What this deliberately does NOT do
--
-- It does not stop the repoint. Keeping the row with its person and
-- minting an alias for the new key is the purer end state (§204: only a
-- merge moves `network_profile_id`) and was named OUT by the gate as its
-- own, bigger slice: it changes what the Network page shows and inherits
-- the un-merge gap. This makes the split HARMLESS to suppression, not
-- impossible.
--
-- No new table, no new event type (the CHECK is untouched — a carry is a
-- `network_dnc_set` with a new `source`, beside 'recruiter', 'withdrawal'
-- and 'erasure'), no new grant, no policy change. The anon roster is
-- untouched.

-- ---------------------------------------------------------------------------
-- 1. The carry, as its own named act
-- ---------------------------------------------------------------------------
--
-- A function rather than ten lines inside the trigger, because the trigger
-- is the hottest path in the product and because slice two calls this same
-- rule. It returns whether it carried, so the caller can say so.

CREATE OR REPLACE FUNCTION public.carry_network_suppression(
  p_from uuid,
  p_to   uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from public.network_profiles%ROWTYPE;
  v_to   public.network_profiles%ROWTYPE;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RETURN false;
  END IF;

  SELECT * INTO v_from FROM public.network_profiles WHERE id = p_from;
  IF NOT FOUND OR NOT v_from.dnc THEN
    RETURN false;                         -- nothing to carry
  END IF;

  SELECT * INTO v_to FROM public.network_profiles WHERE id = p_to;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Never across organisations. §073 D11: the same human in another org is
  -- a different relationship, and one org's suppression is not another's
  -- fact to hold.
  IF v_to.organization_id IS DISTINCT FROM v_from.organization_id THEN
    RETURN false;
  END IF;

  -- Never lowered, and never restamped. If the destination is already
  -- suppressed, the EARLIER of the two is the first time they said it —
  -- the merge's rule (143), because it is the same question.
  IF v_to.dnc
     AND NOT (v_from.dnc_set_at IS NOT NULL
              AND (v_to.dnc_set_at IS NULL OR v_from.dnc_set_at < v_to.dnc_set_at)) THEN
    RETURN false;
  END IF;

  -- The guard's own door, the way set_network_dnc and the merge open it.
  -- Set unconditionally: the state may be entering 'do_not_contact' even
  -- when the dnc quadruple is unchanged, and guard_network_dnc refuses
  -- that too.
  PERFORM set_config('mandate.allow_dnc_write', 'on', true);

  -- The ORIGINAL reason, when and who — not a fresh stamp. A suppression
  -- that arrives wearing today's date and nobody's name has lost the only
  -- two facts that make it answerable.
  UPDATE public.network_profiles
     SET dnc                = true,
         dnc_reason         = v_from.dnc_reason,
         dnc_set_at         = v_from.dnc_set_at,
         dnc_set_by         = v_from.dnc_set_by,
         relationship_state = 'do_not_contact',
         updated_at         = now()
   WHERE id = p_to;

  -- The trail, because nobody clicked anything. `write_activity_event`
  -- swallows its own failures by design (053), so the trail can never
  -- break a candidate write.
  PERFORM public.write_activity_event(
    p_organization_id => v_to.organization_id,
    p_event_type      => 'network_dnc_set',
    p_visibility      => 'org',
    p_detail          => jsonb_build_object(
                           'person',       v_to.display_name,
                           'reason',       v_from.dnc_reason,
                           'source',       'identity_edit',
                           'carried_from', v_from.display_name));

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.carry_network_suppression(uuid, uuid) IS
  '§207 slice 1 — carries do-not-contact from one person to another when a candidate row is repointed between them by an identity edit. Contagious and never lowered (§203 D2''s rule, same question): the earlier suppression wins, the ORIGINAL reason/when/who travel, the source keeps theirs. Org-scoped. Writes through guard_network_dnc''s own door.';

-- Internal: called only from the definer trigger below (and, from slice
-- two, from the erasure seam). Nobody calls this from a session.
REVOKE ALL ON FUNCTION public.carry_network_suppression(uuid, uuid)
  FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The trigger learns to carry
-- ---------------------------------------------------------------------------
--
-- THE RISKIEST EDIT IN THIS SLICE, named the way 143 named its own: this
-- function runs on every candidate insert and every identity edit, under
-- every principal that writes a candidate — recruiter, CV parser, the
-- sourcing importer, and the portal's own anon RPCs. So the change is
-- strictly ADDITIVE and lands at the END: every branch above is the
-- 135/139 function verbatim, byte for byte, and a row whose person does
-- not change takes exactly the path it took before.

CREATE OR REPLACE FUNCTION public.candidates_link_network_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- The declared identity holds its link. `source = 'apply'` is the one
  -- row-creation path where the subject typed their own details and was
  -- shown the Art.13 notice against them; nothing derived from the file
  -- afterwards may move that link to a different person.
  IF TG_OP = 'UPDATE'
     AND NEW.source = 'apply'
     AND OLD.network_profile_id IS NOT NULL THEN
    NEW.network_profile_id := OLD.network_profile_id;
    RETURN NEW;
  END IF;

  -- §196/139 — we have not read the document yet, and a name is the
  -- only thing we have. That is not an identity, it is a filename.
  -- Mint nothing; the parser's own UPDATE fires this trigger again with
  -- something real and the fill-if-null path below keys the person once.
  IF coalesce(NEW.cv_processing, false)
     AND nullif(btrim(coalesce(NEW.email, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.linkedin_url, '')), '') IS NULL
     AND nullif(btrim(coalesce(NEW.current_company, '')), '') IS NULL THEN
    NEW.network_profile_id := CASE
      WHEN TG_OP = 'UPDATE' THEN OLD.network_profile_id
      ELSE NULL
    END;
    RETURN NEW;
  END IF;

  -- Everything else: find-or-create on the current identity, exactly as
  -- before. An UPDATE that fills a previously-empty link lands here too,
  -- which is the ruled fill-if-null case.
  NEW.network_profile_id := public.resolve_network_profile(
    NEW.organization_id, NEW.full_name, NEW.email,
    NEW.linkedin_url, NEW.current_company);

  -- §207 — the row just changed person. Whatever the person it is leaving
  -- was suppressed with comes along; the one it is joining is never
  -- lowered. Only on a REAL repoint: a fill-if-null (OLD was NULL) joins
  -- a person for the first time and has nothing to carry.
  IF TG_OP = 'UPDATE'
     AND OLD.network_profile_id IS NOT NULL
     AND NEW.network_profile_id IS NOT NULL
     AND NEW.network_profile_id IS DISTINCT FROM OLD.network_profile_id THEN
    PERFORM public.carry_network_suppression(
      OLD.network_profile_id, NEW.network_profile_id);
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.candidates_link_network_profile() IS
  '§196/139 — mints no network person while cv_processing is true and the only identity signal is a name, so a CV upload no longer leaves a person named after the file. §193 declared-identity hold runs first and is unaffected. §207 slice 1 — when an identity edit repoints the row to a DIFFERENT person, carry_network_suppression carries do-not-contact across: adding somebody''s email used to un-suppress them.';
