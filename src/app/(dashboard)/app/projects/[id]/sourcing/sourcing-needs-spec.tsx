import Link from "next/link";
import { IconArrowLeft, IconGlobe } from "@/components/icons";

/**
 * What a researcher sees when they open sourcing on a mandate whose spec is
 * not final.
 *
 * Sourcing is anchored on the FINAL job spec, so the route genuinely cannot
 * proceed. For anyone holding `mandates:write` the page redirects to /spec,
 * which is where the problem gets solved. A researcher cannot finalize a
 * spec, so that redirect used to land them on /app/no-access naming /spec —
 * a screen they never asked for, reporting a capability failure for what is
 * actually a state problem on the mandate.
 *
 * The distinction matters because the two have different fixes. "Your role
 * cannot open this" is answered by asking an admin for a different role.
 * "This mandate has no final spec yet" is answered by asking a recruiter to
 * finalize one, and the researcher's role is fine. The old message pointed
 * at the wrong one.
 *
 * Deliberately not a redirect to the mandate: the researcher asked for this
 * screen and is allowed on it, so this is the screen that should answer.
 */
export function SourcingNeedsSpec({
  projectId,
  roleTitle,
  companyName,
}: {
  projectId: string;
  roleTitle: string;
  companyName: string;
}) {
  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
        <div className="flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <Link
            href={`/app/projects/${projectId}`}
            prefetch={false}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <IconArrowLeft size={14} />
            Mandate
          </Link>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Sourcing</span>
        </div>

        <div className="bg-surface-container-low border border-outline-variant p-12 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-primary-container/10 border border-primary-container/40 flex items-center justify-center">
            <IconGlobe size={28} className="text-primary" />
          </div>

          <div className="space-y-2 max-w-md">
            <h1 className="font-h1 text-h1">Waiting on a final job spec</h1>
            <p className="text-body-main text-on-surface-variant">
              Sourcing queries are synthesised from the finalised spec for{" "}
              <span className="text-on-surface">{roleTitle}</span> @{" "}
              <span className="text-on-surface">{companyName}</span>, and this
              mandate does not have one yet.
            </p>
            {/*
              Names the role that can clear it rather than telling the reader
              to ask for a bigger one. Their role is not the problem here.
            */}
            <p className="text-body-main text-on-surface-variant">
              Finalising a spec is a recruiter or admin action. Once it is
              final this screen opens on its own — nothing is needed from you.
            </p>
          </div>

          <Link
            href={`/app/projects/${projectId}`}
            prefetch={false}
            className="px-8 py-3 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
          >
            Back to mandate
          </Link>

          <p className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
            Sourcing anchors on FINAL_V—— · nothing to generate yet
          </p>
        </div>
      </div>
    </div>
  );
}
