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
    redirect(`/projects/${id}/spec`);
  }

  const { data: queryRows, error: queriesError } = await supabase
    .from("boolean_queries")
    .select(
      "id, query_type, search_type, content, version, updated_at, created_at"
    )
    .eq("project_id", id)
    .order("version", { ascending: false });

  if (queriesError) {
    redirect(`/projects/${id}`);
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

  return (
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
  );
}
