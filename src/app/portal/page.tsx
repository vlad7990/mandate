import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requirePortalAccess } from "@/lib/auth/portal-access";

/**
 * The portal home: every search this principal can see, which is the D2
 * conjunction evaluated in-database by `portal_list_mandates` — shared
 * with the company, and (for a hiring manager) individually granted.
 */

type MandateRow = {
  project_id: string;
  title: string;
  status: string | null;
  shared_at: string;
  my_last_submission_at: string | null;
};

export default async function PortalHomePage() {
  const access = await requirePortalAccess();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("portal_list_mandates");
  if (error) {
    console.error("[portal] mandate list failed", error);
  }
  const mandates = (data ?? []) as MandateRow[];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          {access.clientName}{" // "}shared searches
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Your searches
        </h1>
        <p className="text-body-main text-on-surface-variant">
          {access.role === "hiring_manager"
            ? "The searches you have been given access to. Open one to review the slate and give feedback."
            : `Every search ${access.organizationName} has shared with ${access.clientName}. Open one to review the slate and give feedback.`}
        </p>
      </header>

      {mandates.length === 0 ? (
        <EmptyState clientName={access.clientName} />
      ) : (
        <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container">
          {mandates.map((m) => (
            <li key={m.project_id}>
              <Link
                href={`/portal/mandates/${m.project_id}`}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-surface-container-high"
              >
                <span className="font-medium text-on-surface">{m.title}</span>
                <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                  {m.status ?? "active"}
                </span>
                <span className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                  {m.my_last_submission_at
                    ? `Feedback sent ${formatDate(m.my_last_submission_at)}`
                    : "Awaiting your feedback"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The pre-share state, with sample rows so the first visit shows what the
 * screen becomes — labelled per the house rule that non-real data always
 * says so at the point of display.
 */
function EmptyState({ clientName }: { clientName: string }) {
  return (
    <div className="space-y-3">
      <div className="border border-outline-variant bg-surface-container px-5 py-4">
        <p className="text-body-main text-on-surface-variant">
          Nothing has been shared with {clientName} yet. When your search team
          shares a mandate, it appears here and you&apos;ll review its
          candidate slate below.
        </p>
      </div>
      <div className="relative border border-dashed border-outline-variant">
        <p className="border-b border-dashed border-outline-variant px-5 py-2 font-mono-label text-mono-label uppercase tracking-widest text-tertiary">
          Sample data — how shared searches will appear
        </p>
        <ul className="divide-y divide-outline-variant opacity-60">
          {[
            { title: "Chief Technology Officer", status: "active", note: "Awaiting your feedback" },
            { title: "VP Engineering", status: "shortlist", note: "Feedback sent 12 Aug 2026" },
          ].map((m) => (
            <li
              key={m.title}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4"
            >
              <span className="font-medium text-on-surface">{m.title}</span>
              <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
                {m.status}
              </span>
              <span className="ml-auto font-mono-label text-mono-label uppercase tracking-wider text-on-surface-variant">
                {m.note}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
