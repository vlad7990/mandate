import Link from "next/link";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { IconArrowRight, IconInfo } from "@/components/icons";

export type ReportSourceState =
  | { kind: "approved"; version: number }
  | { kind: "draft"; version: number }
  | { kind: "missing" };

export type ReportSource = {
  label: string;
  /** What this record contributes to the document. */
  role: string;
  state: ReportSourceState;
  href: string;
};

/**
 * The gate. A report is compiled only from approved records, so when one is
 * missing the page names which one and links to it — it does not compile a
 * partial document and it does not describe the gap in the abstract.
 *
 * The same discipline as the report itself: a document that hides its own
 * incompleteness is worse than one that has none.
 */
export function ReportGate({
  searchId,
  candidateName,
  sources,
}: {
  searchId: string;
  candidateName: string;
  sources: ReportSource[];
}) {
  const outstanding = sources.filter((s) => s.state.kind !== "approved");
  const next = outstanding[0];

  return (
    <div className="mx-auto max-w-[780px] px-6 py-10">
      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: candidateName, href: `/app/executive-intelligence/searches/${searchId}/candidates` },
          { label: "Report" },
        ]}
      />

      <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight text-on-surface">
        Report not compiled
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-on-surface-variant">
        {outstanding.length === 1
          ? "One record is still outstanding. "
          : `${outstanding.length} records are still outstanding. `}
        The report for {candidateName} compiles the moment they are all
        approved — there is nothing else to run.
      </p>

      <ul className="mt-6 flex flex-col divide-y divide-outline-variant/60 rounded-[10px] border border-outline-variant bg-surface-container-low">
        {sources.map((s) => (
          <li key={s.label} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[15px] font-semibold leading-snug text-on-surface">
                {s.label}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-on-surface-variant">
                {s.role}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <span
                className={`font-mono-label text-[11px] font-bold uppercase tracking-[0.1em] ${
                  s.state.kind === "approved" ? "text-primary" : "text-outline"
                }`}
              >
                {s.state.kind === "approved"
                  ? `v${s.state.version} approved`
                  : s.state.kind === "draft"
                    ? `v${s.state.version} draft`
                    : "not started"}
              </span>
              {s.state.kind !== "approved" && (
                <Link
                  href={s.href}
                  className="flex items-center gap-1.5 font-mono-label text-[11px] font-bold uppercase tracking-[0.1em] text-primary hover:underline"
                >
                  {s.state.kind === "draft" ? "Review" : "Open"}
                  <IconArrowRight size={14} />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {next && (
        <p className="mt-5 text-[15px] leading-relaxed text-on-surface-variant">
          Next:{" "}
          <Link href={next.href} className="text-primary hover:underline">
            {next.state.kind === "draft"
              ? `review and approve the ${next.label.toLowerCase()}`
              : `create the ${next.label.toLowerCase()}`}
          </Link>
          .
        </p>
      )}

      <div className="mt-8 flex items-start gap-3 rounded-lg border border-outline-variant p-4">
        <IconInfo size={15} className="mt-0.5 shrink-0 text-outline" />
        <p className="text-[13px] leading-relaxed text-outline">
          Nothing is generated at read time and no part of the document is
          drafted by a model. It is assembled from the approved records, and
          the coverage figures are recomputed from the search&apos;s competency
          weights every time it is opened. You can see the finished document,
          including how it states where its own evidence is thin, in the{" "}
          <Link
            href="/app/executive-intelligence/searches/sample-northvale/candidates/sample-okonjo/report"
            className="text-primary hover:underline"
          >
            sample report
          </Link>
          .
        </p>
      </div>

      <Link
        href={`/app/executive-intelligence/searches/${searchId}`}
        className="mt-6 inline-block text-sm text-primary hover:underline"
      >
        Back to the search
      </Link>
    </div>
  );
}
