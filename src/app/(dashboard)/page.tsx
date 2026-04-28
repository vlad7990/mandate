import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type ProjectRow = {
  id: string;
  title: string;
  company_name: string;
  status: string | null;
  created_at: string | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-secondary/10 text-secondary border-secondary/30",
  paused: "bg-tertiary/10 text-tertiary border-tertiary/30",
  closed: "bg-outline/10 text-outline border-outline-variant",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).toUpperCase();
}

function tone(status: string | null) {
  if (!status) return STATUS_TONE.active;
  return STATUS_TONE[status.toLowerCase()] ?? STATUS_TONE.active;
}

export default async function DashboardHomePage() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, company_name, status, created_at")
    .order("created_at", { ascending: false });

  const projects: ProjectRow[] = data ?? [];
  const projectCount = projects.length;
  const activeCount = projects.filter((p) => (p.status ?? "active") === "active").length;

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {error && (
        <div className="col-span-12 border border-error/40 bg-error-container/30 text-error px-4 py-3 rounded text-body-main">
          Could not load projects: {error.message}
        </div>
      )}

      <KpiRow projectCount={projectCount} activeCount={activeCount} />

      <div className="col-span-12 flex justify-between items-center pt-2">
        <div className="flex items-center gap-3">
          <h2 className="font-h2 text-h2 text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">leaderboard</span>
            ACTIVE_MANDATES
          </h2>
          <span className="px-2 py-0.5 border border-outline-variant font-mono-label text-mono-label text-outline tracking-wider">
            N={projectCount}
          </span>
        </div>
        <Link
          href="/projects/new"
          className="bg-primary-container text-on-primary-container px-4 py-2 rounded font-mono-label text-mono-label uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Search
        </Link>
      </div>

      {projectCount === 0 ? <EmptyState /> : <ProjectsTable projects={projects} />}
    </div>
  );
}

function KpiRow({
  projectCount,
  activeCount,
}: {
  projectCount: number;
  activeCount: number;
}) {
  return (
    <div className="col-span-12 grid grid-cols-1 md:grid-cols-4 gap-4">
      <KpiTile
        label="ACTIVE SEARCHES"
        value={projectCount.toString().padStart(2, "0")}
        unit="OPEN MANDATES"
        accent="primary"
      />
      <KpiTile
        label="PIPELINE VELOCITY"
        value="—"
        unit="CANDIDATES / WEEK"
      />
      <KpiTile
        label="HM FEEDBACK ROUNDS"
        value="—"
        unit="LAST 30D"
      />
      <KpiTile
        label="ON-TRACK"
        value={activeCount.toString().padStart(2, "0")}
        unit="HEALTHY"
        accent="secondary"
      />
    </div>
  );
}

function KpiTile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: "primary" | "secondary";
}) {
  const accentClass =
    accent === "primary"
      ? "text-primary"
      : accent === "secondary"
        ? "text-secondary"
        : "text-on-surface";
  return (
    <div className="bg-surface-container-low border border-outline-variant p-3 flex flex-col justify-between min-h-[96px] rounded">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono-data text-2xl ${accentClass}`}>{value}</span>
        <span className="text-[10px] text-outline font-mono uppercase tracking-tighter">
          {unit}
        </span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-12 flex items-center justify-center min-h-[420px] bg-surface-container-low border border-outline-variant rounded relative overflow-hidden">
      <div className="absolute inset-0 terminal-grid opacity-10 pointer-events-none" />
      <div className="text-center max-w-md p-8 relative z-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded border border-outline-variant bg-surface-container mb-6">
          <span className="material-symbols-outlined text-outline text-3xl">
            radar
          </span>
        </div>
        <h3 className="font-h2 text-h2 text-on-surface mb-3">
          No active mandates yet.
        </h3>
        <p className="text-on-surface-variant font-body-main mb-6">
          Initialize a search to deploy the agent stack.
        </p>
        <Link
          href="/projects/new"
          className="bg-primary-container text-on-primary-container px-4 py-2 rounded font-mono-label text-mono-label uppercase tracking-wider hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Search
        </Link>
      </div>
    </div>
  );
}

function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="col-span-12 bg-surface-container-low border border-outline-variant rounded overflow-hidden">
      <div className="p-3 border-b border-outline-variant flex justify-between items-center bg-surface-container">
        <h3 className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          MANDATE_PIPELINE
        </h3>
        <span className="px-2 py-0.5 border border-outline-variant font-mono-label text-mono-label text-outline tracking-wider">
          SORT: NEWEST
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-container-high">
            <tr className="font-mono-label text-mono-label text-outline border-b border-outline-variant uppercase tracking-wider">
              <th className="p-3 w-12">#</th>
              <th className="p-3">TITLE / COMPANY</th>
              <th className="p-3 w-32">STATUS</th>
              <th className="p-3 w-28">CREATED</th>
              <th className="p-3 w-28 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="font-mono-data">
            {projects.map((p, i) => {
              const status = (p.status ?? "active").toLowerCase();
              return (
                <tr
                  key={p.id}
                  className="border-b border-outline-variant/40 hover:bg-surface-container/40 transition-colors group"
                >
                  <td className="p-3 text-primary font-bold">
                    {(i + 1).toString().padStart(2, "0")}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="block hover:text-primary transition-colors"
                    >
                      <div className="text-on-surface font-bold uppercase">
                        {p.title}
                      </div>
                      <div className="text-mono-label text-outline mt-0.5">
                        {p.company_name}
                      </div>
                    </Link>
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-1.5 py-0.5 text-[9px] uppercase font-bold border ${tone(p.status)}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="p-3 text-on-surface-variant text-mono-label">
                    {formatDate(p.created_at)}
                  </td>
                  <td className="p-3 text-right">
                    <Link
                      href={`/projects/${p.id}`}
                      aria-label={`Open ${p.title}`}
                      className="opacity-0 group-hover:opacity-100 material-symbols-outlined text-outline hover:text-primary transition-opacity"
                    >
                      open_in_new
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
