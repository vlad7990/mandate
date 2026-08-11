import Link from "next/link";
import { isSampleId } from "@/lib/sample";
import { SampleEiReport } from "@/components/sample/sample-ei-report";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";

export const metadata = { title: "Executive Intelligence report" };

/**
 * The Executive Intelligence report — comp 12.
 *
 * This route did not exist. The comp is the artifact the diligence chain
 * builds toward, so the route is created here with the sample rendered
 * in full.
 *
 * For a real search the report is **not compiled yet**. Assembling it
 * needs the approved success profile, the approved interview plan and
 * the approved assessment joined and rendered, with coverage recomputed
 * server-side — real work that has to be verified against a real search
 * before it is trusted, because this document goes to a client.
 *
 * Rather than render a plausible-looking document from partial data,
 * this states the gate and names what unlocks it. That is the same rule
 * the workspace follows for its locked steps, and the same reason the
 * report itself has a "where evidence is thin" section: a document that
 * hides its own incompleteness is worse than one that has none.
 */
export default async function EiReportPage({
  params,
}: {
  params: Promise<{ id: string; candidateId: string }>;
}) {
  const { id, candidateId } = await params;

  if (isSampleId(id) && isSampleId(candidateId)) {
    return <SampleEiReport searchId={id} />;
  }

  return (
    <div className="mx-auto max-w-[780px] px-6 py-10">
      <SetBreadcrumbs
        crumbs={[
          { label: "Executive Intelligence", href: "/app/executive-intelligence" },
          { label: "Report" },
        ]}
      />

      <h1 className="text-2xl font-bold tracking-tight text-on-surface">
        Report not compiled
      </h1>

      <div className="mt-5 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6">
        <p className="text-[15px] leading-relaxed text-on-surface-variant">
          An Executive Intelligence report is assembled only from approved
          records — the success profile, the interview plan, and a human-authored
          assessment. Compiling it for a real search is not wired up in this
          build yet.
        </p>
        <p className="mt-3.5 text-[15px] leading-relaxed text-on-surface-variant">
          You can see the finished document, including how it states where its
          own evidence is thin, in the{" "}
          <Link
            href="/app/executive-intelligence/searches/sample-northvale/candidates/sample-okonjo/report"
            className="text-primary hover:underline"
          >
            sample report
          </Link>
          .
        </p>
        <p className="mt-5 border-t border-outline-variant/60 pt-4 text-xs leading-relaxed text-outline">
          Nothing is generated at read time. When this is wired, regenerating
          will produce the same document unless an underlying artifact is
          re-approved at a new version.
        </p>
      </div>

      <Link
        href={`/app/executive-intelligence/searches/${id}`}
        className="mt-6 inline-block text-sm text-primary hover:underline"
      >
        Back to the search
      </Link>
    </div>
  );
}
