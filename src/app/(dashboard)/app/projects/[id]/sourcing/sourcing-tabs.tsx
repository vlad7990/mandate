import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  IconBuilding,
  IconCommit,
  IconNetwork,
  IconSearch,
  type IconProps,
} from "@/components/icons";

/**
 * Top-level tabs for the sourcing page.
 *
 * Driven by a search param rather than client state, so a tab is a real
 * address: the Runs tab can be linked to from a candidate's origin chip, from a
 * handoff, or from the browser's own history, and each tab keeps its server
 * rendering and its own Suspense boundary.
 */

export const SOURCING_TABS = [
  { key: "queries", label: "Queries", icon: IconSearch },
  { key: "runs", label: "Runs", icon: IconCommit },
  { key: "companies", label: "Target Companies", icon: IconBuilding },
  { key: "archetypes", label: "Archetypes", icon: IconNetwork },
] as const;

export type SourcingTab = (typeof SOURCING_TABS)[number]["key"];

export function resolveSourcingTab(value: string | undefined): SourcingTab {
  const match = SOURCING_TABS.find((t) => t.key === value);
  return match ? match.key : "queries";
}

export function SourcingTabs({
  projectId,
  active,
  runCount,
}: {
  projectId: string;
  active: SourcingTab;
  /** Shown on the Runs tab so the loop is visible without opening it. */
  runCount: number;
}) {
  return (
    <nav
      aria-label="Sourcing"
      className="max-w-7xl mx-auto px-6 pt-6 pb-3"
    >
      <ul className="flex border border-outline-variant w-fit max-w-full overflow-x-auto">
        {SOURCING_TABS.map((tab) => {
          const Icon: (props: IconProps) => React.ReactElement = tab.icon;
          const isActive = tab.key === active;
          return (
            <li key={tab.key} className="shrink-0">
              <Link
                href={`/app/projects/${projectId}/sourcing?tab=${tab.key}`}
                prefetch={false}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
                  isActive
                    ? "bg-primary-container text-on-primary-container"
                    : "bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                )}
              >
                <Icon size={14} />
                {tab.label}
                {tab.key === "runs" && runCount > 0 && (
                  <span className="tabular-nums opacity-70">{runCount}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
