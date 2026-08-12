"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  SECTION_DEFS,
  type JobSpecSections,
  type SectionKey,
} from "@/lib/ai/job-spec-analysis";
import { IconArrowRight, IconDiff } from "@/components/icons";

// Visual diff comparison panel rendered below the spec editor. Lets
// the recruiter pick any two versions, see the section-by-section
// word-level diff, and read a summary header. The "current vs final"
// view is the default selection so divergence from the approved spec
// is always one click away.

export type SpecVersionPayload = {
  id: string;
  version: number;
  is_final: boolean;
  updated_at: string;
  created_at: string | null;
  created_by_name: string | null;
  sections: JobSpecSections;
};

export function SpecDiffPanel({
  versions,
  currentSpecId,
}: {
  versions: SpecVersionPayload[];
  currentSpecId: string;
}) {
  // Versions arrive sorted by version desc. Default A=current spec,
  // B=final (or the next-newest version when no final exists).
  const sortedDesc = useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );
  const sortedAsc = useMemo(
    () => [...versions].sort((a, b) => a.version - b.version),
    [versions]
  );

  const current = sortedDesc.find((v) => v.id === currentSpecId) ?? sortedDesc[0];
  const final = sortedDesc.find((v) => v.is_final) ?? null;

  const [aId, setAId] = useState<string>(
    final?.id ?? sortedDesc[1]?.id ?? current?.id ?? ""
  );
  const [bId, setBId] = useState<string>(current?.id ?? "");

  // Resolve A/B from the picker state. Falling back to `current` keeps
  // the type narrow for the memo below; the !current guard returns
  // null after the hook so the hook order stays stable.
  const a = sortedDesc.find((v) => v.id === aId) ?? current ?? sortedDesc[0];
  const b = sortedDesc.find((v) => v.id === bId) ?? current ?? sortedDesc[0];

  const summary = useMemo(
    () => (a && b ? buildSummary(a.sections, b.sections) : null),
    [a, b]
  );

  if (!current || versions.length === 0 || !a || !b || !summary) return null;

  return (
    <section className="bg-surface-container-low border border-outline-variant p-4 space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <IconDiff size={14} />
          Version Diff
        </h3>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
          v{a.version} → v{b.version}
          {summary.totalChangedSections === 0 ? (
            <span className="text-secondary-fixed-dim ml-2">
              · No section changes
            </span>
          ) : (
            <span className="text-tertiary ml-2">
              · {summary.totalChangedSections} section
              {summary.totalChangedSections === 1 ? "" : "s"} changed ·
              {" "}
              <span className="text-secondary-fixed-dim">+{summary.totalAdded}</span>{" "}
              /{" "}
              <span className="text-error">−{summary.totalRemoved}</span>{" "}
              terms
            </span>
          )}
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <VersionPicker
          label="Compare from"
          value={aId}
          versions={sortedDesc}
          onChange={setAId}
        />
        <VersionPicker
          label="Compare to"
          value={bId}
          versions={sortedDesc}
          onChange={setBId}
        />
      </div>

      <SectionsDiffView a={a.sections} b={b.sections} />

      <Timeline
        versions={sortedAsc}
        currentSpecId={currentSpecId}
        onSelectA={setAId}
        onSelectB={setBId}
        aId={aId}
        bId={bId}
      />

      {final && current.id !== final.id && (
        <DivergenceCallout
          current={current}
          final={final}
          onCompareCurrentVsFinal={() => {
            setAId(final.id);
            setBId(current.id);
          }}
        />
      )}
    </section>
  );
}

function VersionPicker({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string;
  versions: SpecVersionPayload[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-container-lowest border border-outline-variant px-2 py-1.5 text-on-surface focus:border-primary focus:outline-none transition-colors"
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            v{String(v.version).padStart(2, "0")}
            {v.is_final ? " · FINAL" : ""}
            {" · "}
            {formatDate(v.updated_at)}
            {v.created_by_name ? ` · ${v.created_by_name}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionsDiffView({
  a,
  b,
}: {
  a: JobSpecSections;
  b: JobSpecSections;
}) {
  return (
    <ul className="space-y-3">
      {SECTION_DEFS.map((def) => {
        const aText = sectionToText(a, def.key);
        const bText = sectionToText(b, def.key);
        const wordDelta = wordCount(bText) - wordCount(aText);
        const tokens = wordDiff(aText, bText);
        const changed = tokens.some((t) => t.kind !== "same");

        return (
          <li key={def.key}>
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h4 className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest">
                {def.label}
              </h4>
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest tabular-nums">
                {changed ? (
                  <>
                    <span
                      className={cn(
                        wordDelta > 0
                          ? "text-secondary-fixed-dim"
                          : wordDelta < 0
                            ? "text-error"
                            : "text-on-surface-variant"
                      )}
                    >
                      {wordDelta > 0 ? "+" : ""}
                      {wordDelta} words
                    </span>
                  </>
                ) : (
                  <span className="text-secondary-fixed-dim">No change</span>
                )}
              </span>
            </div>
            <pre className="bg-surface-container-lowest border border-outline-variant text-body-main text-on-surface font-mono-data px-3 py-2 mt-1 leading-relaxed whitespace-pre-wrap break-words">
              {tokens.map((t, i) => (
                <span
                  key={i}
                  className={
                    t.kind === "added"
                      ? "bg-secondary-fixed-dim/15 text-secondary-fixed-dim px-0.5"
                      : t.kind === "removed"
                        ? "bg-error/15 text-error px-0.5 line-through"
                        : ""
                  }
                >
                  {t.text}
                </span>
              ))}
            </pre>
          </li>
        );
      })}
    </ul>
  );
}

function Timeline({
  versions,
  currentSpecId,
  onSelectA,
  onSelectB,
  aId,
  bId,
}: {
  versions: SpecVersionPayload[];
  currentSpecId: string;
  onSelectA: (id: string) => void;
  onSelectB: (id: string) => void;
  aId: string;
  bId: string;
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        Version timeline
      </div>
      <ol className="border-l-2 border-outline-variant ml-3 space-y-2 pl-4">
        {versions.map((v) => {
          const isCurrent = v.id === currentSpecId;
          const isA = v.id === aId;
          const isB = v.id === bId;
          return (
            <li key={v.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[1.42rem] top-1 w-3 h-3 rounded-full border-2",
                  v.is_final
                    ? "bg-secondary-fixed-dim border-secondary-fixed-dim"
                    : isCurrent
                      ? "bg-primary border-primary"
                      : "bg-surface-container border-outline"
                )}
                aria-hidden
              />
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono-label text-mono-label text-on-surface uppercase tracking-widest tabular-nums">
                  v{String(v.version).padStart(2, "0")}
                </span>
                {v.is_final && (
                  <span className="px-1.5 py-0 border border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim font-mono-label text-mono-label uppercase tracking-widest">
                    FINAL
                  </span>
                )}
                {isCurrent && !v.is_final && (
                  <span className="px-1.5 py-0 border border-primary-container/60 bg-primary-container/10 text-primary font-mono-label text-mono-label uppercase tracking-widest">
                    CURRENT
                  </span>
                )}
                <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                  {v.created_by_name ?? "Unknown"} ·{" "}
                  {formatDate(v.updated_at)}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectA(v.id)}
                    className={cn(
                      "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors",
                      isA
                        ? "border-primary bg-primary-container/15 text-primary"
                        : "border-outline-variant text-outline hover:border-primary hover:text-primary"
                    )}
                  >
                    Set A
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectB(v.id)}
                    className={cn(
                      "px-2 py-0.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors",
                      isB
                        ? "border-primary bg-primary-container/15 text-primary"
                        : "border-outline-variant text-outline hover:border-primary hover:text-primary"
                    )}
                  >
                    Set B
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DivergenceCallout({
  current,
  final,
  onCompareCurrentVsFinal,
}: {
  current: SpecVersionPayload;
  final: SpecVersionPayload;
  onCompareCurrentVsFinal: () => void;
}) {
  const summary = useMemo(
    () => buildSummary(final.sections, current.sections),
    [final, current]
  );
  const totalDelta = summary.totalAdded + summary.totalRemoved;
  const tone =
    totalDelta === 0
      ? "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim"
      : totalDelta < 30
        ? "border-primary-container/60 bg-primary-container/10 text-primary"
        : "border-tertiary/60 bg-tertiary/10 text-tertiary";

  return (
    <div className={cn("border-l-2 px-3 py-2 flex items-baseline justify-between gap-2 flex-wrap", tone)}>
      <span className="font-mono-label text-mono-label uppercase tracking-widest">
        {totalDelta === 0
          ? "Current draft matches the final spec exactly."
          : `Current draft diverges from the final spec by ${totalDelta} term${totalDelta === 1 ? "" : "s"}.`}
      </span>
      <button
        type="button"
        onClick={onCompareCurrentVsFinal}
        className="font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 transition-colors flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Compare current vs final
        <IconArrowRight size={12} />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Diff utilities — word-level using a tiny LCS implementation
// ────────────────────────────────────────────────────────────────────────

type DiffToken = { kind: "same" | "added" | "removed"; text: string };

function wordDiff(before: string, after: string): DiffToken[] {
  // Tokenise on whitespace boundaries but PRESERVE the whitespace so
  // the rendered diff still reads as prose. Each token is either a
  // word or a whitespace run.
  const beforeTokens = tokensWithWhitespace(before);
  const afterTokens = tokensWithWhitespace(after);

  // Standard LCS over the trimmed comparable form so whitespace
  // doesn't cause spurious diffs.
  const a = beforeTokens.map((t) => t.toLowerCase());
  const b = afterTokens.map((t) => t.toLowerCase());

  const lcs = lcsMatrix(a, b);
  const out: DiffToken[] = [];

  let i = a.length;
  let j = b.length;
  const reversed: DiffToken[] = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      reversed.push({ kind: "same", text: afterTokens[j - 1] });
      i -= 1;
      j -= 1;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      reversed.push({ kind: "removed", text: beforeTokens[i - 1] });
      i -= 1;
    } else {
      reversed.push({ kind: "added", text: afterTokens[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    reversed.push({ kind: "removed", text: beforeTokens[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    reversed.push({ kind: "added", text: afterTokens[j - 1] });
    j -= 1;
  }
  for (let k = reversed.length - 1; k >= 0; k -= 1) {
    out.push(reversed[k]);
  }
  return collapseAdjacent(out);
}

function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const matrix: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      matrix[i][j] =
        a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1] + 1
          : Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }
  return matrix;
}

function tokensWithWhitespace(s: string): string[] {
  // Split by non-empty runs of word characters vs whitespace runs.
  const out: string[] = [];
  const re = /(\s+|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function collapseAdjacent(tokens: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last.kind === t.kind) {
      last.text += t.text;
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

function sectionToText(sections: JobSpecSections, key: SectionKey): string {
  const value = sections[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  return "";
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function buildSummary(
  a: JobSpecSections,
  b: JobSpecSections
): {
  totalChangedSections: number;
  totalAdded: number;
  totalRemoved: number;
} {
  let totalChangedSections = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  for (const def of SECTION_DEFS) {
    const aText = sectionToText(a, def.key);
    const bText = sectionToText(b, def.key);
    if (aText.trim() === bText.trim()) continue;
    totalChangedSections += 1;
    const tokens = wordDiff(aText, bText);
    for (const t of tokens) {
      if (t.kind === "added")
        totalAdded += t.text.trim() ? t.text.trim().split(/\s+/).length : 0;
      if (t.kind === "removed")
        totalRemoved += t.text.trim() ? t.text.trim().split(/\s+/).length : 0;
    }
  }
  return { totalChangedSections, totalAdded, totalRemoved };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}
