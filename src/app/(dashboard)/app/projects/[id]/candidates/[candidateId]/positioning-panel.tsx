"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  IconCopy,
  IconMail,
  IconRefresh,
  IconSpark,
} from "@/components/icons";
import {
  PANEL_BODY,
  PANEL_BUTTON,
  PANEL_BUTTON_QUIET,
  Panel,
  PanelMeta,
} from "@/components/projects/panel";
import {
  EMAIL_TEMPLATE_BLURBS,
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_LABELS,
  PITCH_TONES,
  PITCH_TONE_BLURBS,
  PITCH_TONE_LABELS,
  type EmailTemplate,
  type PitchTone,
  type PitchVersion,
  type PositioningResult,
} from "@/lib/ai/positioning-agent";
import { generatePositioningAction } from "./actions";
import { unwrap } from "@/lib/actions/result";

// Positioning module on the candidate profile. Tabbed UI: three tone
// pitches, three email templates. The "Generate" button kicks off the
// agent on demand; the result is cached on cv_structured.positioning_kit
// so subsequent visits render instantly.

const TONE_TONE: Record<PitchTone, string> = {
  conservative: "border-outline-variant bg-surface-container-high text-on-surface-variant",
  balanced: "border-primary-container/60 bg-primary-container/10 text-primary",
  aggressive: "border-tertiary/60 bg-tertiary/10 text-tertiary",
};

type TabKey = "pitches" | "emails";

export function PositioningPanel({
  candidateId,
  projectId,
  initial,
}: {
  candidateId: string;
  projectId: string;
  initial: PositioningResult | null;
}) {
  const router = useRouter();
  const [kit, setKit] = useState<PositioningResult | null>(initial);
  const [tab, setTab] = useState<TabKey>("pitches");
  const [pitchTone, setPitchTone] = useState<PitchTone>("balanced");
  const [emailKey, setEmailKey] =
    useState<(typeof EMAIL_TEMPLATE_KEYS)[number]>("introduction");
  const [pending, start] = useTransition();

  const pitchByTone = useMemo(() => {
    const map = new Map<PitchTone, PitchVersion>();
    for (const p of kit?.pitches ?? []) map.set(p.tone, p);
    return map;
  }, [kit]);

  const emailByKey = useMemo(() => {
    const map = new Map<string, EmailTemplate>();
    for (const e of kit?.emails ?? []) map.set(e.key, e);
    return map;
  }, [kit]);

  const handleGenerate = () => {
    if (pending) return;
    start(async () => {
      try {
        const next = unwrap(await generatePositioningAction(candidateId, projectId));
        setKit(next);
        toast.success("Positioning kit generated");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed.";
        toast.error(msg);
      }
    });
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable.");
    }
  };

  const activePitch = pitchByTone.get(pitchTone) ?? null;
  const activeEmail = emailByKey.get(emailKey) ?? null;

  return (
    <Panel
      title="Positioning kit"
      meta={
        <PanelMeta>
          {kit ? `generated ${formatRelative(kit.generated_at)}` : "Not generated"}
        </PanelMeta>
      }
      action={
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          aria-busy={pending ? true : undefined}
          className={PANEL_BUTTON}
        >
          {pending || kit ? (
            <IconRefresh size={14} className={cn(pending && "animate-spin")} />
          ) : (
            <IconSpark size={14} />
          )}
          {pending ? "Generating" : kit ? "Regenerate" : "Generate kit"}
        </button>
      }
    >
      {!kit ? (
        <div className={PANEL_BODY}>
          <p className="max-w-[70ch] text-[13px] leading-relaxed text-on-surface-variant">
            The Positioning Agent reads the AI evaluation, this project&rsquo;s
            calibration, and recent client feedback, then writes three pitch
            versions (conservative / balanced / aggressive) and three client
            email templates. Click <strong>Generate Kit</strong> to start.
          </p>
        </div>
      ) : (
        <div className={cn(PANEL_BODY, "flex flex-col gap-4")}>
          {kit.positioning_summary && (
            <div className="bg-primary-container/10 border-l-2 border-l-primary-container px-3 py-2">
              <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest">
                Positioning summary
              </span>
              <p className="text-on-surface text-body-main leading-relaxed mt-1">
                {kit.positioning_summary}
              </p>
            </div>
          )}

          <div className="inline-flex border border-outline-variant divide-x divide-outline-variant">
            <TabButton
              active={tab === "pitches"}
              onClick={() => setTab("pitches")}
            >
              Pitch Versions
            </TabButton>
            <TabButton
              active={tab === "emails"}
              onClick={() => setTab("emails")}
            >
              Email Templates
            </TabButton>
          </div>

          {tab === "pitches" ? (
            <>
              <div className="flex flex-wrap gap-2">
                {PITCH_TONES.map((t) => {
                  const active = pitchTone === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPitchTone(t)}
                      className={cn(
                        "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        active
                          ? TONE_TONE[t]
                          : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                      )}
                    >
                      {PITCH_TONE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
              {activePitch ? (
                <PitchView pitch={activePitch} onCopy={handleCopy} />
              ) : (
                <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
                  Pitch missing — regenerate the kit.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {EMAIL_TEMPLATE_KEYS.map((k) => {
                  const active = emailKey === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setEmailKey(k)}
                      className={cn(
                        "px-3 py-1.5 border font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                        active
                          ? "border-primary-container/60 bg-primary-container/10 text-primary"
                          : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
                      )}
                    >
                      {EMAIL_TEMPLATE_LABELS[k]}
                    </button>
                  );
                })}
              </div>
              {activeEmail ? (
                <EmailView email={activeEmail} onCopy={handleCopy} />
              ) : (
                <p className="font-mono-label text-mono-label text-outline italic uppercase tracking-widest">
                  Email template missing — regenerate the kit.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 font-mono-label text-mono-label uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary",
        active
          ? "bg-primary-container/15 text-primary"
          : "text-outline hover:text-on-surface"
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
      </span>
    </button>
  );
}

function PitchView({
  pitch,
  onCopy,
}: {
  pitch: PitchVersion;
  onCopy: (text: string, label: string) => void;
}) {
  const fullText = composePitchText(pitch);
  return (
    <div className="space-y-3">
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
        {PITCH_TONE_BLURBS[pitch.tone]}
      </p>
      <Block label="Opener">
        <p>{pitch.opener}</p>
      </Block>
      <Block label="Talking points">
        <ol className="space-y-1.5 font-mono-data text-body-main text-on-surface-variant">
          {pitch.talking_points.map((tp, i) => (
            <li key={i}>
              <span className="font-mono-label text-mono-label text-primary uppercase tracking-widest mr-2">
                {String(i + 1).padStart(2, "0")}
              </span>
              {tp}
            </li>
          ))}
        </ol>
      </Block>
      <Block label="Objection handling">
        <p className="text-tertiary">{pitch.objection_handling}</p>
      </Block>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onCopy(fullText, "Pitch")}
          className={PANEL_BUTTON_QUIET}
        >
          <IconCopy size={14} />
          Copy Pitch
        </button>
      </div>
    </div>
  );
}

function EmailView({
  email,
  onCopy,
}: {
  email: EmailTemplate;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest leading-snug">
        {EMAIL_TEMPLATE_BLURBS[email.key]}
      </p>
      <Block label="Subject">
        <p className="font-mono-data text-body-main text-on-surface">
          {email.subject}
        </p>
      </Block>
      <Block label="Body">
        <pre className="font-mono-data text-body-main text-on-surface-variant whitespace-pre-wrap break-words bg-surface-container-lowest border border-outline-variant px-3 py-2 leading-relaxed">
          {email.body}
        </pre>
      </Block>
      <div className="flex items-center gap-2 justify-end flex-wrap">
        <button
          type="button"
          onClick={() => onCopy(email.subject, "Subject")}
          className={PANEL_BUTTON_QUIET}
        >
          <IconCopy size={14} />
          Copy Subject
        </button>
        <button
          type="button"
          onClick={() => onCopy(email.body, "Body")}
          className={PANEL_BUTTON_QUIET}
        >
          <IconCopy size={14} />
          Copy Body
        </button>
        <button
          type="button"
          onClick={() => {
            const url = `mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
            window.location.href = url;
          }}
          className={PANEL_BUTTON}
        >
          <IconMail size={14} />
          Open in Mail
        </button>
      </div>
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h5 className="font-mono-label text-mono-label text-outline uppercase tracking-widest">
        {label}
      </h5>
      <div className="text-on-surface text-body-main leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function composePitchText(pitch: PitchVersion): string {
  const lines: string[] = [];
  lines.push(`OPENER (${PITCH_TONE_LABELS[pitch.tone].toUpperCase()})`);
  lines.push(pitch.opener);
  lines.push("");
  lines.push("TALKING POINTS");
  pitch.talking_points.forEach((tp, i) => lines.push(`${i + 1}. ${tp}`));
  lines.push("");
  lines.push("OBJECTION HANDLING");
  lines.push(pitch.objection_handling);
  return lines.join("\n");
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const delta = Date.now() - then;
  const sec = Math.round(delta / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
