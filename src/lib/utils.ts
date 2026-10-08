import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * The product's six custom font sizes, declared as `--text-*` in
 * `globals.css` and therefore spelled `text-mono-label`,
 * `text-body-main` and so on at the call site.
 *
 * tailwind-merge has to be told about them. It resolves conflicts by
 * putting each class in a group and keeping the last of each group,
 * and it decides the group by matching the class name — so a custom
 * `text-<name>` it has never heard of is indistinguishable from a
 * custom text COLOUR of the same shape. It filed all of these under
 * colour, which made a size and a colour mutually exclusive:
 *
 *     twMerge("text-mono-label text-on-surface-variant")
 *       -> "text-on-surface-variant"   // size silently dropped
 *     twMerge("text-on-surface-variant text-mono-label")
 *       -> "text-mono-label"           // colour silently dropped
 *
 * That was live. `SelectTrigger` composes `text-on-surface` in its base
 * and `text-mono-label` in its tone class, in that order, so every
 * dropdown in the product shipped without the colour it asked for.
 *
 * It did not LOOK wrong, and the distinction matters. Measured on a
 * production build: the trigger fell through to its inherited colour,
 * which on the surfaces checked is `rgb(225,226,237)` — exactly
 * `--color-on-surface`. Same pixels either way, which is why nobody
 * caught it. The defect is that the match was a coincidence of where
 * the control happened to sit; drop the same control into a container
 * that sets a different colour and it silently takes that one instead.
 *
 * Eighty-seven files route one of these sizes through `cn()` where a
 * colour can collide with it.
 *
 * Declaring them as `font-size` makes the two independent: size still
 * beats size, colour still beats colour, and neither touches the
 * other.
 *
 * Add a `--text-*` token to `globals.css` and add it here too, or it
 * will start eating colours the day someone composes it with one.
 *
 * NOT listed: `text-body-s`, which appears 77 times in the app and
 * emits no CSS rule — there is no `--text-body-s` token and the built
 * stylesheet contains no `.text-body-s`. It is dead, and listing it
 * here would entrench it. It is also the same hazard in miniature: as
 * an unknown `text-*` it still reads as a colour, so a live colour
 * composed before it is dropped in favour of a class that does
 * nothing. Worth settling on its own terms, not here.
 */
export const FONT_SIZES = [
  "mono-label",
  "body-main",
  "data-point",
  "label-caps",
  "h1",
  "h2",
] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
