-- 139 — NO PERSON IS MINTED BEFORE WE KNOW WHO THEY ARE
--
-- §194 recorded this and offered it rather than building it; drive 128
-- hit it again within minutes, exactly as predicted. Upload
-- `avery-penhallow-cv.pdf` and a person called "avery-penhallow-cv"
-- appears in the Network screen, forever.
--
-- THE MECHANISM. A CV upload inserts the candidate row FIRST, with
-- `full_name` set to the filename and no email, no linkedin_url, no
-- current_company — because nothing has read the document yet. The
-- BEFORE trigger resolves an identity from that, and
-- `candidate_identity_key` falls all the way through to its name-only
-- branch, so a durable person is minted keyed on a filename. Thirty
-- seconds later the parser UPDATEs the row with the real name and
-- email, the trigger resolves a DIFFERENT key, and the first profile is
-- abandoned where it sits.
--
-- THE RULE, and it is a rule about knowledge rather than about strings:
-- while a CV is still being parsed, and the only identity signal we have
-- is a name, we do not yet know who this is. So we mint nothing and
-- leave `network_profile_id` NULL. The moment the parser writes a real
-- identity the same trigger fires on `full_name`/`email`/`linkedin_url`/
-- `current_company` and the EXISTING ruled fill-if-null path keys the
-- person properly, first time, once.
--
-- WHY NOT PATTERN-MATCH THE FILENAME. Guessing which names "look like"
-- filenames would be wrong in both directions — it would mint nothing
-- for a real person called something hyphenated, and it would still mint
-- junk for `cv.pdf`. The honest signal is not the shape of the string,
-- it is that WE HAVE NOT READ THE DOCUMENT YET. `cv_processing` says so
-- exactly.
--
-- WHAT A FAILED PARSE DOES, deliberately: nothing. `cv_processing` is
-- NOT added to the trigger's UPDATE OF column list, so a parse that
-- fails without ever writing a name leaves the link NULL rather than
-- minting the filename after all. A candidate whose identity was never
-- established is not a person in the network — they are a document we
-- could not read, and the Network screen should not claim otherwise. A
-- recruiter who types a real name over it fires the trigger on
-- `full_name` and mints the person properly.
--
-- UNTOUCHED: §193's declared-identity hold (the `source = 'apply'`
-- branch) runs BEFORE this check and is not reached by it — an
-- applicant types their own name AND email, so they carry a real
-- identity signal and key correctly on the first insert, as they
-- already did. `resolve_network_profile` itself is not modified; it
-- stays a general-purpose resolver, and the rule lives at the
-- candidate-birth path where the defect is. No new grants, no new FK,
-- no policy change; the anon roster is untouched.

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
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.candidates_link_network_profile() IS
  '§196/139 — mints no network person while cv_processing is true and the only identity signal is a name, so a CV upload no longer leaves a person named after the file. §193 declared-identity hold runs first and is unaffected.';
