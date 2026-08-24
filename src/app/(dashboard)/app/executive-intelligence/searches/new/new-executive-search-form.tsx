"use client";

import { useFormStatus } from "react-dom";
import { createExecutiveSearchAction } from "./actions";
import { ROLE_FAMILIES } from "@/lib/executive/types";
import {
  IconArrowRight,
  IconRefresh,
} from "@/components/icons";

type Defaults = Record<string, unknown>;

function str(defaults: Defaults, key: string): string {
  const v = defaults[key];
  return typeof v === "string" ? v : "";
}

const inputClass =
  "w-full bg-surface-container-lowest border border-outline-variant px-3 py-2 text-body-main text-on-surface placeholder:text-outline-variant outline-none focus:border-primary transition-colors";

function Field({
  label,
  name,
  defaults,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  defaults: Defaults;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
        {required && <span className="text-primary ml-1">*</span>}
      </span>
      <input
        type="text"
        name={name}
        required={required}
        maxLength={2000}
        defaultValue={str(defaults, name)}
        placeholder={placeholder}
        className={inputClass}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaults,
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  defaults: Defaults;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </span>
      <textarea
        name={name}
        rows={rows}
        maxLength={2000}
        defaultValue={str(defaults, name)}
        placeholder={placeholder}
        className={`${inputClass} resize-y`}
      />
    </label>
  );
}

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-low border border-outline-variant p-6 space-y-5">
      <header className="space-y-1">
        <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
          {step}
        </span>
        <h2 className="font-h3 text-h3 text-on-surface">{title}</h2>
        <p className="text-body-main text-on-surface-variant">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="btn-notch bg-primary-container text-on-primary-container px-6 py-3 font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {pending ? (
        <>
          <IconRefresh size={18} className="animate-spin" />
          Initializing Search
        </>
      ) : (
        <>
          Create Executive Search
          <IconArrowRight size={18} />
        </>
      )}
    </button>
  );
}

type Props = {
  /** Template intake_defaults, empty object when no template selected. */
  defaults: Defaults;
  templateKey: string | null;
};

export function NewExecutiveSearchForm({ defaults, templateKey }: Props) {
  const defaultRoleFamily = str(defaults, "role_family") || "other";
  const defaultTier = str(defaults, "service_tier") || "standard";

  return (
    <form action={createExecutiveSearchAction} className="space-y-6">
      {templateKey && (
        <input type="hidden" name="template_key" value={templateKey} />
      )}

      <Section
        step="Step 1 / 3"
        title="Company Context"
        subtitle="The operating environment the executive must succeed in. The Company Context Agent researches the rest after creation."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Company Name" name="company_name" defaults={defaults} required placeholder="e.g. Meridian Capital" />
          <Field label="Industry" name="industry" defaults={defaults} placeholder="e.g. Financial Services" />
          <Field label="Business Model" name="business_model" defaults={defaults} placeholder="e.g. B2B SaaS" />
          <Field label="Revenue Range" name="revenue_range" defaults={defaults} placeholder="e.g. $20-100M ARR" />
          <Field label="Employee Count" name="employee_count" defaults={defaults} placeholder="e.g. 200-1000" />
          <Field label="Funding Stage" name="funding_stage" defaults={defaults} placeholder="e.g. Series C / PE-owned / Public" />
          <Field label="Ownership Structure" name="ownership_structure" defaults={defaults} placeholder="e.g. VC-backed, founder-controlled" />
          <Field label="Geographic Footprint" name="geographic_footprint" defaults={defaults} placeholder="e.g. US + EU, remote-first" />
        </div>
        <TextArea
          label="Regulatory Environment"
          name="regulatory_environment"
          defaults={defaults}
          placeholder="Regulators, examination cadence, compliance obligations — or 'lightly regulated'."
          rows={2}
        />
      </Section>

      <Section
        step="Step 2 / 3"
        title="Role Definition"
        subtitle="What the role is and where it sits."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Role Title" name="role_title" defaults={defaults} required placeholder="e.g. Chief Technology Officer" />
          <label className="block space-y-1.5">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Role Family
            </span>
            <select name="role_family" defaultValue={defaultRoleFamily} className={inputClass}>
              {ROLE_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              New Role or Replacement
            </span>
            <select name="is_new_role" defaultValue="" className={inputClass}>
              <option value="">Not specified</option>
              <option value="new">Newly created role</option>
              <option value="replacement">Replacement</option>
            </select>
          </label>
          <Field label="Reporting Line" name="reporting_line" defaults={defaults} placeholder="e.g. CEO" />
          <Field label="Board Exposure" name="board_exposure" defaults={defaults} placeholder="e.g. Quarterly board reporting" />
          <Field label="Team Size" name="team_size" defaults={defaults} placeholder="e.g. 60-250 engineers" />
          <Field label="Budget / P&L Scope" name="budget_scope" defaults={defaults} placeholder="e.g. $40M operating budget" />
        </div>
        <TextArea
          label="Reason for Hire"
          name="reason_for_hire"
          defaults={defaults}
          placeholder="Why this role, why now."
          rows={2}
        />
      </Section>

      <Section
        step="Step 3 / 3"
        title="Mandate & Outcomes"
        subtitle="What success must look like. This drives the Success Profile."
      >
        <TextArea
          label="Business Situation"
          name="business_situation"
          defaults={defaults}
          placeholder="The situation the executive walks into: growth, turnaround, transformation, remediation…"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextArea
            label="Expected 90-Day Outcomes"
            name="expected_90_day_outcomes"
            defaults={defaults}
            placeholder="What must be visibly true after 90 days."
          />
          <TextArea
            label="Expected First-Year Outcomes"
            name="expected_first_year_outcomes"
            defaults={defaults}
            placeholder="What must be true after year one."
          />
        </div>
        <TextArea
          label="Non-Negotiable Requirements"
          name="non_negotiables"
          defaults={defaults}
          placeholder="Experience the role cannot succeed without."
          rows={2}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Preferred Leadership Style"
            name="preferred_leadership_style"
            defaults={defaults}
            placeholder="e.g. Hands-on player-coach"
          />
          <label className="block space-y-1.5">
            <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
              Service Tier
            </span>
            <select name="service_tier" defaultValue={defaultTier} className={inputClass}>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
        </div>
      </Section>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
