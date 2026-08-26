"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { IconPlus } from "@/components/icons";
import {
  addModelAction,
  addProviderAction,
  clearAssignmentAction,
  setAssignmentAction,
  setModelStatusAction,
} from "./actions";

/**
 * The registry's client controls. The database triggers are the law
 * (migration 120); every refusal here is the trigger's own sentence
 * surfaced in a toast — the buttons never pretend a move is legal
 * that the database will refuse.
 */

const inputCls =
  "bg-surface border border-outline-variant px-2 py-1.5 font-mono-data text-sm text-on-surface w-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary";
const buttonCls =
  "px-3 py-1.5 btn-notch bg-primary-container text-on-primary-container font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center gap-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const quietButtonCls =
  "px-2 py-1 border border-outline-variant text-on-surface-variant font-mono-label text-mono-label uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function AddProviderForm() {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <form
      className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
      action={(formData) => {
        if (pending) return;
        start(async () => {
          try {
            unwrap(await addProviderAction(formData));
            toast.success("Provider added");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Add failed.");
          }
        });
      }}
    >
      <label className="space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Provider slug
        </span>
        <input name="name" className={inputCls} placeholder="anthropic-eu" />
      </label>
      <label className="space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Key env var NAME
        </span>
        <input
          name="key_env_var"
          className={inputCls}
          placeholder="ANTHROPIC_API_KEY_EU"
        />
      </label>
      <label className="space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Data region (note)
        </span>
        <input name="data_region" className={inputCls} placeholder="eu-west" />
      </label>
      <button type="submit" disabled={pending} className={buttonCls}>
        <IconPlus size={14} />
        Add provider
      </button>
    </form>
  );
}

export function AddModelForm({ providers }: { providers: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <form
      className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end"
      action={(formData) => {
        if (pending) return;
        start(async () => {
          try {
            unwrap(await addModelAction(formData));
            toast.success("Model added — it enters benchmarking");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Add failed.");
          }
        });
      }}
    >
      <label className="space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Model id
        </span>
        <input
          name="model_id"
          className={inputCls}
          placeholder="claude-opus-5"
        />
      </label>
      <label className="space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Provider
        </span>
        <select name="provider" className={inputCls} defaultValue={providers[0]}>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
          Tier
        </span>
        <select name="tier" className={inputCls} defaultValue="">
          <option value="">—</option>
          <option value="economy">economy</option>
          <option value="standard">standard</option>
          <option value="premium">premium</option>
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonCls}>
        <IconPlus size={14} />
        Add model
      </button>
    </form>
  );
}

export function ModelStatusControls({
  modelId,
  status,
}: {
  modelId: string;
  status: "benchmarking" | "active" | "retired";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const move = (
    to: "benchmarking" | "active" | "retired",
    benchmarkRef?: string
  ) => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await setModelStatusAction(modelId, to, benchmarkRef));
        toast.success(
          to === "active"
            ? `${modelId} activated`
            : to === "retired"
              ? `${modelId} retired`
              : `${modelId} re-enters benchmarking`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Change refused.");
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {status === "benchmarking" && (
        <button
          type="button"
          disabled={pending}
          className={quietButtonCls}
          onClick={() => {
            // Activation needs its evidence — the CHECK refuses an
            // active row without a benchmark_ref.
            const ref = window.prompt(
              `Activate ${modelId} — name the eval evidence (e.g. evals/results/<date>.md):`
            );
            if (ref === null) return;
            move("active", ref);
          }}
        >
          Activate
        </button>
      )}
      {status === "active" && (
        <button
          type="button"
          disabled={pending}
          className={quietButtonCls}
          onClick={() => {
            if (!window.confirm(`Retire ${modelId}?`)) return;
            move("retired");
          }}
        >
          Retire
        </button>
      )}
      {status === "retired" && (
        <button
          type="button"
          disabled={pending}
          className={quietButtonCls}
          onClick={() => move("benchmarking")}
        >
          Re-benchmark
        </button>
      )}
    </div>
  );
}

export function AssignmentControls({
  capability,
  override,
  mapDefault,
  activeModels,
}: {
  capability: string;
  override: string | null;
  mapDefault: string;
  activeModels: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState(override ?? "");

  const assign = () => {
    if (pending || !choice) return;
    start(async () => {
      try {
        unwrap(await setAssignmentAction(capability, choice));
        toast.success(`${capability} → ${choice}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Assignment refused.");
      }
    });
  };

  const clear = () => {
    if (pending) return;
    start(async () => {
      try {
        unwrap(await clearAssignmentAction(capability));
        toast.success(`${capability} back on the map (${mapDefault})`);
        setChoice("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Clear refused.");
      }
    });
  };

  return (
    <div className="flex items-center gap-2 justify-end">
      <select
        aria-label={`Model override for ${capability}`}
        className={`${inputCls} w-auto`}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">map default</option>
        {activeModels.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !choice || choice === override}
        className={quietButtonCls}
        onClick={assign}
      >
        Set
      </button>
      {override && (
        <button
          type="button"
          disabled={pending}
          className={quietButtonCls}
          onClick={clear}
        >
          Clear
        </button>
      )}
    </div>
  );
}
