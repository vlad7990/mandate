import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { MastHead } from "@/components/ui/mast-head";
import { SetBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { getAccess } from "@/lib/auth/access";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  ROLE_LABELS,
  ROLE_SUMMARIES,
  can,
  type Capability,
} from "@/lib/auth/roles";
import { DASHBOARD_HOME } from "@/lib/routes";

/**
 * Where the proxy sends someone who lacks the capability a route requires.
 *
 * It tells them three things, because a bare "403" makes a colleague's link
 * look broken rather than restricted: what they tried to open, what their
 * role actually permits, and who can change it. The alternative — bouncing
 * silently to the portfolio — reads as a bug, and the person files it as one.
 *
 * Nothing here is secret. The capability names and the role matrix are the
 * product's own vocabulary, and hiding them would only stop the reader from
 * knowing what to ask their admin for.
 */

function isCapability(value: string | undefined): value is Capability {
  return !!value && (CAPABILITIES as readonly string[]).includes(value);
}

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ capability?: string; from?: string }>;
}) {
  const { capability, from } = await searchParams;
  const access = await getAccess();
  const role = access?.role ?? null;

  const required = isCapability(capability) ? capability : null;

  return (
    <PageShell width="reading" className="space-y-6">
      <SetBreadcrumbs crumbs={[{ label: "No access" }]} />

      <header className="space-y-2">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-error">
          ACCESS DENIED
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Your role does not open this screen
        </h1>
        {/*
          The path is echoed back deliberately: without it the reader cannot
          tell whether they were stopped at the link they clicked or bounced
          from somewhere else along the way.
        */}
        {from && (
          <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
            <span className="text-outline">REQUESTED{" // "}</span>
            <span className="text-on-surface-variant normal-case tracking-normal">
              {from}
            </span>
          </p>
        )}
      </header>

      <section className="space-y-3">
        <MastHead
          tone="error"
          label="REQUIRED"
          meta={required ? required : "UNKNOWN"}
        />
        <p className="text-body-main text-on-surface-variant">
          {required ? (
            <>
              This screen needs{" "}
              <span className="text-on-surface">
                {CAPABILITY_LABELS[required]}
              </span>
              . Your role does not carry it.
            </>
          ) : (
            <>This screen is not open to your role.</>
          )}
        </p>
      </section>

      <section className="space-y-3">
        <MastHead
          tone="neutral"
          label="YOUR ROLE"
          meta={role ? ROLE_LABELS[role].toUpperCase() : "NONE"}
        />
        {role ? (
          <>
            <p className="text-body-main text-on-surface-variant">
              {ROLE_SUMMARIES[role]}
            </p>
            <ul className="divide-y divide-outline-variant border border-outline-variant bg-surface-container-low">
              {CAPABILITIES.map((c) => {
                const held = can(role, c);
                return (
                  <li
                    key={c}
                    className="flex items-baseline gap-3 px-4 py-2.5 font-mono-label text-mono-label uppercase tracking-wider"
                  >
                    <span
                      className={
                        held ? "text-primary" : "text-outline"
                      }
                      aria-hidden="true"
                    >
                      {held ? "■" : "□"}
                    </span>
                    <span
                      className={
                        held ? "text-on-surface" : "text-outline line-through"
                      }
                    >
                      {CAPABILITY_LABELS[c]}
                    </span>
                    <span className="sr-only">
                      {held ? "granted" : "not granted"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          // Reachable when the account is pending or suspended — the layout
          // normally intercepts both, but a role that fails to parse lands
          // here too, and "no role" is the honest thing to show.
          <p className="text-body-main text-on-surface-variant">
            Your account does not currently carry a role. An admin in your
            organisation can assign one.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <MastHead tone="neutral" label="NEXT" />
        <p className="text-body-main text-on-surface-variant">
          An admin in your organisation can change your role from{" "}
          <span className="text-on-surface">Settings → Members</span>.
        </p>
        <Link
          href={DASHBOARD_HOME}
          className="inline-flex h-9 items-center gap-2 border border-outline-variant px-4 font-mono-label text-mono-label uppercase tracking-widest text-on-surface transition-colors hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {"←"} Back to portfolio
        </Link>
      </section>
    </PageShell>
  );
}
