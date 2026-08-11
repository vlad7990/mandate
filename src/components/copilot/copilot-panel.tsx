"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  IconArrowRight,
  IconClose,
  IconCopilot,
  IconRefresh,
} from "@/components/icons";
import {
  SUGGESTIONS,
  suggestionContextForPath,
  type CopilotMessage,
} from "@/lib/ai/copilot-agent";

type StoredMessage = CopilotMessage & { id: string; createdAt: string };

const HISTORY_KEY_PREFIX = "mandate.copilot.history.";

/**
 * Floating Copilot button + slide-in chat panel. Mounted in the
 * dashboard layout so every page inherits it. Self-resolves the
 * active project from the URL.
 */
export function CopilotPanel() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const params = useParams();
  const projectId = pickRouteId(params, "id");
  const candidateId = pickRouteId(params, "candidateId");

  // No project in scope → don't render. Copilot is project-scoped by
  // design; the dashboard pages outside a project (settings, network,
  // candidates list) get nothing rather than a half-broken panel.
  if (!projectId) return null;

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close Copilot" : "Open Copilot"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 bg-primary text-on-primary border border-primary shadow-lg hover:brightness-110 active:scale-[0.98] transition-[filter,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          open && "ring-2 ring-on-primary/30"
        )}
      >
        {open ? <IconClose size={17} /> : <IconCopilot size={17} />}
        <span className="font-mono-label text-mono-label uppercase tracking-widest">
          {open ? "Close" : "Copilot"}
        </span>
      </button>

      {open && (
        <CopilotChat
          projectId={projectId}
          candidateId={candidateId}
          pathname={pathname}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CopilotChat({
  projectId,
  candidateId,
  pathname,
  onClose,
}: {
  projectId: string;
  candidateId: string | null;
  pathname: string;
  onClose: () => void;
}) {
  const historyKey = `${HISTORY_KEY_PREFIX}${projectId}`;
  const [messages, setMessages] = useState<StoredMessage[]>(() =>
    loadHistory(historyKey)
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingDraft, setStreamingDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Persist history per-project. Ephemeral by design — never goes to
  // the database.
  useEffect(() => {
    try {
      window.localStorage.setItem(historyKey, JSON.stringify(messages));
    } catch {
      // Quota / private-mode — silently ignore.
    }
  }, [historyKey, messages]);

  // Autoscroll on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingDraft]);

  // Cancel on unmount so an open stream doesn't outlive the panel.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const suggestionContext = useMemo(
    () => suggestionContextForPath(pathname),
    [pathname]
  );
  const suggestions = SUGGESTIONS[suggestionContext];

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || streaming) return;

      const userMsg: StoredMessage = {
        id: cryptoRandomId(),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      const nextHistory: StoredMessage[] = [...messages, userMsg];
      setMessages(nextHistory);
      setInput("");
      setStreaming(true);
      setStreamingDraft("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            candidateId,
            messages: nextHistory.map<CopilotMessage>((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errBody = await response
            .json()
            .catch(() => ({ error: `Copilot request failed (${response.status})` }));
          throw new Error(errBody.error || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assembled = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // Parse SSE-ish "data: {...}\n\n" frames.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            try {
              const parsed = JSON.parse(payload) as {
                delta?: string;
                done?: boolean;
                error?: string;
              };
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.delta) {
                assembled += parsed.delta;
                setStreamingDraft(assembled);
              }
            } catch (err) {
              throw err instanceof Error
                ? err
                : new Error("Stream parse error");
            }
          }
        }

        if (assembled.length > 0) {
          const assistantMsg: StoredMessage = {
            id: cryptoRandomId(),
            role: "assistant",
            content: assembled,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        const msg =
          err instanceof Error ? err.message : "Copilot stream failed.";
        setMessages((prev) => [
          ...prev,
          {
            id: cryptoRandomId(),
            role: "assistant",
            content: `⚠ ${msg}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setStreaming(false);
        setStreamingDraft("");
        abortRef.current = null;
      }
    },
    [candidateId, messages, projectId, streaming]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const clearHistory = () => {
    if (
      messages.length > 0 &&
      !window.confirm("Clear this Copilot conversation?")
    ) {
      return;
    }
    setMessages([]);
    try {
      window.localStorage.removeItem(historyKey);
    } catch {
      // ignore
    }
  };

  return (
    <aside
      role="dialog"
      aria-label="Recruiter Copilot"
      className="fixed top-0 right-0 z-30 h-screen w-full max-w-[400px] bg-surface-container border-l border-outline-variant flex flex-col shadow-2xl"
    >
      <header className="bg-surface-container-high px-4 py-3 border-b border-outline-variant flex items-center justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="font-mono-label text-mono-label text-primary uppercase tracking-widest flex items-center gap-2">
            <IconCopilot size={13} />
            Copilot
          </div>
          <p className="font-mono-label text-mono-label text-outline uppercase tracking-widest truncate">
            Project · {projectId.slice(0, 8)}
            {candidateId && ` · candidate ${candidateId.slice(0, 8)}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearHistory}
            disabled={streaming}
            aria-label="Clear conversation"
            title="Clear conversation"
            className="w-7 h-7 border border-outline-variant text-outline hover:text-on-surface hover:border-outline flex items-center justify-center transition-colors disabled:opacity-60"
          >
            <IconClose size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="w-7 h-7 border border-outline-variant text-outline hover:text-on-surface hover:border-outline flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !streaming && (
          <div className="space-y-3">
            <p className="text-body-main text-on-surface-variant leading-relaxed">
              Ask me anything about this search. I read the full project
              context — calibration, candidates, scores, feedback, health —
              before answering.
            </p>
            <ul className="space-y-1.5">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => send(s)}
                    className="w-full text-left px-3 py-2 bg-surface-container-low border border-outline-variant hover:border-primary hover:text-primary transition-colors font-mono-data text-body-main text-on-surface-variant"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {streaming && streamingDraft.length > 0 && (
          <MessageBubble
            message={{
              id: "streaming",
              role: "assistant",
              content: streamingDraft,
              createdAt: new Date().toISOString(),
            }}
            streaming
          />
        )}
        {streaming && streamingDraft.length === 0 && (
          <div className="flex items-center gap-2 text-outline">
            <IconRefresh size={14} className="animate-spin" />
            <span className="font-mono-label text-mono-label uppercase tracking-widest">
              Thinking
            </span>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-outline-variant bg-surface-container-low px-3 py-3 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={2}
          disabled={streaming}
          placeholder="Ask about candidates, ranking, feedback…"
          className="flex-1 bg-surface-container-lowest border border-outline-variant px-3 py-2 font-mono-data text-body-main text-on-surface focus:border-primary focus:outline-none transition-colors resize-none"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          aria-label="Send"
          className="px-3 py-2 bg-primary text-on-primary border border-primary hover:brightness-110 active:scale-[0.98] transition-[filter,transform] flex items-center disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <IconArrowRight size={17} />
        </button>
      </form>
    </aside>
  );
}

function MessageBubble({
  message,
  streaming = false,
}: {
  message: StoredMessage;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={cn(
        "border px-3 py-2 max-w-full",
        isUser
          ? "bg-primary-container/15 border-primary-container/40"
          : "bg-surface-container-low border-outline-variant"
      )}
    >
      <div className="font-mono-label text-mono-label text-outline uppercase tracking-widest mb-1">
        {isUser ? "You" : "Copilot"}
        {streaming && (
          <span className="ml-2 text-primary animate-pulse">▌</span>
        )}
      </div>
      <p className="font-mono-data text-body-main text-on-surface leading-relaxed whitespace-pre-wrap break-words">
        {message.content}
      </p>
    </div>
  );
}

function loadHistory(key: string): StoredMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is StoredMessage =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    );
  } catch {
    return [];
  }
}

function pickRouteId(
  params: ReturnType<typeof useParams>,
  key: string
): string | null {
  if (!params) return null;
  const v = (params as Record<string, string | string[] | undefined>)[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? null;
  return null;
}

function cryptoRandomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
