-- desk_digests — where the manager's weekly digest lands.
--
-- Its own table rather than a column on organizations, because the
-- organizations UPDATE policy is deliberately admin-only (renaming the org
-- is not a manager act, and RLS cannot restrict which columns an update
-- touches — the 046 reasoning). A digest written by a manager needs a row
-- the manager may write.
--
-- This is also the product's second read restriction after fees (§10), and
-- the first scoped to the desk: the digest is the manager's read of the
-- desk — including per-recruiter framing — and a recruiter reading their
-- manager's notes about colleagues is the §10 "one signed-in colleague
-- told less than another" situation again, decided the same way.
--
-- Append-only like calibration_history: each generation is a new row, the
-- newest is canonical, and there is deliberately no UPDATE or DELETE — a
-- digest that could be rewritten after the Monday meeting is not a record.

CREATE TABLE public.desk_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content_json jsonb NOT NULL,
  model_version text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_desk_digests_org_created
  ON public.desk_digests (organization_id, created_at DESC);

ALTER TABLE public.desk_digests ENABLE ROW LEVEL SECURITY;

CREATE POLICY desk_digests_role_select ON public.desk_digests
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.current_user_org_id())
         AND (SELECT public.can_manage_desk()));

CREATE POLICY desk_digests_role_insert ON public.desk_digests
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT public.current_user_org_id())
              AND (SELECT public.can_manage_desk()));

-- 057's discipline for the attribution column.
DROP TRIGGER IF EXISTS desk_digests_author_in_org ON public.desk_digests;
CREATE TRIGGER desk_digests_author_in_org BEFORE INSERT OR UPDATE ON public.desk_digests
  FOR EACH ROW EXECUTE FUNCTION public.guard_author_in_org('created_by');
