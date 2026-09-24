"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { type Role } from "@/lib/auth/roles";
import {
  TAB_GUIDES_SEEN_COOKIE,
  parseSeenGuides,
  tabGuideFor,
  withSeenGuide,
} from "@/lib/tab-guides";
import {
  type HandbookBlock,
  type HandbookInline,
  type HandbookSection,
} from "@/lib/handbook/markdown";
import { IconClose } from "@/components/icons";

/**
 * "What am I supposed to do on this screen?" (§198, gate D1/D2).
 *
 * One insertion point in the Topbar rather than a help affordance on
 * nineteen pages: `PageHeader` is on three screens, so per-page would
 * have meant touching every page and missing the next one somebody adds.
 * Keyed on the pathname through the nav model, a tab added to
 * `nav-model.ts` tomorrow gets the affordance for free — and the guard
 * test forces someone to write its words.
 *
 * D2: it never auto-opens. An unread dot says help exists; nineteen
 * interruptions across a first week would each land on someone
 * mid-task, and restraint is what the terminal voice is built on.
 *
 * The dot is gated on `useHydrated` because it reads `document.cookie`:
 * the server cannot know what this reader has opened, and rendering the
 * dot before hydration is React #418 (§128 F-5) all over again.
 */
export function TabGuide({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const hydrated = useHydrated();
  // The panel remembers WHICH path it was opened for rather than a bare
  // boolean, so navigating closes it by derivation. The effect that would
  // otherwise do it is both a lint refusal here and a real bug: the panel
  // describes the tab you were standing on, and carrying it across a
  // route change would describe the wrong screen for one frame.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [guide, setGuide] = useState<HandbookSection | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  const cache = useRef(new Map<string, HandbookSection>());
  const open = openFor === pathname;

  // The cookie IS the state — React only mirrors it. Read through
  // `useSyncExternalStore` (the §132 idiom) because reading it in an
  // effect and calling setState is a cascading render the linter
  // refuses, and reading it during render would never update.
  const seen = parseSeenGuides(useSyncExternalStore(subscribeToSeen, readSeen, readSeenOnServer));

  const target = tabGuideFor(pathname, role);
  const slug = target?.slug ?? null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenFor(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const load = useCallback(async (which: string) => {
    const hit = cache.current.get(which);
    if (hit) {
      setGuide(hit);
      setState("idle");
      return;
    }
    setState("loading");
    try {
      const res = await fetch(`/api/tab-guides/${which}`);
      if (!res.ok) throw new Error(String(res.status));
      const section = (await res.json()) as HandbookSection;
      cache.current.set(which, section);
      setGuide(section);
      setState("idle");
    } catch {
      setGuide(null);
      setState("failed");
    }
  }, []);

  if (!target || !slug) return null;

  const which = slug;
  // Before hydration the dot is suppressed rather than guessed: a dot
  // that appears and then vanishes is worse than one that arrives late.
  const unread = hydrated && !seen.has(which);

  function openPanel() {
    setOpenFor(pathname);
    void load(which);
    // One year. The reader has met this screen's guide; asking again
    // next week would be noise, the same reasoning the sample banner uses.
    const next = withSeenGuide(readSeen(), which);
    document.cookie = `${TAB_GUIDES_SEEN_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    notifySeenChanged();
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label={`What do I do on ${target.label}?`}
        aria-expanded={open}
        title={`Guide — ${target.label}`}
        className="relative flex h-7 w-7 items-center justify-center border border-outline-variant font-mono-label text-mono-label text-outline transition-colors hover:border-outline hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        ?
        {unread && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 bg-primary"
          />
        )}
      </button>

      {open && (
        <>
          {/* Not `aria-hidden` alone: the backdrop is the click target
              that closes the panel, and a pointer user expects it. */}
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpenFor(null)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Guide — ${target.label}`}
            className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[420px] flex-col border-l border-outline-variant bg-surface-container shadow-2xl"
          >
            <header className="flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-high px-4 py-3">
              <div className="min-w-0 space-y-0.5">
                <p className="font-mono-label text-mono-label uppercase tracking-widest text-primary">
                  Guide
                </p>
                <p className="truncate text-body-main font-semibold text-on-surface">
                  {guide?.title ?? target.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenFor(null)}
                aria-label="Close guide"
                autoFocus
                className="flex h-7 w-7 shrink-0 items-center justify-center border border-outline-variant text-outline transition-colors hover:border-outline hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <IconClose size={14} />
              </button>
            </header>

            <div className="m-tab-guide flex-1 overflow-y-auto px-4 py-4">
              {state === "loading" && (
                <p className="font-mono-label text-mono-label uppercase tracking-widest text-outline">
                  Loading…
                </p>
              )}
              {state === "failed" && (
                <p className="text-body-main leading-relaxed text-on-surface-variant">
                  The guide for this screen could not be loaded. Nothing on
                  the screen itself is affected — the whole set is also at{" "}
                  <a
                    href="/handbook#tab-guides"
                    className="text-primary underline underline-offset-2"
                  >
                    the handbook
                  </a>
                  .
                </p>
              )}
              {state === "idle" &&
                guide?.blocks.map((block, i) => <Block key={i} block={block} />)}
            </div>

            <footer className="border-t border-outline-variant px-4 py-3">
              <a
                href="/handbook#tab-guides"
                className="font-mono-label text-mono-label uppercase tracking-widest text-outline transition-colors hover:text-primary"
              >
                Every screen&apos;s guide →
              </a>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

/**
 * The seen-guides cookie as an external store.
 *
 * `getSnapshot` must return a STABLE value or React re-renders forever,
 * which is why it returns the raw cookie string and the Set is built
 * during render. The server snapshot is the empty string; the dot is
 * separately gated on `useHydrated`, so that empty first answer never
 * reaches the screen as a dot that then vanishes.
 */
const seenListeners = new Set<() => void>();

function subscribeToSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => {
    seenListeners.delete(listener);
  };
}

function notifySeenChanged() {
  for (const listener of seenListeners) listener();
}

function readSeen(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TAB_GUIDES_SEEN_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : "";
}

function readSeenOnServer(): string {
  return "";
}

function Block({ block }: { block: HandbookBlock }) {
  if (block.kind === "heading") {
    return (
      <p className="mt-5 font-mono-label text-mono-label uppercase tracking-widest text-primary first:mt-0">
        {block.text}
      </p>
    );
  }
  if (block.kind === "list") {
    const items = block.items.map((item, i) => (
      <li key={i} className="pl-1">
        <Inline runs={item} />
      </li>
    ));
    return block.ordered ? (
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-body-main leading-relaxed text-on-surface-variant">
        {items}
      </ol>
    ) : (
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body-main leading-relaxed text-on-surface-variant">
        {items}
      </ul>
    );
  }
  return (
    <p className="mt-2 text-body-main leading-relaxed text-on-surface-variant">
      <Inline runs={block.inline} />
    </p>
  );
}

function Inline({ runs }: { runs: HandbookInline[] }) {
  return (
    <>
      {runs.map((run, i) => {
        switch (run.kind) {
          case "strong":
            return (
              <strong key={i} className="font-semibold text-on-surface">
                {run.text}
              </strong>
            );
          case "em":
            return <em key={i}>{run.text}</em>;
          case "code":
            return (
              <code
                key={i}
                className="font-mono-label text-[0.95em] text-on-surface"
              >
                {run.text}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={run.href}
                className="text-primary underline underline-offset-2"
              >
                {run.text}
              </a>
            );
          default:
            return <span key={i}>{run.text}</span>;
        }
      })}
    </>
  );
}
