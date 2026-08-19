"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { unwrap } from "@/lib/actions/result";
import { issuePortalLinkAction } from "./portal-link-actions";

/**
 * The hand-over affordance (B2, D10): one live candidate-portal link
 * per person per org, issued here and handed over by whatever channel
 * reaches them — the same delivery honesty as invitations. Sits beside
 * the notice machinery because the notice is the natural moment to
 * hand the person their window.
 */
export function PortalLinkButton({ candidateId }: { candidateId: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);

  const issue = () => {
    start(async () => {
      try {
        const out = unwrap(await issuePortalLinkAction(candidateId));
        setLink(out.url);
        setExpires(out.expiresAt);
        try {
          await navigator.clipboard.writeText(out.url);
          toast.success("Portal link copied. Share it with the candidate by hand.");
        } catch {
          toast.success("Portal link ready. Copy it below and share it by hand.");
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "The link could not be issued."
        );
      }
    });
  };

  return (
    <div className="mt-4 space-y-2 border border-outline-variant bg-surface-container-low px-4 py-3">
      <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
        Candidate portal
      </p>
      <p className="text-sm text-on-surface-variant">
        A link where this person sees what the firm holds about them,
        corrects their contact details, submits a newer CV, withdraws, or
        requests erasure. One live link per person; reissuing returns the
        same one. Nothing is emailed — you hand it over.
      </p>
      {link ? (
        <p className="break-all font-mono-data text-body-main text-on-surface">
          {link}
          {expires && (
            <span className="ml-2 font-mono-label text-mono-label uppercase tracking-wider text-outline">
              valid until {new Date(expires).toLocaleDateString("en-GB")}
            </span>
          )}
        </p>
      ) : (
        <button
          type="button"
          onClick={issue}
          disabled={pending}
          aria-busy={pending ? true : undefined}
          className="border border-primary px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest text-primary transition-colors hover:bg-primary hover:text-on-primary disabled:opacity-40"
        >
          {pending ? "Issuing…" : "Get portal link"}
        </button>
      )}
    </div>
  );
}
