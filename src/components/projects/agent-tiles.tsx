import { cn } from "@/lib/utils";

export type AgentTileState = "idle" | "active" | "complete" | "queued";

type AgentTileDef = {
  key: "intake" | "company_research" | "role_spec" | "calibration";
  name: string;
  shortLabel: string;
  icon: string;
  description: string;
};

export const AGENT_TILES: AgentTileDef[] = [
  {
    key: "intake",
    name: "Intake Agent",
    shortLabel: "INTAKE",
    icon: "input",
    description: "Decomposes role into structured fields.",
  },
  {
    key: "company_research",
    name: "Company Research",
    shortLabel: "RESEARCH",
    icon: "travel_explore",
    description: "Maps industry, business model, org context.",
  },
  {
    key: "role_spec",
    name: "Role Spec",
    shortLabel: "SPEC",
    icon: "description",
    description: "Generates the recruiter-editable job spec.",
  },
  {
    key: "calibration",
    name: "Calibration",
    shortLabel: "CALIBRATE",
    icon: "tune",
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
  states: Record<AgentTileDef["key"], AgentTileState>;
};

export function AgentTiles({ states }: AgentTilesProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {AGENT_TILES.map((agent) => {
        const state = states[agent.key];
        return (
          <div
            key={agent.key}
            className={cn(
              "p-4 border transition-all duration-300 rounded relative overflow-hidden",
              STATE_TONE[state]
            )}
          >
            {state === "active" && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
            <div className="flex items-center justify-between mb-3">
              <span
                className="material-symbols-outlined text-xl"
                style={
                  state === "active" || state === "complete"
                    ? { fontVariationSettings: "'FILL' 1" }
                    : undefined
                }
              >
                {agent.icon}
              </span>
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
          </div>
        );
      })}
    </div>
  );
}
