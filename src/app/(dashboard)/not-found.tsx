import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";

/**
 * Dashboard 404. Several pages call `notFound()` when a project, search,
 * or candidate id doesn't resolve under the caller's org — without this
 * file those all rendered Next's default page, outside the shell, which
 * reads as "the app is broken" rather than "that record isn't yours".
 *
 * The wording deliberately does not distinguish "does not exist" from
 * "not accessible to you": RLS scopes reads by organization, and saying
 * which of the two happened would confirm the existence of another org's
 * record to someone probing ids.
 */
export default function DashboardNotFound() {
  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="mx-auto max-w-2xl space-y-8 px-8 py-16">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-outline" />
            <span className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
              404
            </span>
          </div>
          <h1 className="font-h1 text-h1">Not found</h1>
          <p className="max-w-xl text-body-main text-on-surface-variant">
            This page doesn&apos;t exist, or the record it points to isn&apos;t
            available to your organization.
          </p>
        </header>

        <Link
          href="/app/home"
          className="inline-flex items-center gap-2 border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary"
        >
          <IconArrowLeft size={14} />
          Back to portfolio
        </Link>
      </div>
    </div>
  );
}
