import { AgentTiles, AGENT_TILES, type AgentTileState } from "@/components/projects/agent-tiles";
import { NewSearchForm } from "./new-search-form";

type SearchParams = Promise<{ error?: string; q?: string }>;

const IDLE_STATES = Object.fromEntries(
  AGENT_TILES.map((a) => [a.key, "idle" as AgentTileState])
) as Record<(typeof AGENT_TILES)[number]["key"], AgentTileState>;

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, q } = await searchParams;

  return (
    <div className="relative min-h-full p-6 terminal-grid">
      <div className="max-w-4xl mx-auto pt-6 space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-1 bg-primary rounded-full" />
            <span className="w-2 h-1 bg-surface-container-highest rounded-full" />
            <span className="w-2 h-1 bg-surface-container-highest rounded-full" />
            <span className="w-2 h-1 bg-surface-container-highest rounded-full" />
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider ml-2">
              Step 1: Identity
            </span>
          </div>
          <h1 className="font-h2 text-h2 text-on-surface">Initialize New Mandate</h1>
          <p className="text-on-surface-variant font-body-main max-w-xl">
            Describe the role in one line. The agent stack will decompose it into a
            structured search — role spec, calibration weights, company intel — within seconds.
          </p>
        </header>

        {error && (
          <div className="border border-error/40 bg-error-container/30 px-4 py-3 rounded text-error text-body-main">
            {error}
          </div>
        )}

        <NewSearchForm defaultValue={q ?? ""} />

        <section className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono-label text-mono-label text-outline uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[14px]">robot_2</span>
              Agent Stack — Stand-by
            </h2>
            <span className="font-mono-label text-mono-label text-outline">
              4 / 14 agents will activate on submit
            </span>
          </div>
          <AgentTiles states={IDLE_STATES} />
        </section>
      </div>
    </div>
  );
}
