"use client";

import { useFormStatus } from "react-dom";
import { createProjectAction } from "./actions";
import { IconArrowRight, IconRefresh } from "@/components/icons";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="bg-primary-container text-on-primary-container px-6 py-3 rounded-none font-mono-label text-mono-label uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
    >
      {pending ? (
        <>
          <IconRefresh size={18} className="animate-spin" />
          Initializing
        </>
      ) : (
        <>
          Initialize Search
          <IconArrowRight size={18} />
        </>
      )}
    </button>
  );
}

export function NewSearchForm({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <form action={createProjectAction} className="space-y-4">
      <div className="bg-surface-container-lowest border border-primary-container/70 flex items-center shadow-[0_0_15px_rgba(37,99,235,0.18)] focus-within:shadow-[0_0_25px_rgba(37,99,235,0.3)] transition-shadow">
        <div className="bg-primary-container px-3 py-3 text-on-primary-container font-mono-label text-mono-label flex items-center justify-center tracking-widest">
          COMMAND:
        </div>
        <input
          name="one_line"
          type="text"
          required
          maxLength={500}
          autoFocus
          defaultValue={defaultValue}
          placeholder="Input role mandate... e.g. Head of IT Ops for RBC Capital Markets"
          className="flex-1 bg-transparent border-none focus:ring-0 text-primary font-mono-data text-headline-md px-4 py-3 placeholder:text-outline-variant outline-none"
          style={{
            fontSize: "18px",
            lineHeight: "24px",
          }}
        />
        <span className="px-4 text-primary/60 font-mono-data animate-pulse hidden sm:inline">
          █
        </span>
      </div>
      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
