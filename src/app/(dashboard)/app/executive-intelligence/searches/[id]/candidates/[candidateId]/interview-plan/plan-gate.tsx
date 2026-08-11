import Link from "next/link";

/**
 * Shown when an interview plan can't be generated yet because the search has
 * no approved success profile. The plan is built ON the approved profile, so
 * this is a hard prerequisite, surfaced as guidance rather than an error.
 */
export function PlanGate({
  searchId,
  candidateName,
}: {
  searchId: string;
  candidateName: string;
}) {
  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/executive-intelligence/searches/${searchId}/candidates`}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{candidateName}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Interview Plan</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-surface-container-highest/40 border border-outline-variant flex items-center justify-center">
            <span className="material-symbols-outlined text-[28px] text-outline">
              lock
            </span>
          </div>
          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">Approve a Success Profile first</h1>
            <p className="text-body-main text-on-surface-variant">
              An interview plan is built from the search&rsquo;s approved Executive
              Success Profile and its competency weights. Generate and approve a
              success profile, then return here to build{" "}
              <span className="text-on-surface">{candidateName}</span>&rsquo;s
              interview plan.
            </p>
          </div>
          <Link
            href={`/app/executive-intelligence/searches/${searchId}/success-profile`}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">architecture</span>
            Go to Success Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
