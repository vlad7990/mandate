import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  EMPTY_SOURCING_QUERIES,
  slotForDbRow,
  SLOTS,
  type SlotKey,
  type SourcingQueries,
} from "@/lib/ai/sourcing-analysis";
import type { CalibrationModel, CompanyContext } from "@/lib/ai/role-analysis";
import { SourcingEditor } from "./sourcing-editor";
import { SourcingEmpty } from "./sourcing-empty";
import {
  SourcingVersionHistory,
  type SlotVersions,
} from "./version-history";
import { SourcingStrategy } from "./sourcing-strategy";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  calibration_model: Partial<CalibrationModel> | null;
  company_context: Partial<CompanyContext> | null;
};

type QueryRow = {
  id: string;
  query_type: string;
  search_type: string;
  content: string;
  version: number;
  updated_at: string;
  created_at: string | null;
};

export type SlotState = {
  slot: SlotKey;
  rowId: string;
  content: string;
  version: number;
  updated_at: string;
  history: QueryHistoryEntry[];
};

export type QueryHistoryEntry = {
  rowId: string;
  version: number;
  content: string;
  updated_at: string;
};

export default async function SourcingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, company_name, calibration_model, company_context")
    .eq("id", id)
    .single<ProjectRow>();

  if (projectError || !project) {
    if (projectError?.code === "PGRST116") notFound();
    redirect("/");
  }

  // Sourcing depends on the FINAL job spec — no point generating boolean
  // strings against a draft that's still in flux. Bounce to /spec if not
  // yet final.
  const { data: finalSpec } = await supabase
    .from("job_specs")
    .select("id, version")
    .eq("project_id", id)
    .eq("is_final", true)
    .maybeSingle<{ id: string; version: number }>();

  if (!finalSpec) {
    redirect(`/app/projects/${id}/spec`);
  }

  const { data: queryRows, error: queriesError } = await supabase
    .from("boolean_queries")
    .select(
      "id, query_type, search_type, content, version, updated_at, created_at"
    )
    .eq("project_id", id)
    .order("version", { ascending: false });

  if (queriesError) {
    redirect(`/app/projects/${id}`);
  }

  const rows = (queryRows ?? []) as QueryRow[];

  if (rows.length === 0) {
    return (
      <SourcingEmpty
        projectId={project.id}
        roleTitle={project.title}
        companyName={project.company_name}
        finalSpecVersion={finalSpec.version}
      />
    );
  }

  // Bucket rows per slot. The first row per slot (highest version, since
  // we ordered DESC) is canonical; the rest go into history.
  const slotStates: Record<SlotKey, SlotState | null> = {
    linkedin_exact: null,
    linkedin_broad: null,
    linkedin_adjacent: null,
    linkedin_competitor: null,
    google_xray: null,
    ats: null,
  };

  for (const row of rows) {
    const key = slotForDbRow(row.query_type, row.search_type);
    if (!key) continue;
    const existing = slotStates[key];
    const historyEntry: QueryHistoryEntry = {
      rowId: row.id,
      version: row.version,
      content: row.content,
      updated_at: row.updated_at,
    };
    if (!existing) {
      slotStates[key] = {
        slot: key,
        rowId: row.id,
        content: row.content,
        version: row.version,
        updated_at: row.updated_at,
        history: [historyEntry],
      };
    } else {
      existing.history.push(historyEntry);
    }
  }

  const queries: SourcingQueries = { ...EMPTY_SOURCING_QUERIES };
  for (const slot of SLOTS) {
    const state = slotStates[slot.key];
    queries[slot.key] = state?.content ?? "";
  }

  // Per-version performance — count candidates created while each
  // version was the active one. A version is "active" from its
  // updated_at until the next version's updated_at (or now). The
  // spec calls this "candidates found while using V2".
  const slotVersions = await buildSlotVersions(supabase, id, slotStates);

  return (
    <>
      <SourcingEditor
        projectId={project.id}
        roleTitle={project.title}
        companyName={project.company_name}
        finalSpecVersion={finalSpec.version}
        slotStates={slotStates}
        initialQueries={queries}
        calibration={project.calibration_model ?? {}}
        companyContext={project.company_context ?? {}}
      />
      <SourcingStrategy projectId={project.id} />
      <div className="max-w-7xl mx-auto px-6 pb-10">
        <SourcingVersionHistory
          projectId={project.id}
          slots={slotVersions}
        />
      </div>
    </>
  );
}

async function buildSlotVersions(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  projectId: string,
  slotStates: Record<SlotKey, SlotState | null>
): Promise<SlotVersions[]> {
  // Pull every candidate created_at for the project so we can
  // attribute by timestamp window. Cheap because we only need one
  // column.
  const { data: candidateRows } = await supabase
    .from("candidates")
    .select("created_at")
    .eq("project_id", projectId);
  const candidateTimestamps = ((candidateRows ?? []) as Array<{
    created_at: string;
  }>)
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  return SLOTS.map((slot): SlotVersions => {
    const state = slotStates[slot.key];
    if (!state) return { slot: slot.key, versions: [] };

    // history is sorted version desc; build ascending so we can
    // compute window endpoints by looking at the next version's
    // updated_at.
    const ascending = [...state.history].sort(
      (a, b) => a.version - b.version
    );

    const versions = ascending.map((entry, i) => {
      const start = new Date(entry.updated_at).getTime();
      const end =
        i + 1 < ascending.length
          ? new Date(ascending[i + 1].updated_at).getTime()
          : Number.POSITIVE_INFINITY;
      const candidates_attributed = candidateTimestamps.filter(
        (t) => t >= start && t < end
      ).length;
      return {
        rowId: entry.rowId,
        version: entry.version,
        content: entry.content,
        updated_at: entry.updated_at,
        candidates_attributed,
      };
    });

    // Newest first so the version-history component renders in the
    // same order recruiters expect.
    versions.sort((a, b) => b.version - a.version);
    return { slot: slot.key, versions };
  });
}
