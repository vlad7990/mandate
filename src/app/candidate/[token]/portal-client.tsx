"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { unwrap } from "@/lib/actions/result";
import { PIPELINE_LABELS, type PipelineStage } from "@/lib/ai/cv-parsing";
import {
  updateContactAction,
  withdrawAction,
  requestErasureAction,
  submitCvAction,
} from "./actions";

export type ContextRow = {
  person_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  twitter_url: string | null;
  current_title: string | null;
  current_company: string | null;
  has_cv: boolean;
  source_kind: string | null;
  source_platform: string | null;
  sourced_at: string | null;
  notified_at: string | null;
  organization_name: string;
  expires_at: string;
  identity_basis: string;
};

export type SearchRow = {
  project_id: string;
  role_title: string;
  stage: string;
  added_at: string;
};

const inputClass =
  "w-full border border-outline-variant bg-surface-container-low px-3 py-2 text-body-main text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const labelClass =
  "font-mono-label text-mono-label uppercase tracking-wider text-outline";
const buttonClass =
  "border border-primary px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-40";

/** Plain words for a stage, softened for the person it is about. */
function stageWords(stage: string): string {
  if (stage === "withdrawn") return "You withdrew";
  return PIPELINE_LABELS[stage as PipelineStage] ?? "In review";
}

export function PortalClient({
  token,
  ctx,
  searches,
}: {
  token: string;
  ctx: ContextRow;
  searches: SearchRow[];
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
          your data{" // "}{ctx.organization_name}
        </p>
        <h1 className="font-h1 text-h1 tracking-tight text-on-surface">
          Hello, {ctx.person_name}
        </h1>
        <p className="text-body-main text-on-surface-variant">
          {ctx.organization_name} holds the information below because you are
          a candidate in {searches.length === 1 ? "one of its searches" : `${searches.length} of its searches`}.
          {ctx.notified_at
            ? " You were notified about this."
            : " The search team is required to tell you about this — this page is part of that."}{" "}
          Your contact details are yours to correct; anything else, ask the
          search team.
        </p>
      </header>

      <IdentityCard ctx={ctx} />
      <SearchesCard token={token} searches={searches} />
      <ContactForm token={token} ctx={ctx} />
      <CvCard token={token} ctx={ctx} />
      <ErasureCard token={token} />

      <Toaster richColors position="top-right" />
    </div>
  );
}

function IdentityCard({ ctx }: { ctx: ContextRow }) {
  const fields: Array<[string, string | null]> = [
    ["Name", ctx.person_name],
    ["Email", ctx.email],
    ["Current title", ctx.current_title],
    ["Current company", ctx.current_company],
    ["Phone", ctx.phone],
    ["Location", ctx.location],
    ["LinkedIn", ctx.linkedin_url],
    ["GitHub", ctx.github_url],
    ["Website", ctx.website_url],
    ["Twitter/X", ctx.twitter_url],
    ["CV on file", ctx.has_cv ? "Yes" : "No"],
    [
      "How you were found",
      ctx.source_platform || ctx.source_kind
        ? [ctx.source_kind, ctx.source_platform].filter(Boolean).join(" · ")
        : null,
    ],
  ];
  return (
    <section className="border border-outline-variant bg-surface-container px-5 py-5">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
        What is held about you
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className={labelClass}>{label}</dt>
            <dd className="mt-1 break-words text-body-main text-on-surface">
              {value?.trim() ? value : "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SearchesCard({
  token,
  searches,
}: {
  token: string;
  searches: SearchRow[];
}) {
  const [pending, start] = useTransition();

  const withdraw = (projectId: string, title: string) => {
    if (
      !window.confirm(
        `Withdraw from "${title}"? The search team will see this and stop considering you for it.`
      )
    ) {
      return;
    }
    start(async () => {
      try {
        unwrap(await withdrawAction(token, projectId));
        toast.success("You have withdrawn. The search team will see it.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The withdrawal failed. Try again."
        );
      }
    });
  };

  return (
    <section className="border border-outline-variant bg-surface-container px-5 py-5">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
        The searches you are in
      </h2>
      <ul className="mt-4 divide-y divide-outline-variant border border-outline-variant">
        {searches.map((s) => (
          <li
            key={s.project_id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          >
            <span className="text-on-surface">{s.role_title}</span>
            <span className="font-mono-label text-mono-label uppercase tracking-wider text-outline">
              {stageWords(s.stage)}
            </span>
            {s.stage !== "withdrawn" && s.stage !== "hired" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => withdraw(s.project_id, s.role_title)}
                className="ml-auto border border-outline-variant px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-40"
              >
                Withdraw
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-on-surface-variant">
        The client behind each search stays confidential until the search team
        introduces you.
      </p>
    </section>
  );
}

function ContactForm({ token, ctx }: { token: string; ctx: ContextRow }) {
  const [pending, start] = useTransition();
  const nameLocked = ctx.identity_basis === "name";
  const linkedinLocked = ctx.identity_basis === "linkedin";
  const [form, setForm] = useState({
    full_name: ctx.person_name ?? "",
    phone: ctx.phone ?? "",
    location: ctx.location ?? "",
    linkedin_url: ctx.linkedin_url ?? "",
    github_url: ctx.github_url ?? "",
    website_url: ctx.website_url ?? "",
    twitter_url: ctx.twitter_url ?? "",
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    start(async () => {
      try {
        unwrap(
          await updateContactAction(token, {
            full_name: nameLocked ? undefined : form.full_name,
            phone: form.phone,
            location: form.location,
            linkedin_url: linkedinLocked ? undefined : form.linkedin_url,
            github_url: form.github_url,
            website_url: form.website_url,
            twitter_url: form.twitter_url,
          })
        );
        toast.success("Your details are updated across the team's records.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The update failed. Try again."
        );
      }
    });
  };

  const field = (
    label: string,
    key: keyof typeof form,
    locked = false,
    lockNote = ""
  ) => (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <input
        type="text"
        value={form[key]}
        onChange={set(key)}
        disabled={locked}
        className={inputClass + (locked ? " opacity-50" : "")}
      />
      {locked && <span className="block text-sm text-on-surface-variant">{lockNote}</span>}
    </label>
  );

  return (
    <section className="border border-outline-variant bg-surface-container px-5 py-5">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
        Correct your details
      </h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        Email changes go through the search team — it is how this link stays
        yours.
      </p>
      <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {field(
          "Full name",
          "full_name",
          nameLocked,
          "Your name anchors this link — ask the search team to correct it."
        )}
        {field("Phone", "phone")}
        {field("Location", "location")}
        {field(
          "LinkedIn",
          "linkedin_url",
          linkedinLocked,
          "Your LinkedIn profile anchors this link — ask the search team to correct it."
        )}
        {field("GitHub", "github_url")}
        {field("Website", "website_url")}
        {field("Twitter/X", "twitter_url")}
        <div className="flex items-end">
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Saving…" : "Save details"}
          </button>
        </div>
      </form>
    </section>
  );
}

function CvCard({ token, ctx }: { token: string; ctx: ContextRow }) {
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    start(async () => {
      try {
        unwrap(await submitCvAction(token, data));
        if (fileRef.current) fileRef.current.value = "";
        toast.success(
          "Your CV reached the search team. They review it by hand before it replaces the one on file."
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The CV submission failed. Try again."
        );
      }
    });
  };

  return (
    <section className="border border-outline-variant bg-surface-container px-5 py-5">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
        Submit a newer CV
      </h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        {ctx.has_cv
          ? "The team holds a CV for you. A newer one goes to them for review — it does not replace the file automatically."
          : "The team holds no CV for you. One you submit goes to them for review."}
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          name="cv"
          accept=".pdf,.docx"
          required
          className="text-body-main text-on-surface-variant file:mr-3 file:border file:border-outline-variant file:bg-surface-container-low file:px-3 file:py-1.5 file:font-mono-label file:text-mono-label file:uppercase file:tracking-widest file:text-on-surface-variant"
        />
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Sending…" : "Send to the team"}
        </button>
      </form>
    </section>
  );
}

function ErasureCard({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [filed, setFiled] = useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (
      !window.confirm(
        "Ask the firm to erase your data? The request goes to the search team and to Mandate for review."
      )
    ) {
      return;
    }
    start(async () => {
      try {
        unwrap(await requestErasureAction(token, note));
        setFiled(true);
        toast.success("Your erasure request is with the team.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The request failed. Try again."
        );
      }
    });
  };

  return (
    <section className="border border-outline-variant bg-surface-container px-5 py-5">
      <h2 className="font-mono-label text-mono-label uppercase tracking-widest text-error">
        Ask for erasure
      </h2>
      <p className="mt-2 text-sm text-on-surface-variant">
        You can ask the firm to erase what it holds about you. The request is
        reviewed by a person; erasure is not automatic, and the team may need
        to keep some records where the law requires it.
      </p>
      {filed ? (
        <p className="mt-4 border border-outline-variant bg-surface-container-low px-4 py-3 text-body-main text-on-surface">
          Your request is filed. The search team and Mandate can see it.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className={labelClass}>Anything the team should know (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="border border-error px-4 py-2 font-mono-label text-mono-label uppercase tracking-widest text-error transition-colors hover:bg-error hover:text-on-error disabled:opacity-40"
          >
            {pending ? "Filing…" : "Request erasure"}
          </button>
        </form>
      )}
    </section>
  );
}
