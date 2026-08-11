"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ANTI_PATTERNS_MAX,
  ANTI_PATTERNS_MIN,
  DEFAULT_PRIORITY_SIGNALS,
  EMPTY_RESPONSES,
  MUST_HAVES_MAX,
  MUST_HAVES_MIN,
  PRIORITY_SIGNALS_MAX,
  PRIORITY_SIGNALS_MIN,
  PRIORITY_WEIGHT_MAX,
  PRIORITY_WEIGHT_MIN,
  ROLE_ORIGIN_OPTIONS,
  STAKEHOLDERS_MAX,
  STAKEHOLDERS_MIN,
  type OnboardingResponses,
  type PrioritySignal,
  type RoleOrigin,
  type Stakeholder,
} from "@/lib/ai/onboarding-analysis";
import { submitOnboarding } from "./actions";

type StepDef = {
  id: 1 | 2 | 3 | 4 | 5;
  key: "origin" | "must_haves" | "anti_patterns" | "stakeholders" | "priorities";
  label: string;
  icon: string;
  eyebrow: string;
  title: string;
  blurb: string;
};

const STEPS: StepDef[] = [
  {
    id: 1,
    key: "origin",
    label: "Origin",
    icon: "fingerprint",
    eyebrow: "Calibration Step 01",
    title: "Mandate Origin",
    blurb:
      "Establish why this role exists. The agent stack uses origin signal to weight transformation and leadership dimensions before sourcing.",
  },
  {
    id: 2,
    key: "must_haves",
    label: "Must-Haves",
    icon: "psychology",
    eyebrow: "Calibration Step 02",
    title: "Non-Negotiables",
    blurb: `${MUST_HAVES_MIN}–${MUST_HAVES_MAX} requirements that a candidate must satisfy. These become hard filters in the ranking model.`,
  },
  {
    id: 3,
    key: "anti_patterns",
    label: "Anti-Patterns",
    icon: "block",
    eyebrow: "Calibration Step 03",
    title: "Deal-Breakers",
    blurb:
      "Profiles you do not want. Be specific — vague exclusions are ignored by the calibration agent.",
  },
  {
    id: 4,
    key: "stakeholders",
    label: "Stakeholders",
    icon: "groups",
    eyebrow: "Calibration Step 04",
    title: "Interview Panel & Focus",
    blurb:
      "Who interviews and what do they care about? Used by the Positioning agent to tune the candidate narrative downstream.",
  },
  {
    id: 5,
    key: "priorities",
    label: "Priorities",
    icon: "analytics",
    eyebrow: "Calibration Step 05",
    title: "Role Priority Signals",
    blurb:
      "Name and weight the signals that matter most for this role. The calibration agent maps each signal to its closest dimension and lets your weights steer the five-dimension scoring model.",
  },
];

type WizardProps = {
  projectId: string;
  initial?: Partial<OnboardingResponses> | null;
  roleTitle: string;
  companyName: string;
};

export function OnboardingWizard({
  projectId,
  initial,
  roleTitle,
  companyName,
}: WizardProps) {
  const [step, setStep] = useState<StepDef["id"]>(1);
  const [responses, setResponses] = useState<OnboardingResponses>(() => ({
    role_origin: initial?.role_origin ?? EMPTY_RESPONSES.role_origin,
    must_haves: padArray(initial?.must_haves, MUST_HAVES_MIN, ""),
    anti_patterns: padArray(
      initial?.anti_patterns,
      ANTI_PATTERNS_MIN,
      ""
    ),
    stakeholders: padArray(
      initial?.stakeholders,
      STAKEHOLDERS_MIN,
      { name: "", role: "", focus: "" }
    ),
    priority_signals:
      Array.isArray(initial?.priority_signals) && initial.priority_signals.length > 0
        ? initial.priority_signals
        : DEFAULT_PRIORITY_SIGNALS.map((p) => ({ ...p })),
  }));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const current = STEPS[step - 1];
  const validity = useMemo(() => stepValidity(step, responses), [step, responses]);

  const goPrev = () => setStep((s) => (s > 1 ? ((s - 1) as StepDef["id"]) : s));
  const goNext = () => {
    if (!validity.ok) {
      toast.error(validity.message ?? "Complete this step before continuing.");
      return;
    }
    setStep((s) => (s < 5 ? ((s + 1) as StepDef["id"]) : s));
  };

  const onSubmit = () => {
    if (!validity.ok) {
      toast.error(validity.message ?? "Resolve the highlighted fields.");
      return;
    }
    startTransition(async () => {
      try {
        await submitOnboarding(projectId, responses);
        // submitOnboarding redirects, so this code is normally unreachable.
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Calibration failed.";
        // Next.js redirect throws an internal error; ignore it.
        if (msg.includes("NEXT_REDIRECT")) return;
        console.error("[onboarding] submit failed:", e);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="min-h-full bg-surface text-on-surface">
      <div className="max-w-6xl mx-auto px-8 py-10">
        {/* breadcrumb */}
        <div className="mb-8 flex items-center gap-3 font-mono-label text-mono-label uppercase tracking-widest text-outline">
          <button
            type="button"
            onClick={() => router.push(`/app/projects/${projectId}`)}
            className="hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_back</span>
            Mandate
          </button>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface-variant">{roleTitle}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-primary">Calibration Sequence</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10">
          {/* Step rail */}
          <aside className="space-y-1 lg:sticky lg:top-6 lg:self-start">
            <div className="px-3 mb-4">
              <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                Onboarding Core
              </div>
              <div className="font-mono-label text-[9px] text-outline uppercase tracking-tighter mt-1">
                v.2.0.4 — sequence active
              </div>
            </div>
            {STEPS.map((s) => {
              const state =
                s.id === step ? "active" : s.id < step ? "done" : "queued";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    s.id < step ? setStep(s.id) : undefined
                  }
                  disabled={s.id > step}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 border-l-2 font-mono-label text-mono-label uppercase tracking-wider text-left transition-colors",
                    state === "active" &&
                      "border-primary-container bg-primary-container/10 text-primary",
                    state === "done" &&
                      "border-secondary-fixed-dim/60 text-on-surface-variant hover:bg-surface-container-low",
                    state === "queued" &&
                      "border-outline-variant/40 text-outline opacity-70 cursor-not-allowed"
                  )}
                >
                  <span
                    className="material-symbols-outlined text-[16px]"
                    style={
                      state === "active"
                        ? { fontVariationSettings: "'FILL' 1" }
                        : undefined
                    }
                  >
                    {s.icon}
                  </span>
                  <span className="truncate">{s.label}</span>
                  <span className="ml-auto font-mono-label text-[9px]">
                    {String(s.id).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </aside>

          {/* Main canvas */}
          <main>
            <header className="mb-10">
              <div className="flex items-center gap-3 mb-3">
                <span className="h-px w-8 bg-primary" />
                <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                  {current.eyebrow}
                </span>
              </div>
              <h1 className="font-h1 text-h1 mb-2">{current.title}</h1>
              <p className="text-body-main text-on-surface-variant max-w-2xl">
                {current.blurb}
              </p>
              <div className="font-mono-label text-mono-label text-outline uppercase tracking-wider mt-3">
                Mandate //{" "}
                <span className="text-on-surface-variant">{roleTitle}</span> @{" "}
                <span className="text-on-surface-variant">{companyName}</span>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
              <section className="space-y-6">
                {step === 1 && (
                  <StepOrigin
                    value={responses.role_origin}
                    onChange={(v) =>
                      setResponses((r) => ({ ...r, role_origin: v }))
                    }
                  />
                )}
                {step === 2 && (
                  <StepRepeater
                    label="Must-have requirement"
                    placeholder="e.g. 8+ years scaling cloud infra at a regulated FS firm"
                    helper={`${MUST_HAVES_MIN}–${MUST_HAVES_MAX} entries · short, specific, testable.`}
                    min={MUST_HAVES_MIN}
                    max={MUST_HAVES_MAX}
                    values={responses.must_haves}
                    onChange={(arr) =>
                      setResponses((r) => ({ ...r, must_haves: arr }))
                    }
                  />
                )}
                {step === 3 && (
                  <StepRepeater
                    label="Anti-pattern"
                    placeholder="e.g. Pure consulting background with no in-house ownership"
                    helper={`${ANTI_PATTERNS_MIN}–${ANTI_PATTERNS_MAX} entries · profiles to filter out.`}
                    min={ANTI_PATTERNS_MIN}
                    max={ANTI_PATTERNS_MAX}
                    values={responses.anti_patterns}
                    onChange={(arr) =>
                      setResponses((r) => ({ ...r, anti_patterns: arr }))
                    }
                    accent="error"
                  />
                )}
                {step === 4 && (
                  <StepStakeholders
                    values={responses.stakeholders}
                    onChange={(arr) =>
                      setResponses((r) => ({ ...r, stakeholders: arr }))
                    }
                  />
                )}
                {step === 5 && (
                  <StepPrioritySignals
                    values={responses.priority_signals}
                    onChange={(v) =>
                      setResponses((r) => ({ ...r, priority_signals: v }))
                    }
                  />
                )}
              </section>

              <AiTuningPanel step={step} />
            </div>

            <footer className="mt-12 pt-6 border-t border-outline-variant/60 flex justify-between items-center">
              <button
                type="button"
                onClick={() => router.push(`/app/projects/${projectId}`)}
                className="flex items-center gap-2 text-outline font-mono-label text-mono-label uppercase tracking-widest hover:text-on-surface transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                Abort Sequence
              </button>
              <div className="flex gap-3">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={isPending}
                    className="px-6 py-3 bg-surface-container-highest border border-outline-variant font-mono-label text-mono-label text-on-surface uppercase tracking-widest hover:border-outline transition-all disabled:opacity-50"
                  >
                    Previous
                  </button>
                )}
                {step < 5 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2"
                  >
                    Initiate Step {String(step + 1).padStart(2, "0")}
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={isPending}
                    aria-busy={isPending}
                    className="px-8 py-3 bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isPending ? (
                      <>
                        <span className="material-symbols-outlined text-[14px] animate-spin">
                          progress_activity
                        </span>
                        Compiling Calibration
                      </>
                    ) : (
                      <>
                        Compile Calibration Model
                        <span className="material-symbols-outlined text-[14px]">memory</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}

function StepOrigin({
  value,
  onChange,
}: {
  value: RoleOrigin;
  onChange: (v: RoleOrigin) => void;
}) {
  return (
    <div className="space-y-3">
      <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider block">
        Why does this role exist?
      </span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROLE_ORIGIN_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "border p-4 text-left transition-all",
                active
                  ? "border-primary-container bg-primary-container/10 text-primary shadow-[0_0_15px_rgba(37,99,235,0.18)]"
                  : "border-outline-variant text-on-surface-variant hover:border-outline hover:bg-surface-container-low"
              )}
            >
              <div className="font-mono-data text-mono-data uppercase tracking-wider">
                {opt.label}
              </div>
              <div className="text-body-main mt-2 leading-snug">
                {opt.caption}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepRepeater({
  label,
  placeholder,
  helper,
  min,
  max,
  values,
  onChange,
  accent = "primary",
}: {
  label: string;
  placeholder: string;
  helper: string;
  min: number;
  max: number;
  values: string[];
  onChange: (next: string[]) => void;
  accent?: "primary" | "error";
}) {
  const accentBorder =
    accent === "error" ? "focus:border-destructive" : "focus:border-primary";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider">
          {label}
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {values.filter((v) => v.trim()).length} / {max}
        </span>
      </div>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex items-stretch gap-2">
            <span className="bg-surface-container-lowest border border-outline-variant px-3 flex items-center font-mono-label text-mono-label text-outline uppercase">
              {String(i + 1).padStart(2, "0")}
            </span>
            <input
              type="text"
              value={v}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              className={cn(
                "flex-1 bg-surface-container-low border border-outline-variant rounded-none px-3 py-3 font-mono-data text-mono-data text-on-surface placeholder:text-outline-variant focus:ring-0 outline-none transition-colors",
                accentBorder
              )}
            />
            {values.length > min && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="px-3 border border-outline-variant text-outline hover:text-destructive hover:border-destructive transition-colors"
                aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {helper}
        </span>
        {values.length < max && (
          <button
            type="button"
            onClick={() => onChange([...values, ""])}
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5 hover:brightness-110 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Append entry
          </button>
        )}
      </div>
    </div>
  );
}

function StepStakeholders({
  values,
  onChange,
}: {
  values: Stakeholder[];
  onChange: (next: Stakeholder[]) => void;
}) {
  const filled = values.filter(
    (s) => s.name.trim() || s.role.trim() || s.focus.trim()
  ).length;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider">
          Interview Panel
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {filled} / {STAKEHOLDERS_MAX}
        </span>
      </div>
      <div className="space-y-3">
        {values.map((s, i) => (
          <div
            key={i}
            className="border border-outline-variant bg-surface-container-low p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
                Stakeholder {String(i + 1).padStart(2, "0")}
              </span>
              {values.length > STAKEHOLDERS_MIN && (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                  className="text-outline hover:text-destructive transition-colors"
                  aria-label={`Remove stakeholder ${i + 1}`}
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldInput
                label="Name"
                value={s.name}
                placeholder="e.g. Sarah Chen"
                onChange={(value) =>
                  onChange(
                    values.map((row, j) =>
                      j === i ? { ...row, name: value } : row
                    )
                  )
                }
              />
              <FieldInput
                label="Role"
                value={s.role}
                placeholder="e.g. CTO / Hiring Manager"
                onChange={(value) =>
                  onChange(
                    values.map((row, j) =>
                      j === i ? { ...row, role: value } : row
                    )
                  )
                }
              />
            </div>
            <FieldInput
              label="What they care about"
              value={s.focus}
              placeholder="e.g. Modernising legacy core, hiring senior ICs"
              onChange={(value) =>
                onChange(
                  values.map((row, j) =>
                    j === i ? { ...row, focus: value } : row
                  )
                )
              }
            />
          </div>
        ))}
      </div>
      {values.length < STAKEHOLDERS_MAX && (
        <button
          type="button"
          onClick={() =>
            onChange([...values, { name: "", role: "", focus: "" }])
          }
          className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5 hover:brightness-110 transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
          Append stakeholder
        </button>
      )}
    </div>
  );
}

function FieldInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1.5 block">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider block">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-container-lowest border border-outline-variant rounded-none px-3 py-2.5 font-mono-data text-mono-data text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-0 outline-none transition-colors"
      />
    </label>
  );
}

function StepPrioritySignals({
  values,
  onChange,
}: {
  values: PrioritySignal[];
  onChange: (next: PrioritySignal[]) => void;
}) {
  const filled = values.filter((p) => p.name.trim()).length;
  const update = (i: number, patch: Partial<PrioritySignal>) =>
    onChange(values.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => onChange(values.filter((_, j) => j !== i));
  const append = () =>
    onChange([...values, { name: "", weight: 5 }]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono-label text-mono-label text-on-surface-variant uppercase tracking-wider">
          Priority signals — name each, weight 1–10
        </span>
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {filled} / {PRIORITY_SIGNALS_MAX}
        </span>
      </div>
      <div className="space-y-3">
        {values.map((p, i) => (
          <div
            key={i}
            className="border border-outline-variant bg-surface-container-low p-4 space-y-3"
          >
            <div className="flex items-stretch gap-2">
              <span className="bg-surface-container-lowest border border-outline-variant px-3 flex items-center font-mono-label text-mono-label text-outline uppercase">
                {String(i + 1).padStart(2, "0")}
              </span>
              <input
                type="text"
                value={p.name}
                placeholder="e.g. Regulatory Experience"
                onChange={(e) => update(i, { name: e.target.value })}
                className="flex-1 bg-surface-container-lowest border border-outline-variant rounded-none px-3 py-3 font-mono-data text-mono-data text-on-surface placeholder:text-outline-variant focus:border-primary focus:ring-0 outline-none transition-colors"
              />
              {values.length > PRIORITY_SIGNALS_MIN && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="px-3 border border-outline-variant text-outline hover:text-destructive hover:border-destructive transition-colors"
                  aria-label={`Remove priority signal ${i + 1}`}
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={PRIORITY_WEIGHT_MIN}
                max={PRIORITY_WEIGHT_MAX}
                step={1}
                value={p.weight}
                onChange={(e) =>
                  update(i, { weight: Number(e.target.value) })
                }
                className="flex-1 accent-primary-container"
                aria-label={`Weight for ${p.name || `signal ${i + 1}`}`}
              />
              <div className="font-h2 text-h2 text-primary tabular-nums w-10 text-right">
                {p.weight}
              </div>
            </div>
            <div className="flex justify-between font-mono-label text-mono-label text-outline uppercase tracking-wider">
              <span>0{PRIORITY_WEIGHT_MIN} · Low</span>
              <span>{PRIORITY_WEIGHT_MAX} · Critical</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-wider">
          {PRIORITY_SIGNALS_MIN}–{PRIORITY_SIGNALS_MAX} signals · weight 1–10 each
        </span>
        {values.length < PRIORITY_SIGNALS_MAX && (
          <button
            type="button"
            onClick={append}
            className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-1.5 hover:brightness-110 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            Add Priority Signal
          </button>
        )}
      </div>
    </div>
  );
}

function AiTuningPanel({ step }: { step: number }) {
  const agents = [
    { id: "01-INTAKE", active: step >= 1, label: "Intake decomposition" },
    { id: "02-RESEARCH", active: step >= 1, label: "Company context" },
    { id: "03-CALIBRATOR", active: step >= 4, label: "Dimension weights" },
    { id: "04-SOURCER", active: step >= 5, label: "Boolean tuning queued" },
  ];
  return (
    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
      <div className="bg-surface-container border border-outline-variant p-5 relative overflow-hidden">
        <div className="absolute top-3 right-3 opacity-20">
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "40px" }}
          >
            hub
          </span>
        </div>
        <h3 className="font-mono-label text-mono-label text-secondary-fixed uppercase tracking-widest mb-4">
          AI Tuning Logic
        </h3>
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "w-1 h-7 mt-1",
                  a.active ? "bg-secondary-fixed-dim" : "bg-outline-variant"
                )}
              />
              <div className="flex-1">
                <div
                  className={cn(
                    "font-mono-data text-mono-data uppercase tracking-wider",
                    a.active ? "text-on-surface" : "text-outline"
                  )}
                >
                  Agent #{a.id}
                </div>
                <div
                  className={cn(
                    "text-body-main leading-snug",
                    a.active ? "text-on-surface-variant" : "text-outline"
                  )}
                >
                  {a.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="border border-outline-variant p-4 flex items-start gap-3">
        <span
          className="material-symbols-outlined text-primary"
          style={{ fontVariationSettings: "'FILL' 1", fontSize: "20px" }}
        >
          verified
        </span>
        <div>
          <div className="font-mono-label text-mono-label text-on-surface uppercase tracking-wider">
            Encryption Active
          </div>
          <div className="text-body-main text-outline mt-1">
            Responses scoped to your organisation. RLS-enforced at the database layer.
          </div>
        </div>
      </div>
    </aside>
  );
}

function padArray<T>(input: T[] | undefined, min: number, fill: T): T[] {
  const arr = Array.isArray(input) ? [...input] : [];
  while (arr.length < min) arr.push(structuredClone(fill));
  return arr;
}

function stepValidity(
  step: number,
  r: OnboardingResponses
): { ok: boolean; message?: string } {
  switch (step) {
    case 1:
      return r.role_origin
        ? { ok: true }
        : { ok: false, message: "Choose a role origin." };
    case 2: {
      const filled = r.must_haves.filter((s) => s.trim()).length;
      if (filled < MUST_HAVES_MIN)
        return {
          ok: false,
          message: `Add at least ${MUST_HAVES_MIN} must-haves.`,
        };
      if (filled > MUST_HAVES_MAX)
        return {
          ok: false,
          message: `Maximum ${MUST_HAVES_MAX} must-haves.`,
        };
      return { ok: true };
    }
    case 3: {
      const filled = r.anti_patterns.filter((s) => s.trim()).length;
      if (filled < ANTI_PATTERNS_MIN)
        return {
          ok: false,
          message: `Add at least ${ANTI_PATTERNS_MIN} anti-pattern.`,
        };
      return { ok: true };
    }
    case 4: {
      const filled = r.stakeholders.filter(
        (s) => s.name.trim() || s.role.trim() || s.focus.trim()
      ).length;
      if (filled < STAKEHOLDERS_MIN)
        return {
          ok: false,
          message: `Add at least ${STAKEHOLDERS_MIN} stakeholder.`,
        };
      return { ok: true };
    }
    case 5: {
      const named = r.priority_signals.filter((p) => p.name.trim());
      if (named.length < PRIORITY_SIGNALS_MIN)
        return {
          ok: false,
          message: `Add at least ${PRIORITY_SIGNALS_MIN} priority signal.`,
        };
      if (named.length > PRIORITY_SIGNALS_MAX)
        return {
          ok: false,
          message: `Maximum ${PRIORITY_SIGNALS_MAX} priority signals.`,
        };
      const allWeightsValid = named.every(
        (p) =>
          Number.isFinite(p.weight) &&
          p.weight >= PRIORITY_WEIGHT_MIN &&
          p.weight <= PRIORITY_WEIGHT_MAX
      );
      return allWeightsValid
        ? { ok: true }
        : {
            ok: false,
            message: `Each weight must be between ${PRIORITY_WEIGHT_MIN} and ${PRIORITY_WEIGHT_MAX}.`,
          };
    }
    default:
      return { ok: true };
  }
}
