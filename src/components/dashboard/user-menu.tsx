"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconSelector, IconSettings } from "@/components/icons";

type UserMenuProps = {
  displayName: string;
  email: string;
  role: string | null;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The identity block pinned to the foot of the rail.
 *
 * On the expanded rail it names the person and their role, because
 * "which account am I in" is a question a bare 32px avatar cannot
 * answer — and on a product where approvals are recorded against an
 * identity, it is a question worth answering on every screen. On the
 * icon rail it collapses back to the avatar alone.
 */
export function UserMenu({ displayName, email, role }: UserMenuProps) {
  const initials = getInitials(displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu — ${displayName}`}
          className="flex w-full min-h-11 items-center gap-2.5 p-1.5 text-left transition-colors hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:justify-center xl:justify-start"
        >
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-outline-variant bg-surface-container-high font-mono-label text-[11px] font-semibold text-on-surface-variant"
          >
            {initials}
          </span>

          <span className="min-w-0 flex-1 md:hidden xl:block">
            <span className="block truncate text-xs font-medium text-on-surface">
              {displayName}
            </span>
            <span className="block truncate text-[11px] text-outline">
              {role ? `${role} · ` : ""}
              {email}
            </span>
          </span>

          <IconSelector
            size={16}
            className="shrink-0 text-outline md:hidden xl:block"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-60 border border-outline-variant bg-surface-container text-on-surface"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block text-sm text-on-surface">{displayName}</span>
          <span className="mt-0.5 block truncate text-xs text-outline">
            {email}
          </span>
          {role && (
            <span className="mt-1.5 block font-mono-label text-mono-label uppercase tracking-wider text-primary">
              {role}
            </span>
          )}
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-outline-variant" />

        <DropdownMenuItem asChild>
          <Link href="/app/settings" className="cursor-pointer gap-2 text-sm">
            <IconSettings size={16} className="text-outline" />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-outline-variant" />

        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-error transition-colors hover:bg-error-container/30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-error"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
              <path d="M10 17l-5-5 5-5M5 12h11" />
            </svg>
            Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
