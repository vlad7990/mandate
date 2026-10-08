import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The product's button.
 *
 * Four hundred and twenty `<button>` elements were authored by hand
 * across a hundred and thirty-four files, and they had already agreed
 * on what a button looks like without anybody writing it down: the
 * same mono label, the same 45° notch on solid fills, the same accent
 * focus ring, the same `opacity-60` when disabled. A hundred and three
 * distinct class strings expressing roughly five ideas.
 *
 * This file is that agreement, written down. Nothing here is new — the
 * variants below were read off the clusters, not designed — so adopting
 * it is meant to change no pixel at desktop width.
 *
 * ## The one thing it adds
 *
 * `min-h-11 md:min-h-0`. The design handoff has required ≥44px touch
 * targets all along and the marketing surface enforces it in CSS; the
 * app did not, because a padding-sized button lands at 21–30px. A floor
 * released at `md` is the same idiom the sidebar nav items, the user
 * menu and `SelectField` use: 44px where a finger is pointing, density
 * back the moment a mouse is the likely instrument.
 *
 * ## Not for the marketing surface
 *
 * `(marketing)` has its own button in CSS — `.m-btn` in `marketing.css`,
 * which already carries the 44px floor and the editorial type ramp. It
 * is a documented surface theme, not a second system, and it is not
 * this component's job. Leave those seven alone.
 */

const button = cva(
  [
    // Every button is a centred row: an optional icon, a label, a gap.
    // Authored buttons that held only text got this for free from the
    // UA; saying it here means the icon ones need no extra class.
    "inline-flex items-center justify-center gap-1.5",
    "font-mono-label text-mono-label uppercase tracking-widest",
    // The touch floor. See the note above — this is the only line in
    // the file that is not simply transcribing what was already there.
    "min-h-11 md:min-h-0",
    // 171 of the authored buttons already spelled this ring; the rest
    // were inconsistent rather than deliberate.
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ],
  {
    variants: {
      variant: {
        /**
         * The solid call to action. `btn-notch` clips the bottom-right
         * corner at 45° — the founder's call, 2026-08-24, and it is
         * SOLID FILLS ONLY: `clip-path` clips the border with the box,
         * so an outlined button would show a sheared edge.
         */
        primary: [
          "btn-notch bg-primary-container text-on-primary-container",
          "hover:brightness-110 active:scale-[0.98]",
          "transition-[filter,transform]",
        ],
        /** The default bordered button — by count, the most common. */
        secondary: [
          "border border-outline-variant text-on-surface-variant",
          "transition-colors",
        ],
        /** Bordered, but in the accent. Used where outline must still read as the act. */
        accent: ["border border-primary text-primary", "transition-colors"],
        /** No chrome at all: a label that happens to be clickable. */
        ghost: ["text-outline", "transition-colors"],
      },
      /**
       * Hover colour, not fill. A destructive button in this product is
       * not red at rest — it is a normal button that turns `error` under
       * the cursor, which is why `tone` is separate from `variant`
       * rather than being a fifth variant.
       */
      tone: {
        neutral: "",
        danger: "",
      },
      size: {
        /** `px-3 py-1.5` — the row-level button, and the majority. */
        sm: "px-3 py-1.5",
        /** `px-4 py-2` — panel actions and form submits. */
        md: "px-4 py-2",
        /** `px-8 py-3` — the page's one big CTA. */
        lg: "px-8 py-3",
        /**
         * Square, icon only. The floor has to apply on both axes here:
         * a 44px-tall, 28px-wide target is still a miss.
         */
        icon: "h-7 w-7 min-w-11 p-0 md:min-w-0",
      },
    },
    compoundVariants: [
      {
        variant: ["secondary", "accent"],
        tone: "neutral",
        class: "hover:border-primary hover:text-primary",
      },
      {
        variant: ["secondary", "accent"],
        tone: "danger",
        class: "hover:border-error hover:text-error",
      },
      { variant: "ghost", tone: "neutral", class: "hover:text-primary" },
      { variant: "ghost", tone: "danger", class: "hover:text-error" },
      // The notch is a clipped corner, so the fill cannot also be the
      // hover signal without the corner appearing to move. Brightness
      // is what the authored buttons used, and `danger` leaves it be.
      { variant: "primary", tone: "danger", class: "hover:brightness-95" },
    ],
    defaultVariants: {
      variant: "secondary",
      tone: "neutral",
      size: "sm",
    },
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof button> & {
    /**
     * Render the child element instead of a `<button>`, keeping the
     * styling. For the handful of links that must look like buttons —
     * a `next/link` is not a button and should not be made into one
     * with an onClick.
     */
    readonly asChild?: boolean;
  };

function Button({
  className,
  variant,
  tone,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      // A `<button>` inside a form defaults to `submit`, which has
      // submitted more than one form that only wanted a row toggled.
      // Explicit `type` wins; absent it, this is inert.
      type={asChild ? undefined : (type ?? "button")}
      className={cn(button({ variant, tone, size }), className)}
      {...props}
    />
  );
}

export { Button, button as buttonVariants };
export type { ButtonProps };
