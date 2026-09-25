import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireCapability } from "@/lib/auth/access";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { IntakeForm, MAX_FILES, type IntakeMandate } from "./intake-form";
import { type CalibrationModel } from "@/lib/ai/role-analysis";

/**
 * Bulk CV intake (§200 slice 2).
 *
 * Its own page rather than an extension of the mandate's single upload,
 * because the question it answers is "I have a stack of CVs — where do
 * they go", and that question starts with the stack, not the mandate. The
 * mandate page keeps its one-CV path untouched.
 *
 * `candidates:write` twice over: the route rule refuses it, and
 * `requireCapability` refuses it again here — the same belt-and-braces
 * the members screen uses, because a route table is a list somebody has
 * to remember to update.
 */

type ProjectRow = {
  id: string;
  title: string;
  company_name: string | null;
  status: string | null;
  calibration_model: Partial<CalibrationModel> | null;
};

export default async function IntakePage() {
  const access = await requireCapability("candidates:write");
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("projects")
    .select("id, title, company_name, status, calibration_model")
    .eq("organization_id", access.organizationId ?? "")
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as ProjectRow[];

  // Closed and archived searches are not where a new CV belongs. They
  // stay reachable everywhere else; they are simply not offered here.
  const mandates: IntakeMandate[] = rows
    .filter((p) => (p.status ?? "active").toLowerCase() !== "closed")
    .map((p) => ({
      id: p.id,
      title: p.title,
      companyName: p.company_name,
      calibrated:
        typeof p.calibration_model?.dimension_weights?.technical === "number",
    }));

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Candidates", href: "/app/candidates" },
          { label: "Intake" },
        ]}
      />

      <header className="space-y-2">
        <TerminalTitle>CV_INTAKE</TerminalTitle>
        <p className="max-w-2xl text-body-main leading-relaxed text-on-surface-variant">
          Pick the search, add up to {MAX_FILES} CVs, and parse them in one
          go. Each CV is read by the CV Parsing Agent and becomes a
          candidate on that mandate — the same path a single upload takes,
          run once per file so that one bad document cannot cost you the
          rest of the batch.
        </p>
      </header>

      <IntakeForm mandates={mandates} />
    </PageShell>
  );
}
