import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconArrowRight } from "@/components/icons";

export type AgentTileState = "idle" | "active" | "complete" | "queued";

export type AgentTileKey =
  | "intake"
  | "company_research"
  | "role_spec"
  | "calibration";

type AgentTileDef = {
  key: AgentTileKey;
  name: string;
  shortLabel: string;
  description: string;
};

export type AgentTileAction = {
  label: string;
  href: string;
  enabled: boolean;
  /** Optional copy shown when enabled is false (explains the prerequisite). */
  disabledHint?: string;
};

export const AGENT_TILES: AgentTileDef[] = [
  {
    key: "intake",
    name: "Intake Agent",
    shortLabel: "INTAKE",
    description: "Decomposes role into structured fields.",
  },
  {
    key: "company_research",
    name: "Company Research",
    shortLabel: "RESEARCH",
    description: "Maps industry, business model, org context.",
  },
  {
    key: "role_spec",
    name: "Role Spec",
    shortLabel: "SPEC",
    description: "Generates the recruiter-editable job spec.",
  },
  {
    key: "calibration",
    name: "Calibration",
    shortLabel: "CALIBRATE",
    description: "Builds the multi-dimension scoring model.",
  },
];

const STATE_TONE: Record<AgentTileState, string> = {
  idle: "border-outline-variant bg-surface-container-low text-on-surface-variant",
  active:
    "border-primary-container bg-primary-container/10 text-primary shadow-[0_0_15px_rgba(37,99,235,0.15)]",
  complete: "border-secondary/40 bg-secondary/5 text-secondary",
  queued: "border-outline-variant/60 bg-surface-container-lowest text-outline",
};

const STATE_LABEL: Record<AgentTileState, string> = {
  idle: "STAND-BY",
  active: "ACTIVE",
  complete: "COMPLETE",
  queued: "QUEUED",
};

type AgentTilesProps = {
  states: Record<AgentTileKey, AgentTileState>;
  /** Optional per-tile CTA. Hidden when not provided. */
  actions?: Partial<Record<AgentTileKey, AgentTileAction>>;
};

export function AgentTiles({ states, actions }: AgentTilesProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {AGENT_TILES.map((agent) => {
        const state = states[agent.key];
        const action = actions?.[agent.key];
        return (
          <div
            key={agent.key}
            className={cn(
              "p-4 border transition-all duration-300 rounded relative overflow-hidden flex flex-col",
              STATE_TONE[state]
            )}
          >
            {/* The tile's glyph is gone: it printed a ligature next to
                agent.shortLabel two lines below, which already names the
                agent. The state label keeps the row.

                The live dot is inline rather than `absolute top-2 right-2`.
                Pinned to the corner it sat hard against the top-right of
                the state label — the label's content box ends exactly where
                the dot's begins, so "ACTIVE" and the dot collided at every
                width. Inline, the flex gap keeps them apart and the pair
                reads as one unit. Same idiom as StatusChip's `dot`. */}
            <div className="flex items-center justify-end gap-1.5 mb-3">
              {state === "active" && (
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              )}
              <span className="font-mono-label text-mono-label uppercase tracking-wider">
                {STATE_LABEL[state]}
              </span>
            </div>
            <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider mb-1">
              {agent.shortLabel}
            </div>
            <div className="text-on-surface text-body-main font-semibold mb-1">
              {agent.name}
            </div>
            <div className="text-outline text-mono-label font-mono-label leading-snug">
              {agent.description}
            </div>
            {action && <TileAction action={action} />}
          </div>
        );
      })}
    </div>
  );
}

function TileAction({ action }: { action: AgentTileAction }) {
  if (!action.enabled) {
    return (
      <div className="mt-3 pt-3 border-t border-current/20 space-y-1">
        <span
          aria-disabled="true"
          className="block px-3 py-2 border border-current/30 font-mono-label text-mono-label uppercase tracking-widest text-current opacity-60 cursor-not-allowed text-center"
        >
          {action.label}
        </span>
        {action.disabledHint && (
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider block text-center">
            {action.disabledHint}
          </span>
        )}
      </div>
    );
  }
  return (
    <Link
      href={action.href}
      // Prefetch is disabled defensively: tile actions are CTAs into hero
      // routes, some of which have explicit-mutation entry points (e.g.
      // /spec). Prefetching would hit the GET render path for every tile
      // visible in the dashboard, which is wasteful and hard to reason
      // about as side effects accrue.
      prefetch={false}
      className="mt-3 pt-3 border-t border-current/20 px-3 py-2 -mx-1 font-mono-label text-mono-label uppercase tracking-widest text-current hover:bg-current/5 transition-colors flex items-center justify-between gap-2"
    >
      {action.label}
      <IconArrowRight size={14} />
    </Link>
  );
}
