import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { MastHead } from "@/components/ui/mast-head";
import { PageShell, TerminalTitle } from "@/components/ui/page-shell";
import { CAPABILITY_MODEL } from "@/lib/ai/model-map";
import {
  AddModelForm,
  AddProviderForm,
  AssignmentControls,
  ModelStatusControls,
} from "./registry-controls";

/**
 * The model registry console (LLM router slice 4, gate 1885da9) —
 * which model runs which capability, as data. Admin territory
 * end-to-end: the route rule takes `models:write`, the tables' RLS is
 * admin-only, and every write records its trail intent. The ruled
 * code map stays the law wherever no override row exists; a row here
 * is an explicit founder override, live within a minute (the seam's
 * 60s cache), no deploy.
 */

type ProviderRow = {
  name: string;
  adapter_kind: string;
  key_env_var: string;
  status: string;
  data_region: string | null;
};

type ModelRow = {
  model_id: string;
  provider: string;
  tier: string | null;
  status: "benchmarking" | "active" | "retired";
  benchmark_ref: string | null;
  price_input_per_mtok: number | null;
  price_output_per_mtok: number | null;
  cache_min_tokens: number | null;
};

type AssignmentRow = {
  capability: string;
  model_id: string;
  updated_at: string;
};

const STATUS_TONE: Record<ModelRow["status"], string> = {
  active: "text-primary",
  benchmarking: "text-tertiary",
  retired: "text-outline",
};

export default async function ModelRegistryPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id, status")
    .eq("id", user.id)
    .single<{ organization_id: string | null; status: string }>();

  if (!profile || profile.status !== "active" || !profile.organization_id) {
    redirect("/app/settings");
  }

  const [providersQ, modelsQ, assignmentsQ] = await Promise.all([
    supabase
      .from("model_providers")
      .select("name, adapter_kind, key_env_var, status, data_region")
      .order("name", { ascending: true }),
    supabase
      .from("provider_models")
      .select(
        "model_id, provider, tier, status, benchmark_ref, price_input_per_mtok, price_output_per_mtok, cache_min_tokens"
      )
      .order("model_id", { ascending: true }),
    supabase
      .from("capability_assignments")
      .select("capability, model_id, updated_at")
      .order("capability", { ascending: true }),
  ]);

  const providers = (providersQ.data ?? []) as ProviderRow[];
  const models = (modelsQ.data ?? []) as ModelRow[];
  const assignments = (assignmentsQ.data ?? []) as AssignmentRow[];

  const overrideByCapability = new Map(
    assignments.map((a) => [a.capability, a.model_id])
  );
  const activeModels = models
    .filter((m) => m.status === "active")
    .map((m) => m.model_id);
  const capabilities = Object.keys(CAPABILITY_MODEL).sort();
  const knownCapabilities = new Set(capabilities);
  // A row whose slug the code map has never heard of is inert — the
  // resolver never asks for it. Showing it is the honest half of not
  // CHECK-constraining the column.
  const orphanAssignments = assignments.filter(
    (a) => !knownCapabilities.has(a.capability)
  );

  return (
    <PageShell className="space-y-5">
      <SetBreadcrumbs
        crumbs={[
          { label: "Settings", href: "/app/settings" },
          { label: "Models" },
        ]}
      />

      <header className="space-y-2">
        <TerminalTitle>MODEL_REGISTRY</TerminalTitle>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums">
          <span className="text-primary">
            {String(activeModels.length).padStart(2, "0")}
          </span>{" "}
          active models · {String(overrideByCapability.size).padStart(2, "0")}{" "}
          overrides · the ruled map governs everything else
        </p>
      </header>

      <section className="bg-surface-container-low border border-outline-variant px-5 py-4 space-y-1">
        <p className="text-sm text-on-surface">
          A new model enters <span className="font-mono-data">benchmarking</span>{" "}
          and can only be activated with eval evidence behind it — the harness&apos;s
          pass is the door. A capability can only be assigned an active model.
          Clearing an override puts the capability back on the code map.
        </p>
        <p className="text-sm text-on-surface-variant">
          Provider rows store the <span className="font-mono-data">NAME</span> of
          an env var, never a key — secrets are set in Vercel by hand.
        </p>
      </section>

      <section className="space-y-2">
        <MastHead tone="primary" label="Providers" />
        <div className="border border-outline-variant bg-surface-container-low overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono-label text-mono-label text-outline uppercase tracking-widest text-left">
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2">Adapter</th>
                <th className="px-4 py-2">Key env var</th>
                <th className="px-4 py-2">Region</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.name} className="border-t border-outline-variant">
                  <td className="px-4 py-2 font-mono-data">{p.name}</td>
                  <td className="px-4 py-2 font-mono-data">{p.adapter_kind}</td>
                  <td className="px-4 py-2 font-mono-data">{p.key_env_var}</td>
                  <td className="px-4 py-2">{p.data_region ?? "—"}</td>
                  <td className="px-4 py-2 font-mono-data">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border border-outline-variant bg-surface-container-low px-4 py-3">
          <AddProviderForm />
        </div>
      </section>

      <section className="space-y-2">
        <MastHead tone="secondary" label="Models" />
        <div className="border border-outline-variant bg-surface-container-low overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono-label text-mono-label text-outline uppercase tracking-widest text-left">
                <th className="px-4 py-2">Model</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">$/Mtok in·out</th>
                <th className="px-4 py-2">Evidence</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model_id} className="border-t border-outline-variant">
                  <td className="px-4 py-2 font-mono-data">{m.model_id}</td>
                  <td className="px-4 py-2 font-mono-data">{m.tier ?? "—"}</td>
                  <td
                    className={`px-4 py-2 font-mono-data ${STATUS_TONE[m.status]}`}
                  >
                    {m.status}
                  </td>
                  <td className="px-4 py-2 font-mono-data tabular-nums">
                    {m.price_input_per_mtok != null &&
                    m.price_output_per_mtok != null
                      ? `${m.price_input_per_mtok}·${m.price_output_per_mtok} est.`
                      : "—"}
                  </td>
                  <td
                    className="px-4 py-2 text-on-surface-variant max-w-64 truncate"
                    title={m.benchmark_ref ?? undefined}
                  >
                    {m.benchmark_ref ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <ModelStatusControls
                      modelId={m.model_id}
                      status={m.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border border-outline-variant bg-surface-container-low px-4 py-3">
          <AddModelForm providers={providers.map((p) => p.name)} />
        </div>
      </section>

      <section className="space-y-2">
        <MastHead
          tone="tertiary"
          label={
            <span className="flex items-baseline gap-2">
              <span>Capability assignments</span>
              <span className="text-outline tabular-nums">
                · {String(capabilities.length).padStart(2, "0")}
              </span>
            </span>
          }
          meta={
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest hidden md:inline">
              An override wins over the map; absence means the ruled map governs
            </span>
          }
        />
        <div className="border border-outline-variant bg-surface-container-low overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono-label text-mono-label text-outline uppercase tracking-widest text-left">
                <th className="px-4 py-2">Capability</th>
                <th className="px-4 py-2">Map (ruled)</th>
                <th className="px-4 py-2">Override</th>
                <th className="px-4 py-2 text-right">Assign</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((capability) => {
                const mapDefault =
                  CAPABILITY_MODEL[capability as keyof typeof CAPABILITY_MODEL];
                const override = overrideByCapability.get(capability) ?? null;
                return (
                  <tr
                    key={capability}
                    className="border-t border-outline-variant"
                  >
                    <td className="px-4 py-2 font-mono-data">{capability}</td>
                    <td className="px-4 py-2 font-mono-data text-on-surface-variant">
                      {mapDefault}
                    </td>
                    <td className="px-4 py-2 font-mono-data">
                      {override ? (
                        <span className="text-primary">{override}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <AssignmentControls
                        capability={capability}
                        override={override}
                        mapDefault={mapDefault}
                        activeModels={activeModels}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {orphanAssignments.length > 0 && (
          <p className="border border-outline-variant bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            {orphanAssignments.length} assignment
            {orphanAssignments.length === 1 ? "" : "s"} name capabilities the
            code map has never heard of (inert — the resolver never asks for
            them):{" "}
            <span className="font-mono-data">
              {orphanAssignments.map((a) => a.capability).join(", ")}
            </span>
          </p>
        )}
      </section>
    </PageShell>
  );
}
