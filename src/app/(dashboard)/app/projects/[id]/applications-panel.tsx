"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Panel, PANEL_BODY, PANEL_BUTTON } from "@/components/projects/panel";
import { setApplicationsOpenAction } from "./apply-actions";
import { unwrap } from "@/lib/actions/result";

/**
 * §190 — the recruiter's view of the apply door. States it can be in,
 * all shown honestly: closed (no token), open (token + Turnstile keys
 * present), and DARK — token minted but the founder's Turnstile keys
 * absent, in which case the public page refuses and this panel says so
 * rather than showing a link that quietly does not work.
 */
export function ApplicationsPanel({
  projectId,
  initialToken,
  turnstileReady,
  origin,
}: {
  projectId: string;
  initialToken: string | null;
  /** Server-computed: both Turnstile keys present. */
  turnstileReady: boolean;
  origin: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [pending, startTransition] = useTransition();

  const link = token ? `${origin}/apply/${token}` : null;

  function toggle(open: boolean) {
    startTransition(async () => {
      try {
        const result = unwrap(await setApplicationsOpenAction(projectId, open));
        setToken(result.apply_token);
        toast.success(
          open
            ? "Applications opened — a fresh link was minted"
            : "Applications closed — the old link is dead"
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not update applications."
        );
      }
    });
  }

  return (
    <Panel title="Applications">
      <div className={PANEL_BODY}>
        {!token && (
          <div className="space-y-3">
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              Closed. Open applications to mint a public link candidates can
              use to submit their own CV — each submission is parsed,
              evaluated and second-opinioned on arrival, exactly like an
              upload.
            </p>
            <button
              type="button"
              onClick={() => toggle(true)}
              disabled={pending}
              className={PANEL_BUTTON}
            >
              {pending ? "Opening…" : "Open applications"}
            </button>
          </div>
        )}

        {token && (
          <div className="space-y-3">
            {!turnstileReady && (
              <div className="border border-warn/60 bg-warn/10 px-3 py-2">
                <p className="text-[13px] leading-relaxed text-on-surface">
                  The link is minted but the public page is REFUSING
                  submissions: Turnstile keys are not configured. A public
                  CV-upload door does not open without a bot challenge — add
                  TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY,
                  redeploy, and this lights up.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <code className="font-mono-data text-[12px] text-on-surface-variant border border-outline-variant bg-surface-container-lowest px-2 py-1 break-all">
                {link}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(link ?? "");
                  toast.success("Link copied");
                }}
                className={PANEL_BUTTON}
              >
                Copy
              </button>
            </div>
            <button
              type="button"
              onClick={() => toggle(false)}
              disabled={pending}
              className={PANEL_BUTTON}
            >
              {pending ? "Closing…" : "Close applications"}
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}
