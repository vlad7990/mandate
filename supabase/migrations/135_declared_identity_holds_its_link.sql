-- 135 — G.3: A DECLARED IDENTITY HOLDS ITS RELATIONSHIP LINK
--
-- §192 found it and the founder ruled it: a parser guess must not be
-- able to move `candidates.network_profile_id`, because
-- `send-candidate-message.ts` reads `network_profiles.dnc` THROUGH that
-- link. An applicant whose CV carries someone else's email was silently
-- joined to that person's relationship record, and the do-not-contact
-- gate then answered for the wrong human — in both directions.
--
-- ## Why this is not the literal "key on insert only, never re-key"
--
-- The gate ruled insert-only keying. Building it surfaced a fact the
-- gate did not have, and the literal rule would have caused a
-- regression worse than the defect:
--
--   A RECRUITER UPLOAD INSERTS BEFORE IT KNOWS WHO THE PERSON IS. The
--   placeholder row carries `full_name = <the filename>` ("drive123-cv")
--   and no email, so the insert-time key is `name:drive123-cv|`. The
--   re-key is what later moves that row onto the real person once the
--   parser has read the CV. Freeze it at insert and EVERY recruiter
--   upload is stranded on a filename-named profile for good — and the
--   DNC gate then reads a junk profile instead of a wrong one, which is
--   not an improvement.
--
--   (That mechanism is also where §192's orphan profiles came from:
--   `drive118-cv`, `drive119-cv`, `drive121-cv` are abandoned filename
--   keys. Litter, not a safety issue — left for its own slice rather
--   than folded in here.)
--
-- So the rule implements the ruling's INTENT at its real boundary: the
-- link freezes when the identity was DECLARED BY THE SUBJECT, and
-- resolves as before when it was not. A recruiter upload has no
-- declared identity to defend — the CV is the only identity there is,
-- and re-keying onto it is the correct, intended behaviour. An apply
-- row has one, given under the Art.13 notice on the form.
--
-- ## Two guards, not one
--
-- G.1 stops the overwrite in TypeScript: the parser no longer writes
-- the CV's identity over an applicant's typed one, so on the apply path
-- this trigger never even sees a changed key. This clause holds the
-- line underneath it anyway, for any path that reaches the table by
-- another road. Same shape as §177's door: SQL at the row, TS at the
-- judgment, neither trusting the other.
--
-- ## Grants
--
-- CREATE OR REPLACE preserves an existing function's ACL, but the house
-- rule is to revoke explicitly and COUNT THE ROSTER after every apply
-- (the 110/121/125 doctrine, and §129's lesson). The roster is 14 and
-- must still be 14 when this lands. This function is a trigger body: it
-- is not a door and nothing but the table should ever execute it.

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
  --
  -- NULL source falls through to the resolve below: `NULL = 'apply'` is
  -- NULL, which is not true, which is the behaviour we want for every
  -- pre-existing row.
  IF TG_OP = 'UPDATE'
     AND NEW.source = 'apply'
     AND OLD.network_profile_id IS NOT NULL THEN
    NEW.network_profile_id := OLD.network_profile_id;
    RETURN NEW;
  END IF;

  -- Everything else: find-or-create on the current identity, exactly as
  -- before. An UPDATE that fills a previously-empty link lands here too,
  -- which is the ruled fill-if-null case — there is no prior link whose
  -- DNC could be inherited, so nothing can be misrouted.
  NEW.network_profile_id := public.resolve_network_profile(
    NEW.organization_id, NEW.full_name, NEW.email,
    NEW.linkedin_url, NEW.current_company);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.candidates_link_network_profile()
  FROM public, anon, authenticated;
