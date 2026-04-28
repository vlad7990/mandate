type TopbarProps = {
  workspaceLabel?: string;
  scope?: string;
};

export function Topbar({
  workspaceLabel = "MANDATE_CORE",
  scope = "PORTFOLIO",
}: TopbarProps) {
  return (
    <header className="flex justify-between items-center h-12 w-full px-6 bg-surface-container-low border-b border-outline-variant shrink-0">
      <div className="flex items-center gap-6">
        <span className="font-bold text-on-surface font-mono-label text-mono-label uppercase tracking-wider">
          {workspaceLabel} <span className="text-outline">//</span> {scope}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled
          title="Command line — coming soon"
          className="text-outline font-mono-label text-mono-label uppercase tracking-wider opacity-60 cursor-not-allowed"
        >
          COMMAND_LINE
        </button>
        <button
          type="button"
          disabled
          title="Export recap — coming soon"
          className="text-outline font-mono-label text-mono-label uppercase tracking-wider opacity-60 cursor-not-allowed"
        >
          EXPORT_RECAP
        </button>
        <div className="flex gap-2 ml-2">
          <span
            className="material-symbols-outlined text-outline opacity-60 text-lg"
            aria-hidden="true"
          >
            notifications_paused
          </span>
        </div>
      </div>
    </header>
  );
}
