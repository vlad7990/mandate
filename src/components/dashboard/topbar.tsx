type TopbarProps = {
  workspaceLabel?: string;
  scope?: string;
};

export function Topbar({
  workspaceLabel = "MANDATE_CORE",
  scope = "PORTFOLIO",
}: TopbarProps) {
  return (
    <header className="flex justify-between items-center h-10 w-full px-6 bg-surface-container-low border-b border-outline-variant shrink-0">
      <div className="flex items-center gap-3">
        <span
          className="w-1.5 h-1.5 rounded-full bg-secondary-fixed-dim animate-pulse shrink-0"
          aria-hidden
        />
        <span className="font-bold text-on-surface font-mono-label text-mono-label uppercase tracking-widest">
          {workspaceLabel}{" "}
          <span className="text-outline-variant" aria-hidden>
            {"//"}
          </span>{" "}
          <span className="text-primary">{scope}</span>
        </span>
        <span
          className="text-outline-variant"
          aria-hidden
        >
          ·
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          v.02.br
        </span>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled
          aria-label="Command line — coming soon"
          className="text-outline font-mono-label text-mono-label uppercase tracking-widest opacity-60 cursor-not-allowed flex items-center gap-1.5"
        >
          <span
            className="material-symbols-outlined text-[14px]"
            aria-hidden
          >
            terminal
          </span>
          Command_line
        </button>
        <button
          type="button"
          disabled
          aria-label="Export recap — coming soon"
          className="text-outline font-mono-label text-mono-label uppercase tracking-widest opacity-60 cursor-not-allowed flex items-center gap-1.5"
        >
          <span
            className="material-symbols-outlined text-[14px]"
            aria-hidden
          >
            ios_share
          </span>
          Export_recap
        </button>
        <span
          className="material-symbols-outlined text-outline opacity-60 text-[18px]"
          aria-hidden
        >
          notifications_paused
        </span>
      </div>
    </header>
  );
}
