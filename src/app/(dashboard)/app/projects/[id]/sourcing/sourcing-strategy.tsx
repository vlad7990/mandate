"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TargetCompaniesReport } from "@/lib/ai/target-companies-agent";
import { ARCHETYPES, type Archetype } from "@/lib/ai/cv-parsing";
import { SLOTS, type SlotKey } from "@/lib/ai/sourcing-analysis";
import {
  appendCompaniesToBooleanAction,
  generateTargetCompaniesAction,
} from "./actions";

const ARCHETYPE_BLURBS: Record<
  Archetype,
  {
    career_path: string;
    typical_companies: string;
    typical_titles: string;
    boolean_seed: string;
  }
> = {
  Builder: {
    career_path:
      "Founder → first-engineer / Head-of-X at fast-scaling startups → repeat founder or senior platform leader.",
    typical_companies:
      "VC-backed startups, founder programs (Antler, OnDeck), early-employee alumni networks (Stripe Mafia, Palantir, etc.).",
    typical_titles:
      "Founder, Co-Founder, Founding Engineer, Head of Product, Head of Engineering, VP Engineering (≤300 FTE).",
    boolean_seed:
      `("founder" OR "co-founder" OR "founding engineer" OR "head of engineering" OR "head of product")`,
  },
  Operator: {
    career_path:
      "BigCo IC → manager → senior manager → director, often within one or two long tenures. Steady-state ownership.",
    typical_companies:
      "Public technology, financial services, consulting → leadership at large operating companies.",
    typical_titles:
      "Director, Senior Director, VP Operations, Head of Engineering (>500 FTE), General Manager.",
    boolean_seed:
      `("director" OR "senior director" OR "VP" OR "general manager") AND ("operations" OR "delivery" OR "platform")`,
  },
  Transformer: {
    career_path:
      "Strategy consulting / PE operating partner → CXO at mid-cap, post-merger integration, turnarounds.",
    typical_companies:
      "McKinsey/BCG/Bain alumni networks, PE portfolio companies, post-acquisition CXO roles.",
    typical_titles:
      "Chief Transformation Officer, COO, CIO (turnaround), Head of Integration, Operating Partner.",
    boolean_seed:
      `("chief transformation" OR "transformation director" OR "post-merger integration" OR "turnaround" OR "modernisation lead")`,
  },
  Infrastructure: {
    career_path:
      "Deep platform / SRE / IT-ops focus — reliability and substrate teams build on. Often 10+ years on infra.",
    typical_companies:
      "Hyperscalers (AWS/Azure/GCP), trading firms, large fintech / telco infra teams, observability vendors.",
    typical_titles:
      "Principal Engineer, Staff SRE, Head of Platform, Head of SRE, VP Infrastructure.",
    boolean_seed:
      `("head of platform" OR "VP infrastructure" OR "principal SRE" OR "staff site reliability" OR "head of cloud")`,
  },
};

const CATEGORY_TONE: Record<
  "competitor" | "adjacent" | "feeder",
  string
> = {
  competitor: "border-primary/60 bg-primary-container/15 text-primary",
  adjacent:
    "border-secondary-fixed-dim/60 bg-secondary-fixed-dim/10 text-secondary-fixed-dim",
  feeder: "border-tertiary/60 bg-tertiary/10 text-tertiary",
};

const POOL_TONE: Record<"small" | "medium" | "large", string> = {
  small: "text-tertiary",
  medium: "text-on-surface",
  large: "text-secondary-fixed-dim",
};

export function SourcingStrategy({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<"companies" | "archetypes">("companies");
  return (
    <section className="max-w-7xl mx-auto px-6 pb-10 space-y-3">
      <header className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[14px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            track_changes
          </span>
          SOURCING_STRATEGY
        </h2>
        <nav aria-label="Sourcing strategy view" className="flex border border-outline-variant">
          <TabButton
            active={tab === "companies"}
            onClick={() => setTab("companies")}
            icon="location_city"
            label="Target Companies"
          />
          <TabButton
            active={tab === "archetypes"}
            onClick={() => setTab("archetypes")}
            icon="hub"
            label="Archetype Targeting"
          />
        </nav>
      </header>

      {tab === "companies" ? (
        <TargetCompaniesPanel projectId={projectId} />
      ) : (
        <ArchetypePanel projectId={projectId} />
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
        active
          ? "bg-primary-container text-on-primary-container"
          : "bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
      )}
    >
      <span className="material-symbols-outlined text-[14px]" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}

function TargetCompaniesPanel({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<TargetCompaniesReport | null>(null);
  const [pending, start] = useTransition();
  const [archetypeHint, setArchetypeHint] = useState<Archetype | "">("");

  const handleGenerate = () => {
    if (pending) return;
    start(async () => {
      try {
        const next = await generateTargetCompaniesAction(
          projectId,
          archetypeHint || undefined
        );
        setReport(next);
        toast.success(`${next.companies.length} target companies generated`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Generation failed."
        );
      }
    });
  };

  return (
    <article className="bg-surface-container-low border border-outline-variant overflow-hidden">
      <header className="bg-surface-container-high px-4 py-2.5 border-b border-outline-variant flex items-center justify-between gap-2 flex-wrap">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest">
          Target Companies · 12–20 named, mixed competitor / adjacent / feeder
        </span>
        <div className="flex items-center gap-2">
          <select
            value={archetypeHint}
            onChange={(e) => setArchetypeHint(e.target.value as Archetype | "")}
            disabled={pending}
            className="px-2 py-1 bg-surface-container-lowest border border-outline-variant font-mono-label text-mono-label text-on-surface uppercase tracking-widest"
          >
            <option value="">No archetype bias</option>
            {ARCHETYPES.map((a) => (
              <option key={a} value={a}>
                Bias toward {a}s
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={pending}
            className="px-3 py-1.5 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span
              className={cn(
                "material-symbols-outlined text-[14px]",
                pending && "animate-spin"
              )}
              aria-hidden
            >
              {pending ? "progress_activity" : report ? "refresh" : "auto_awesome"}
            </span>
            {pending
              ? "Generating"
              : report
                ? "Regenerate"
                : "Generate Target Companies"}
          </button>
        </div>
      </header>

      {!report ? (
        <p className="px-4 py-6 text-body-main text-on-surface-variant text-center">
          Generate a list of competitor + adjacent + feeder companies
          calibrated to this role&apos;s weights. Pick an archetype bias to
          tilt the list toward where Builders / Operators / Transformers
          / Infra leaders typically come from.
        </p>
      ) : (
        <div className="p-4 space-y-3">
          <p className="font-mono-data text-body-main text-on-surface leading-relaxed">
            {report.thesis}
          </p>
          <ul className="space-y-1.5">
            {report.companies.map((c, i) => (
              <li
                key={`${c.name}-${i}`}
                className="bg-surface-container border border-outline-variant px-3 py-2 flex items-baseline justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono-data text-body-main text-on-surface font-semibold">
                      {c.name}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0 border font-mono-label text-mono-label uppercase tracking-widest",
                        CATEGORY_TONE[c.category]
                      )}
                    >
                      {c.category}
                    </span>
                    <span
                      className={cn(
                        "font-mono-label text-mono-label uppercase tracking-widest tabular-nums",
                        POOL_TONE[c.talent_pool_size]
                      )}
                    >
                      pool: {c.talent_pool_size}
                    </span>
                  </div>
                  <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
                    {c.rationale}
                  </p>
                </div>
                <AppendCompanyButton
                  projectId={projectId}
                  companyName={c.name}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function AppendCompanyButton({
  projectId,
  companyName,
}: {
  projectId: string;
  companyName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const append = (slot: SlotKey) => {
    if (pending) return;
    start(async () => {
      try {
        await appendCompaniesToBooleanAction(projectId, slot, [companyName]);
        toast.success(`Added to ${slot.replace("_", " ")}`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Append failed.");
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="px-2 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5 disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[12px]" aria-hidden>
          add
        </span>
        Add to Boolean
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-10 bg-surface-container-high border border-outline-variant shadow-lg min-w-[200px]"
          onMouseLeave={() => setOpen(false)}
        >
          <ul className="divide-y divide-outline-variant/40">
            {SLOTS.map((s) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => append(s.key)}
                  disabled={pending}
                  className="w-full text-left px-3 py-2 font-mono-label text-mono-label text-on-surface-variant uppercase tracking-widest hover:bg-surface-container-low hover:text-on-surface transition-colors disabled:opacity-60"
                >
                  {s.short}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ArchetypePanel({ projectId: _projectId }: { projectId: string }) {
  void _projectId;
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {ARCHETYPES.map((a) => {
        const blurb = ARCHETYPE_BLURBS[a];
        return (
          <li key={a} className="bg-surface-container-low border border-outline-variant p-4 space-y-2.5">
            <header className="flex items-baseline justify-between gap-2">
              <h3 className="font-h2 text-h2 text-primary uppercase tracking-tight">
                {a}
              </h3>
            </header>
            <KV label="Career path" value={blurb.career_path} />
            <KV label="Typical companies" value={blurb.typical_companies} />
            <KV label="Typical titles" value={blurb.typical_titles} />
            <div className="space-y-1 pt-1 border-t border-outline-variant/40">
              <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
                Boolean seed
              </div>
              <code className="block bg-surface-container-lowest border border-outline-variant px-2 py-1.5 font-mono-data text-body-main text-on-surface leading-relaxed break-words">
                {blurb.boolean_seed}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    .writeText(blurb.boolean_seed)
                    .then(() => toast.success("Boolean seed copied"))
                    .catch(() => toast.error("Copy failed"));
                }}
                className="px-2 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[12px]" aria-hidden>
                  content_copy
                </span>
                Copy seed
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </div>
      <p className="font-mono-data text-body-main text-on-surface-variant leading-snug">
        {value}
      </p>
    </div>
  );
}
