-- Client contacts and notes — the last piece of the client entity.
--
-- 049 built `clients` as identity plus company profile and said in its own
-- header that contacts, notes and commercial terms were deliberately left
-- out. 050 took the commercial half. This is the rest, and with it the
-- entity is whole.
--
-- The concrete gap it closes is one both halves had independently: "who
-- signed off" had no answer. A placement recorded who was credited on our
-- side (`owner_user_id`, `sourced_by_user_id`) and nothing at all about who
-- on the client's side authorised it. The hiring-manager portal had the
-- same hole from the other direction — `hiring_manager_tokens.label` is a
-- free-text string ("Jane @ Acme"), so "who did we send this shortlist to"
-- and "who signed the offer off" were two unrelated pieces of prose that
-- could not be compared.
--
--
-- ## Four decisions, all the founder's, all made before this was written
--
-- **1. A contact is scoped to one client.** `client_id` is NOT NULL and
-- cascades; a hiring manager who moves from one bank to another is a new
-- row at the new client, not the same person with a new employer.
--
-- The Network page folds candidate rows by identity, and the temptation
-- was to do the same here. The reason not to: sourcing *produces* duplicate
-- rows for one person across mandates without anyone intending it, which is
-- what makes folding necessary there. Contacts are typed in deliberately,
-- one per relationship, and every question the product actually asks of
-- them — who do we deal with at this client, who signed this off, who gets
-- the portal link — is client-scoped. A people entity would also drag in
-- employment history, which is a candidate-shaped feature applied to
-- somebody who is not a candidate.
--
-- Being wrong here is cheap and that is part of the reasoning: a nullable
-- `person_id` pointing at a future people table is additive, and nothing
-- below would have to change to accept it.
--
-- **2. Issuing a portal token can name a contact.** `hiring_manager_tokens`
-- gains a nullable `contact_id`. `label` stays exactly as it was and is
-- still what the portal renders, so every token written before this keeps
-- working and a token can still be issued to somebody with no contact
-- record. What the FK buys is the join: the client screen can show who has
-- been given access, and the trail can say which person a shortlist went to
-- rather than which string.
--
-- Note what this deliberately is *not*. A contact is not an account.
-- Externals stay on the token path with no login, which is the constraint
-- the four-role model was built around; `contact_id` is a label on a token,
-- not a credential attached to a person.
--
-- The scope mismatch is real and is handled in the application, not here:
-- tokens are project-scoped and contacts are client-scoped, so "the contact
-- must belong to this project's client" is not expressible as a foreign
-- key. A trigger could enforce it, but `projects.client_id` is nullable —
-- a mandate whose company is still "Analyzing…" has no client — so the
-- trigger would have to carve out a case that is normal rather than
-- exceptional. `issueHmTokenAction` validates it and the FK stays soft.
--
-- **3. A placement records who signed it off.** A nullable
-- `signed_off_by_contact_id` *and* a `signed_off_by_label` snapshot.
--
-- The label is not redundant with the FK. `ON DELETE SET NULL` on a
-- deleted contact would erase who authorised a booked fee, which is the
-- exact failure 053 added `actor_label` to prevent, and the same
-- frozen-copy rule as `company_context` in 049 and the terms snapshot in
-- 050. The label may also be set without a contact row: knowing the name on
-- the offer letter should never be blocked on somebody first creating a CRM
-- record.
--
-- It lives on `placements` rather than on the fee side because it describes
-- the event, not the money — so every active role reads it, exactly like
-- the rest of that row. See §10 of the handoff for why that line is where
-- it is.
--
-- **4. Client notes carry a visibility tier.** Two: `org` and `commercial`.
--
-- `candidate_notes` (020, re-policied by 046) is the same problem solved
-- once already and the shape below is deliberately its shape — same
-- free-text content, same pin, same note types minus `interview`, which a
-- client does not have. The one place it diverges is the reason this is not
-- simply a copy: "they are squeezing us on the rate" is a sentence a viewer
-- should not read, and an org-readable notes table would undo `fees:read`
-- through the side door the same way 053 says an org-readable fee event
-- would.
--
-- `commercial` resolves to `can_read_fees()` rather than to a new
-- capability. That is the same predicate the fee tables use, so the rule a
-- person has to hold in their head stays one rule — "may see what we
-- billed" — rather than two that happen to agree today. The own-placement
-- exception does not reach here: there is no placement to be credited on,
-- which is the same reason 050 kept it off `fee_terms`.
--
--
-- ## Two things this decides on its own, and the reasoning
--
-- **Contact changes go on the activity trail; note changes do not.** A
-- contact is the "who signed off" record and the person a shortlist is sent
-- to — both are worth reading back months later. Notes are the chatty half
-- by design, and a trail that records every typo correction is one nobody
-- scrolls. This is the same judgement 053 already made twice: expanding a
-- retainer writes one event rather than four, and a notes-only edit to fee
-- terms writes none.
--
-- The same restraint applies within contacts. `client_contact_updated`
-- fires only when an identity-bearing field moves — name, title, email,
-- type, primary flag, archived flag. A corrected phone number is not
-- activity.
--
-- **Contact events carry no `contact_id` column, on purpose.** Adding one
-- to `activity_events` would mean an FK, and an FK would mean the cascade
-- deletes `client_contact_removed` at the moment it becomes true — the row
-- recording the removal would be removed by the removal. 053 hit the same
-- shape on placement deletion and solved it by recording against the parent
-- instead. These events therefore carry `client_id` and put the contact's
-- name and id in `detail`, where nothing cascades.
--
--
-- ## Art. 14, considered and deliberately not implemented
--
-- Candidates carry a statutory notification duty (043/044) and client
-- contacts do not. The distinction is not that one is B2B — Art. 14 turns
-- on whether the data came from the subject, not on whether the subject is
-- at work.
--
-- It is that candidates are sourced, profiled and *scored* without their
-- knowledge, and that profiling is what makes the notification necessary. A
-- row below holds a name, a title, an email and a phone number, collected
-- inside an existing or prospective commercial relationship, with no
-- scoring, no ranking and no automated decision-making about the person.
-- Legitimate interest covers that and Art. 14(5)(b) covers the residual.
--
-- The live edge is `client_notes`. The moment a note attached to a contact
-- starts carrying an assessment of *them* — "difficult", "not really the
-- decision-maker", anything the client-psychology agent would recognise as
-- its own output — that record becomes profiling of an identified person
-- who was never told, and the paragraph above stops holding. Notes are
-- recruiter-authored free text and nothing here can enforce that boundary,
-- so it is written down instead: **if client notes are ever fed to an
-- agent, or if a contact gains a scored or inferred field, this analysis
-- has to be redone before that ships.**


-- ---------------------------------------------------------------------------
-- 1. Contacts
-- ---------------------------------------------------------------------------

-- `clients` is already keyed by `id` alone; this is the index the composite
-- foreign keys below need in order to name (organization_id, id) as a target.
--
-- Every org-scoped table in this schema carries `organization_id` beside a
-- parent FK and *assumes* the two agree, because RLS only ever checks the
-- former. They can be made to disagree: nothing stopped a crafted insert
-- naming this org and another org's client, and RLS would accept it because
-- the column it inspects is correct. The consequences are small on a table
-- of contacts and were not small on the primary-contact trigger below, which
-- writes to sibling rows. Making it a foreign key removes the class of
-- problem rather than the instance.
--
-- The pre-054 tables still carry the assumption. This does not fix them.
CREATE UNIQUE INDEX IF NOT EXISTS clients_org_id_idx
  ON public.clients (organization_id, id);

CREATE TABLE IF NOT EXISTS public.client_contacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- The contact's org must be its client's org. See the note above the
  -- index this points at.
  CONSTRAINT client_contacts_client_in_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients (organization_id, id) ON DELETE CASCADE,

  full_name       text NOT NULL CHECK (length(btrim(full_name)) > 0),
  title           text,
  email           text,
  phone           text,
  linkedin_url    text,

  -- Dedupe within a client, maintained by Postgres for the same reason
  -- `clients.name_key` is: two recruiters adding "Jane Okafor" from two
  -- mandates at the same bank should not create two contacts.
  --
  -- `nullif(...)` collapses an empty string to NULL so that a contact with
  -- no email does not collide with another contact with no email. A plain
  -- unique index already permits any number of NULLs — which is the whole
  -- lesson of 051, where a partial index's WHERE clause turned out to be
  -- both redundant and fatal to `ON CONFLICT`. There is no partial index
  -- on an upsert path anywhere in this file.
  email_key       text GENERATED ALWAYS AS (nullif(btrim(lower(email)), '')) STORED,

  -- The relationship, not the job title. `title` is what is on their card;
  -- this is what they are to us, and it is what the contact list groups by.
  contact_type    text NOT NULL DEFAULT 'hiring_manager'
                    CHECK (contact_type IN ('hiring_manager', 'hr', 'executive',
                                            'procurement', 'finance', 'other')),

  is_primary      boolean NOT NULL DEFAULT false,

  -- People leave. Archiving rather than deleting keeps the row a portal
  -- token and a placement sign-off can still point at, which a hard delete
  -- would sever — `ON DELETE SET NULL` on both would leave the FK blank and
  -- only the snapshot label behind.
  is_archived     boolean NOT NULL DEFAULT false,

  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_client_email_idx
  ON public.client_contacts (client_id, email_key);

-- At most one primary per client. Enforced here and *maintained* by the
-- trigger below, so the index is a guarantee that never has to fire.
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_one_primary_idx
  ON public.client_contacts (client_id)
  WHERE is_primary;

-- The list query: one client's contacts, primary first, then by name.
CREATE INDEX IF NOT EXISTS client_contacts_client_idx
  ON public.client_contacts (client_id, is_primary DESC, full_name);

-- (organization_id, client_id) rather than organization_id alone: it covers
-- the composite foreign key above — which Postgres otherwise has to enforce
-- with a sequential scan every time a client is deleted — *and* still serves
-- any org-only lookup, because organization_id leads it. One index doing the
-- work of two rather than two indexes with one of them redundant.
CREATE INDEX IF NOT EXISTS client_contacts_org_client_idx
  ON public.client_contacts (organization_id, client_id);

-- `created_by` is indexed here and deliberately is not on `candidate_notes`
-- or `clients`, which both carry the advisor's unindexed-FK warning today.
-- The pre-launch checklist already owns clearing those; this simply does not
-- add two more to the list.
CREATE INDEX IF NOT EXISTS client_contacts_created_by_idx
  ON public.client_contacts (created_by);


-- Naming a new primary demotes the old one, rather than refusing the write.
--
-- The alternative was to make the application clear the previous primary
-- first, which is two statements that can interleave: two people promoting
-- two different contacts at once would both read "no primary", both write,
-- and the second would hit the unique index with a message about an index.
-- Doing it in the trigger makes the demotion part of the same statement.
--
-- The recursive call is bounded: the UPDATE below sets `is_primary` false,
-- which re-enters this function with NEW.is_primary false and returns at
-- the first line.
--
-- SECURITY INVOKER — deliberately, and unlike every other function in 053.
-- Those write to `activity_events`, which `authenticated` has no policy on,
-- so they must be DEFINER to write at all. This one writes to the table the
-- caller is already writing to, and running it as the definer would put a
-- row-modifying statement outside RLS for no gain: the caller holds
-- `can_write_mandates()` on their own org's rows by the time it fires, and
-- anything it could not reach under the caller's own policy is a row it
-- should not be demoting. Same reasoning as `resolve_client` in 049 and
-- `is_placement_credited` in 050 — making a helper DEFINER turns it into a
-- hole.
CREATE OR REPLACE FUNCTION public.demote_other_primary_contacts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_primary IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  UPDATE public.client_contacts
     SET is_primary = false,
         updated_at = now()
   WHERE client_id = NEW.client_id
     AND id <> NEW.id
     AND is_primary;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.demote_other_primary_contacts()
  FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS client_contacts_single_primary ON public.client_contacts;
CREATE TRIGGER client_contacts_single_primary
  BEFORE INSERT OR UPDATE OF is_primary, client_id ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.demote_other_primary_contacts();


-- RLS: read for any active member, write at the mandate tier.
--
-- The same tier 049 gave `clients` itself, and for the same reason —
-- holding the client relationship is a recruiter act. A researcher sources
-- into mandates that already exist; they do not open the account and do not
-- own who we speak to at it. Note this is a *narrower* write tier than
-- `candidate_notes`, which sits at the candidates tier because sourcing is
-- exactly what produces those.

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_contacts_role_select ON public.client_contacts;
CREATE POLICY client_contacts_role_select ON public.client_contacts
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_read_org()));

DROP POLICY IF EXISTS client_contacts_role_insert ON public.client_contacts;
CREATE POLICY client_contacts_role_insert ON public.client_contacts
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS client_contacts_role_update ON public.client_contacts;
CREATE POLICY client_contacts_role_update ON public.client_contacts
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()))
  WITH CHECK (organization_id IS NOT NULL
              AND organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_write_mandates()));

DROP POLICY IF EXISTS client_contacts_role_delete ON public.client_contacts;
CREATE POLICY client_contacts_role_delete ON public.client_contacts
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL
         AND organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_write_mandates()));


-- ---------------------------------------------------------------------------
-- 2. Notes
-- ---------------------------------------------------------------------------
--
-- `candidate_notes` from 020, with one column added and one taken away.
--
-- Added: `visibility`. Taken away: `call_duration_minutes`, which exists on
-- the candidate side because a recruiter logs screening calls against a
-- time budget, and does not mean anything for a client conversation.
--
-- `author_label` is new relative to 020 and is the same fix 053 made for
-- `actor_label`: `created_by` is ON DELETE SET NULL, so without it every
-- note a departed colleague ever wrote becomes anonymous the day their
-- account is removed. `candidate_notes` still has that gap; this does not
-- fix it there, but it does not repeat it here.

CREATE TABLE IF NOT EXISTS public.client_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  CONSTRAINT client_notes_client_in_org
    FOREIGN KEY (organization_id, client_id)
    REFERENCES public.clients (organization_id, id) ON DELETE CASCADE,

  -- Which person this was with, when it was with a person. Nullable
  -- because most notes are about the account rather than about anybody, and
  -- SET NULL rather than CASCADE because deleting a contact must not delete
  -- the record of the conversation.
  contact_id      uuid REFERENCES public.client_contacts(id) ON DELETE SET NULL,

  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_label    text,

  note_type       text NOT NULL DEFAULT 'general'
                    CHECK (note_type IN ('general', 'call', 'meeting', 'email')),

  content         text NOT NULL CHECK (length(btrim(content)) > 0),

  -- 'org'        every active member, like the client record it hangs off
  -- 'commercial' `fees:read` — the same predicate the fee tables use, so
  --              "may see what we billed" stays one rule rather than two
  visibility      text NOT NULL DEFAULT 'org'
                    CHECK (visibility IN ('org', 'commercial')),

  is_pinned       boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- The panel query, matching 020's: one client, pinned first, newest first.
CREATE INDEX IF NOT EXISTS client_notes_client_idx
  ON public.client_notes (client_id, is_pinned DESC, created_at DESC);

-- Same composite shape as the contacts table, for the same reason.
CREATE INDEX IF NOT EXISTS client_notes_org_client_idx
  ON public.client_notes (organization_id, client_id);

CREATE INDEX IF NOT EXISTS client_notes_contact_idx
  ON public.client_notes (contact_id);

CREATE INDEX IF NOT EXISTS client_notes_created_by_idx
  ON public.client_notes (created_by);


-- Stamp the author's name at insert.
--
-- Written by the database rather than passed in by the action, for the
-- reason 053 gives for preferring triggers generally: an application-set
-- label is set only where somebody remembered to set it, and never on a row
-- written by a hand-run statement during a fix. It also saves the action a
-- round trip it would otherwise make purely to read its own name.
--
-- SECURITY DEFINER because it reads `public.users`, whose RLS does not let
-- an ordinary member select arbitrary rows — but it is bounded to the one
-- row it is about to attribute the note to, and cannot be called directly.
CREATE OR REPLACE FUNCTION public.stamp_client_note_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(nullif(btrim(full_name), ''), email)
    INTO NEW.author_label
    FROM public.users
   WHERE id = NEW.created_by;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_client_note_author()
  FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS client_notes_stamp_author ON public.client_notes;
CREATE TRIGGER client_notes_stamp_author
  BEFORE INSERT ON public.client_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_client_note_author();


ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_notes_role_select ON public.client_notes;
CREATE POLICY client_notes_role_select ON public.client_notes
  FOR SELECT TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_read_org())
    AND CASE visibility
      WHEN 'org'        THEN true
      WHEN 'commercial' THEN (SELECT public.can_read_fees())
      ELSE false
    END
  );

-- The `can_read_fees()` clause on the write side is not belt-and-braces.
-- Without it, a role holding `mandates:write` but not `fees:read` could
-- write a note into a tier it cannot then read — a note that vanishes the
-- moment it is saved. The two capabilities resolve to the same two roles
-- today, so this is a rule about what happens when they stop agreeing,
-- which `roles.ts` says explicitly is expected.
DROP POLICY IF EXISTS client_notes_role_insert ON public.client_notes;
CREATE POLICY client_notes_role_insert ON public.client_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_mandates())
    AND (visibility <> 'commercial' OR (SELECT public.can_read_fees()))
  );

-- USING carries the read rule as well as the write rule, so a note that
-- cannot be read cannot be edited or deleted blind either.
DROP POLICY IF EXISTS client_notes_role_update ON public.client_notes;
CREATE POLICY client_notes_role_update ON public.client_notes
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_mandates())
    AND (visibility <> 'commercial' OR (SELECT public.can_read_fees()))
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_mandates())
    AND (visibility <> 'commercial' OR (SELECT public.can_read_fees()))
  );

DROP POLICY IF EXISTS client_notes_role_delete ON public.client_notes;
CREATE POLICY client_notes_role_delete ON public.client_notes
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND organization_id = (SELECT public.current_user_org_id())
    AND (SELECT public.can_write_mandates())
    AND (visibility <> 'commercial' OR (SELECT public.can_read_fees()))
  );


-- ---------------------------------------------------------------------------
-- 3. The two places a contact is pointed at
-- ---------------------------------------------------------------------------

-- The portal token. `label` is untouched and stays the string the portal
-- renders, so every existing token keeps working and a token can still be
-- issued to a name with no contact record behind it.
ALTER TABLE public.hiring_manager_tokens
  ADD COLUMN IF NOT EXISTS contact_id uuid
    REFERENCES public.client_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hm_tokens_contact_idx
  ON public.hiring_manager_tokens (contact_id);

-- The sign-off. See decision 3 in the header for why both columns exist.
ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS signed_off_by_contact_id uuid
    REFERENCES public.client_contacts(id) ON DELETE SET NULL;

ALTER TABLE public.placements
  ADD COLUMN IF NOT EXISTS signed_off_by_label text;

CREATE INDEX IF NOT EXISTS placements_signed_off_by_idx
  ON public.placements (signed_off_by_contact_id);


-- ---------------------------------------------------------------------------
-- 4. The activity trail
-- ---------------------------------------------------------------------------
--
-- Four new event types. Three for contacts, one for the sign-off — which is
-- the whole reason the founder wanted contacts on the trail, so recording
-- the contact and not recording who was named on a placement would have
-- missed the point.
--
-- All at 'org' visibility. A contact is not money; it is the same tier as
-- the placement event itself, and `client_notes` deliberately writes nothing
-- here at all (see the header).

ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_type_known;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_type_known CHECK (event_type IN (
    -- Placements: the event, not the money. Visible at 'org'.
    'placement_recorded',
    'placement_status_changed',
    'placement_signoff_changed',
    'placement_deleted',
    -- Money. Always 'fees'.
    'fee_recorded',
    'fee_updated',
    'fee_line_earned',
    'fee_line_cancelled',
    'fee_reversed',
    'fee_terms_created',
    'fee_terms_updated',
    'fee_terms_deleted',
    -- The client's people. Always 'org'.
    'client_contact_added',
    'client_contact_updated',
    'client_contact_removed',
    -- The role model. Always 'admin'.
    'member_role_changed',
    'member_status_changed',
    'member_founder_changed',
    -- Intent events, written by the app rather than by a trigger, because
    -- no row changes when a document leaves the building.
    'shortlist_published',
    'report_exported',
    'hm_portal_opened'
  ));


-- Contacts.
--
-- `client_contact_removed` covers both mechanisms — archiving and hard
-- deletion — with `detail.mode` recording which. The event type names the
-- effect a person reading the trail cares about ("Jane is no longer a
-- contact") and `detail` holds the fact, which is the division 053 set up
-- when it put the wording in `describe.ts` instead of in the row.
CREATE OR REPLACE FUNCTION public.audit_client_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_mode text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'client_contact_added',
      p_visibility      => 'org',
      p_client_id       => NEW.client_id,
      p_detail          => jsonb_build_object(
                             'contact_id', NEW.id,
                             'name', NEW.full_name,
                             'title', NEW.title,
                             'contact_type', NEW.contact_type,
                             'is_primary', NEW.is_primary,
                             'mode', 'created'));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Archiving and restoring are the events worth finding, so they are
    -- reported as removal and addition rather than buried in an "updated"
    -- line the reader has to open to understand.
    IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      v_type := CASE WHEN NEW.is_archived THEN 'client_contact_removed'
                     ELSE 'client_contact_added' END;
      v_mode := CASE WHEN NEW.is_archived THEN 'archived' ELSE 'restored' END;

    -- Identity-bearing fields only. A corrected phone number or a pasted
    -- LinkedIn URL is not activity — the same restraint 053 applies when it
    -- returns early from a notes-only change to fee terms.
    ELSIF NEW.full_name    IS DISTINCT FROM OLD.full_name
       OR NEW.title        IS DISTINCT FROM OLD.title
       OR NEW.email        IS DISTINCT FROM OLD.email
       OR NEW.contact_type IS DISTINCT FROM OLD.contact_type
       OR NEW.is_primary   IS DISTINCT FROM OLD.is_primary THEN
      v_type := 'client_contact_updated';
      v_mode := 'edited';
    ELSE
      RETURN NEW;
    END IF;

    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => v_type,
      p_visibility      => 'org',
      p_client_id       => NEW.client_id,
      p_detail          => jsonb_build_object(
                             'contact_id', NEW.id,
                             'name', NEW.full_name,
                             'name_from', OLD.full_name,
                             'title', NEW.title,
                             'contact_type', NEW.contact_type,
                             'is_primary', NEW.is_primary,
                             'was_primary', OLD.is_primary,
                             'mode', v_mode));
    RETURN NEW;
  END IF;

  -- DELETE. The client may be going away in the same statement, in which
  -- case it is already gone by the time this cascade fires and the FK on
  -- `activity_events.client_id` would reject the row. `write_activity_event`
  -- swallows that, but a WARNING per contact on every client deletion is
  -- noise standing in for a condition worth testing directly.
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = OLD.client_id) THEN
    RETURN OLD;
  END IF;

  PERFORM public.write_activity_event(
    p_organization_id => OLD.organization_id,
    p_event_type      => 'client_contact_removed',
    p_visibility      => 'org',
    p_client_id       => OLD.client_id,
    p_detail          => jsonb_build_object(
                           'contact_id', OLD.id,
                           'name', OLD.full_name,
                           'title', OLD.title,
                           'contact_type', OLD.contact_type,
                           'mode', 'deleted'));
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_client_contacts()
  FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS client_contacts_audit ON public.client_contacts;
CREATE TRIGGER client_contacts_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.audit_client_contacts();


-- The sign-off, folded into the placements trigger 053 already installed.
--
-- Replaced whole rather than added alongside, because two AFTER triggers on
-- one table have no defined order between them and the existing one already
-- owns the INSERT and DELETE branches.
--
-- The label is what the event reports, and the label alone is what triggers
-- it. On a change made through the product the FK and the label move
-- together; on one made by hand they need not, and the trail should say the
-- name that was actually recorded rather than resolve the FK and report
-- something the row does not contain.
--
-- Watching only the label is also what keeps a deleted contact quiet.
-- `signed_off_by_contact_id` is ON DELETE SET NULL, so removing a contact
-- rewrites every placement they signed off — and a condition that included
-- the FK would emit "changed the sign-off from Jane to Jane" for each one.
-- The recorded answer did not change; only the link did. Same restraint as
-- the fee-terms trigger returning early when nothing commercial moved.
CREATE OR REPLACE FUNCTION public.audit_placements()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_activity_event(
      p_organization_id => NEW.organization_id,
      p_event_type      => 'placement_recorded',
      p_visibility      => 'org',
      p_project_id      => NEW.project_id,
      p_candidate_id    => NEW.candidate_id,
      p_client_id       => NEW.client_id,
      p_placement_id    => NEW.id,
      p_detail          => jsonb_build_object(
                             'status', NEW.status,
                             'offer_date', NEW.offer_date,
                             'signed_off_by', NEW.signed_off_by_label));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only a real transition. `updated_at` moving is not activity.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.write_activity_event(
        p_organization_id => NEW.organization_id,
        p_event_type      => 'placement_status_changed',
        p_visibility      => 'org',
        p_project_id      => NEW.project_id,
        p_candidate_id    => NEW.candidate_id,
        p_client_id       => NEW.client_id,
        p_placement_id    => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', OLD.status,
                               'to', NEW.status,
                               'start_date', NEW.start_date,
                               'reason', NEW.fell_through_reason));
    END IF;

    IF NEW.signed_off_by_label IS DISTINCT FROM OLD.signed_off_by_label THEN
      PERFORM public.write_activity_event(
        p_organization_id => NEW.organization_id,
        p_event_type      => 'placement_signoff_changed',
        p_visibility      => 'org',
        p_project_id      => NEW.project_id,
        p_candidate_id    => NEW.candidate_id,
        p_client_id       => NEW.client_id,
        p_placement_id    => NEW.id,
        p_detail          => jsonb_build_object(
                               'from', OLD.signed_off_by_label,
                               'to', NEW.signed_off_by_label,
                               'contact_id', NEW.signed_off_by_contact_id));
    END IF;

    RETURN NEW;
  END IF;

  -- DELETE: the placement row is going, so `placement_id` must not point at
  -- it — the FK would cascade this very row away. Recorded against the
  -- mandate instead, which is where someone would look for it.
  PERFORM public.write_activity_event(
    p_organization_id => OLD.organization_id,
    p_event_type      => 'placement_deleted',
    p_visibility      => 'org',
    p_project_id      => OLD.project_id,
    p_candidate_id    => OLD.candidate_id,
    p_client_id       => OLD.client_id,
    p_detail          => jsonb_build_object('status', OLD.status));
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_placements() FROM public, anon, authenticated;
