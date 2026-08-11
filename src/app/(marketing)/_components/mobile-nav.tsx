"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Mobile navigation for the marketing surface.
 *
 * Below 1120px the desktop link row is display:none, and until now
 * nothing replaced it — on a ~13,000px page that left no way to reach
 * pricing or the demo except scrolling the whole thing. This is the
 * replacement: a disclosure button and a panel carrying the same four
 * destinations plus both auth actions.
 *
 * Behaviour worth keeping if this is refactored:
 * - Escape closes and returns focus to the trigger
 * - the panel is inert to screen readers while closed (hidden attr)
 * - background scroll is locked while open, and the lock is always
 *   released on unmount so a route change can never strand it
 * - any link click closes, so anchor jumps land on a clean page
 */

const LINKS = [
  { href: "#how", label: "Platform" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#simulator", label: "Live Demo" },
  { href: "#executive-intelligence", label: "Executive Intelligence" },
  { href: "#pricing", label: "Pricing" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes from anywhere, including from inside the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock background scroll while the panel is open. The cleanup runs on
  // unmount as well as on close, so the lock cannot outlive the panel.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus into the panel on open so keyboard users are not left
  // behind the trigger.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
  }, [open]);

  return (
    <div className="m-mnav">
      <button
        ref={triggerRef}
        type="button"
        className="m-mnav__trigger"
        aria-expanded={open}
        aria-controls="m-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`m-mnav__bars${open ? " m-mnav__bars--open" : ""}`} aria-hidden>
          <span />
          <span />
        </span>
      </button>

      {open && (
        <div
          className="m-mnav__scrim"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}

      <div
        ref={panelRef}
        id="m-mobile-menu"
        className="m-mnav__panel"
        hidden={!open}
      >
        <nav aria-label="Primary mobile">
          <ul className="m-mnav__list">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="m-mnav__link"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="m-mnav__actions">
          <Link
            href="/auth/signin"
            className="m-btn m-btn--ghost"
            onClick={() => setOpen(false)}
          >
            Log In
          </Link>
          <Link
            href="/request-access"
            className="m-btn m-btn--primary"
            onClick={() => setOpen(false)}
          >
            Request Access
          </Link>
        </div>
      </div>
    </div>
  );
}
