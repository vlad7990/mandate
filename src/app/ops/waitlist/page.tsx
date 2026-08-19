import { createServerSupabaseClient } from "@/lib/supabase-server";
import { WaitlistTable, type WaitlistRow } from "./waitlist-table";

export const metadata = {
  title: "Waitlist · Platform operations · Mandate",
};

/**
 * Mandate's own intake, relocated from /app/settings/waitlist to the
 * operator's house (D3). The layout has already required
 * platform:operate; the founder-only RLS on the table is the boundary
 * as ever. Triage is audited on the row itself (reviewed_by,
 * reviewed_at) — the deliberate exception to the org-trail rule,
 * pinned by operator_invariants (5): the waitlist belongs to no
 * organisation, so it has no org trail to land in.
 */
export default async function OpsWaitlistPage() {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error } = await supabase
    .from("waitlist")
    .select(
      "id, full_name, email, company, role, referral_source, use_case, status, notes, reviewed_by, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load waitlist: ${error.message}`);
  }

  const list = (rows ?? []) as WaitlistRow[];
  const counts = {
    pending: list.filter((r) => r.status === "pending").length,
    approved: list.filter((r) => r.status === "approved").length,
    rejected: list.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          Mandate{" // "}access requests
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Waitlist
        </h1>
        <p className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest tabular-nums flex items-center gap-3 flex-wrap">
          <span>
            <span className="text-primary">
              {String(counts.pending).padStart(2, "0")}
            </span>{" "}
            pending
          </span>
          <span className="text-outline-variant">·</span>
          <span>
            <span className="text-secondary-fixed-dim">
              {String(counts.approved).padStart(2, "0")}
            </span>{" "}
            approved
          </span>
          <span className="text-outline-variant">·</span>
          <span>
            <span className="text-error">
              {String(counts.rejected).padStart(2, "0")}
            </span>{" "}
            rejected
          </span>
        </p>
      </header>

      <WaitlistTable rows={list} />
    </div>
  );
}
