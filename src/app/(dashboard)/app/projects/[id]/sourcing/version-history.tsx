"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SLOTS, type SlotKey } from "@/lib/ai/sourcing-analysis";
import { restoreQueryVersionAction } from "./actions";
import { IconHistory, IconRefresh } from "@/components/icons";
import { unwrap } from "@/lib/actions/result";

// Per-slot version history with side-by-side diff, term-level
// add/remove highlighting, restore-to-version, basic analytics
// (chars, words, complexity hint), and per-version performance
// (candidates added while that version was active).

export type SlotVersion = {
  rowId: string;
  version: number;
  content: string;
  updated_at: string;
  /** Candidates added while THIS version was the active one. */
  candidates_attributed: number;
};

export type SlotVersions = {
  slot: SlotKey;
  versions: SlotVersion[];
};

export function SourcingVersionHistory({
  projectId,
  slots,
}: {
  projectId: string;
  slots: SlotVersions[];
}) {
  const populated = slots.filter((s) => s.versions.length > 0);

  if (populated.length === 0) return null;

  return (
    <section className="bg-surface-container-low border border-outline-variant p-4 space-y-3">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <IconHistory size={14} />
          Version History
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {populated.reduce((acc, s) => acc + s.versions.length, 0)} total
          versions
        </span>
      </header>
      <ul className="space-y-3">
        {populated.map((s) => (
          <SlotHistory key={s.slot} projectId={projectId} state={s} />
        ))}
      </ul>
    </section>
  );
}

function SlotHistory({
  projectId,
  state,
}: {
  projectId: string;
  state: SlotVersions;
}) {
  const slotMeta = SLOTS.find((s) => s.key === state.slot);
  const versions = state.versions;
  const [comparedVersion, setComparedVersion] = useState<number>(
    versions.length > 1 ? versions[1].version : versions[0].version
  );
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = versions[0];
  const compared = versions.find((v) => v.version === comparedVersion) ?? current;

  // Best-performing version = most candidates_attributed; ties go to
  // the older version (earlier vintage proves the lift).
  const best = useMemo(() => {
    if (versions.length === 0) return null;
    return [...versions].sort((a, b) => {
      if (b.candidates_attributed !== a.candidates_attributed) {
        return b.candidates_attributed - a.candidates_attributed;
      }
      return a.version - b.version;
    })[0];
  }, [versions]);

  const handleRestore = (rowId: string, version: number) => {
    if (pending) return;
    if (
      !window.confirm(
        `Restore v${version} as the latest version of ${slotMeta?.label ?? state.slot}? The current version stays in history.`
      )
    ) {
      return;
    }
    start(async () => {
      try {
        const result = unwrap(await restoreQueryVersionAction(projectId, rowId));
        toast.success(`Restored — now at v${result.version}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Restore failed.");
      }
    });
  };

  return (
    <li className="bg-surface-container border border-outline-variant">
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest">
            {slotMeta?.label ?? state.slot}
          </span>
          <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
            {versions.length} version{versions.length === 1 ? "" : "s"}
          </span>
          {best && best.candidates_attributed > 0 && (
            <span className="px-1.5 py-0 border border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim font-mono-label text-mono-label uppercase tracking-widest">
              ★ Best: v{best.version} ({best.candidates_attributed} cands)
            </span>
          )}
        </div>
      </header>

      <div className="p-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <VersionPane
          title="Compared version"
          version={compared}
          analytics={analytics(compared.content)}
          versions={versions}
          onSelect={(v) => setComparedVersion(v)}
          onRestore={
            compared.version !== current.version
              ? () => handleRestore(compared.rowId, compared.version)
              : undefined
          }
          pending={pending}
        />
        <VersionPane
          title="Current"
          version={current}
          analytics={analytics(current.content)}
          versions={[current]}
          onSelect={() => {}}
          isCurrent
          pending={pending}
        />
      </div>

      <div className="border-t border-outline-variant px-3 py-2 space-y-1.5">
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Diff: v{compared.version} → v{current.version}
        </div>
        <DiffView before={compared.content} after={current.content} />
      </div>
    </li>
  );
}

function VersionPane({
  title,
  version,
  analytics,
  versions,
  onSelect,
  onRestore,
  isCurrent,
  pending,
}: {
  title: string;
  version: SlotVersion;
  analytics: QueryAnalytics;
  versions: SlotVersion[];
  onSelect: (v: number) => void;
  onRestore?: () => void;
  isCurrent?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className={cn(
        "border bg-surface-container-low p-3 space-y-2",
        isCurrent
          ? "border-primary-container/60"
          : "border-outline-variant"
      )}
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          {title}
        </div>
        {versions.length > 1 ? (
          <select
            value={version.version}
            onChange={(e) => onSelect(Number(e.target.value))}
            className="bg-surface-container-lowest border border-outline-variant px-2 py-1 font-mono-label text-mono-label uppercase tracking-widest text-on-surface focus:border-primary focus:outline-none transition-colors"
          >
            {versions.map((v) => (
              <option key={v.rowId} value={v.version}>
                v{String(v.version).padStart(2, "0")} ·{" "}
                {formatRelative(v.updated_at)}
                {v.candidates_attributed > 0
                  ? ` · ${v.candidates_attributed} cands`
                  : ""}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest tabular-nums">
            v{String(version.version).padStart(2, "0")}
          </span>
        )}
      </div>
      <pre className="bg-surface-container-lowest border border-outline-variant text-on-surface font-mono-data text-mono-data px-3 py-2 leading-relaxed whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
        {version.content || "(empty)"}
      </pre>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          {analytics.chars} chars · {analytics.words} terms ·{" "}
          <span className={analytics.complexity.tone}>
            {analytics.complexity.label}
          </span>
        </div>
        {onRestore && (
          <button
            type="button"
            onClick={onRestore}
            disabled={pending}
            className="px-2 py-1 border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary font-mono-label text-mono-label uppercase tracking-widest transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          >
            <IconRefresh size={12} className="mr-1" />
            Restore this version
          </button>
        )}
      </div>
    </div>
  );
}

function DiffView({ before, after }: { before: string; after: string }) {
  // Token-level diff over boolean operators + quoted phrases. We
  // treat each "word" or quoted run as an atom; runs split by AND /
  // OR / NOT / parens / quotes are good enough for these queries.
  const beforeTokens = tokenise(before);
  const afterTokens = tokenise(after);
  const beforeSet = new Set(beforeTokens.map((t) => t.toLowerCase()));
  const afterSet = new Set(afterTokens.map((t) => t.toLowerCase()));

  const added: string[] = [];
  const removed: string[] = [];
  for (const t of afterTokens) {
    if (!beforeSet.has(t.toLowerCase()) && !added.includes(t)) added.push(t);
  }
  for (const t of beforeTokens) {
    if (!afterSet.has(t.toLowerCase()) && !removed.includes(t)) removed.push(t);
  }

  if (added.length === 0 && removed.length === 0) {
    return (
      <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
        No term changes.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      <div className="space-y-1">
        <div className="font-mono-label text-mono-label text-secondary-fixed-dim uppercase tracking-widest">
          + Added ({added.length})
        </div>
        {added.length === 0 ? (
          <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
            None.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {added.map((t, i) => (
              <li
                key={i}
                className="px-1.5 py-0.5 border border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim font-mono-data text-mono-data"
              >
                + {t}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-1">
        <div className="font-mono-label text-mono-label text-error uppercase tracking-widest">
          − Removed ({removed.length})
        </div>
        {removed.length === 0 ? (
          <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
            None.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {removed.map((t, i) => (
              <li
                key={i}
                className="px-1.5 py-0.5 border border-error/60 bg-error/10 text-error font-mono-data text-mono-data line-through"
              >
                − {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function tokenise(content: string): string[] {
  // Split on whitespace and the boolean operators while keeping
  // quoted phrases as a single atom.
  const out: string[] = [];
  const re = /"[^"]*"|\(|\)|\bAND\b|\bOR\b|\bNOT\b|[^\s()]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const tok = m[0].trim();
    if (tok.length > 0) out.push(tok);
  }
  return out;
}

type QueryAnalytics = {
  chars: number;
  words: number;
  complexity: { label: string; tone: string };
};

function analytics(content: string): QueryAnalytics {
  const chars = content.length;
  const words = tokenise(content).filter(
    (t) => !["AND", "OR", "NOT", "(", ")"].includes(t.toUpperCase())
  ).length;
  const complexity = scoreComplexity(content, words);
  return { chars, words, complexity };
}

function scoreComplexity(
  content: string,
  words: number
): { label: string; tone: string } {
  // Heuristic: too narrow when many ANDs and few ORs; too broad
  // when only ORs / no constraints; balanced otherwise.
  const ands = (content.match(/\bAND\b/gi) ?? []).length;
  const ors = (content.match(/\bOR\b/gi) ?? []).length;
  const nots = (content.match(/\bNOT\b/gi) ?? []).length;
  if (words < 3) {
    return { label: "Likely too broad", tone: "text-tertiary" };
  }
  if (ands >= 4 && ors <= 1) {
    return { label: "Likely too narrow", tone: "text-error" };
  }
  if (ors >= 6 && ands === 0) {
    return { label: "Likely too broad", tone: "text-tertiary" };
  }
  if (nots >= 3) {
    return {
      label: "Heavy exclusions — verify intent",
      tone: "text-tertiary",
    };
  }
  return { label: "Balanced", tone: "text-secondary-fixed-dim" };
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}
