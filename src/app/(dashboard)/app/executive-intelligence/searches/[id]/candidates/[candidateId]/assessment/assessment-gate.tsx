import Link from "next/link";
import {
  IconArrowLeft,
  IconChecklist,
  IconLock,
} from "@/components/icons";

/**
 * Shown when an assessment can't be started yet because the candidate has no
 * approved interview plan. The assessment is structured ON the approved plan
 * (its stages and competencies), so this is a hard prerequisite, surfaced as
 * guidance rather than an error.
 */
export function AssessmentGate({
  searchId,
  candidateId,
  candidateName,
}: {
  searchId: string;
  candidateId: string;
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
            <IconArrowLeft size={14} />
            Candidates
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{candidateName}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">Assessment</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-surface-container-highest/40 border border-outline-variant flex items-center justify-center">
            <IconLock size={28} className="text-outline" />
          </div>
          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">Approve an interview plan first</h1>
            <p className="text-body-main text-on-surface-variant">
              An assessment records evidence against the interview plan&rsquo;s
              stages and the role&rsquo;s competency weights. Approve{" "}
              <span className="text-on-surface">{candidateName}</span>&rsquo;s
              interview plan, then return here to capture evidence.
            </p>
          </div>
          <Link
            href={`/app/executive-intelligence/searches/${searchId}/candidates/${candidateId}/interview-plan`}
            className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2"
          >
            <IconChecklist size={16} />
            Go to Interview Plan
          </Link>
        </div>
      </div>
    </div>
  );
}
