"use client";

import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export function UserMenu({ displayName, email, role }: UserMenuProps) {
  const initials = getInitials(displayName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open user menu"
          className="w-8 h-8 rounded-full border border-outline-variant overflow-hidden focus:outline-none focus:ring-1 focus:ring-primary-container hover:border-primary-container transition-colors"
        >
          <Avatar className="w-full h-full rounded-full">
            <AvatarFallback className="bg-surface-container-high text-on-surface text-mono-label font-mono-label uppercase">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-56 bg-surface-container border border-outline-variant text-on-surface"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <div className="flex flex-col gap-1">
            <span className="text-on-surface text-body-main">{displayName}</span>
            <span className="text-outline text-mono-label font-mono-label uppercase truncate">
              {email}
            </span>
            {role && (
              <span className="text-primary text-mono-label font-mono-label uppercase tracking-wider mt-1">
                ROLE: {role}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-outline-variant" />
        <DropdownMenuItem asChild>
          <Link
            href="/settings"
            className="cursor-pointer font-mono-label text-mono-label uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-[16px] mr-2 text-outline">
              settings
            </span>
            SETTINGS
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-outline-variant" />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full flex items-center px-3 py-1.5 text-error hover:bg-error-container/30 rounded-sm cursor-pointer transition-colors font-mono-label text-mono-label uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-error"
          >
            <span className="material-symbols-outlined text-[16px] mr-2">
              logout
            </span>
            SIGN_OUT
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
