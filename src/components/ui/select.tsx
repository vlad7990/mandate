"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { IconCheck, IconChevronDown } from "@/components/icons";

/**
 * The product's dropdown.
 *
 * Every picker in the app used to be a native `<select>`. The closed
 * control looked right — square border, mono label, our elevation ramp —
 * but the moment you clicked it the *list* was drawn by the operating
 * system. No stylesheet can reach inside that popup: it ignores the
 * tokens, the type, the corners and the elevation, and on Windows it
 * still reads as a 1990s combo box. Sixty controls across thirty-eight
 * files broke the visual language at exactly the moment a user was
 * looking hardest at them.
 *
 * So the list is ours now. Radix supplies the behaviour a native select
 * gives for free and is tedious to rebuild — typeahead, arrow and
 * Home/End navigation, Escape, focus return, scroll-into-view, correct
 * `aria-activedescendant` — and the surface on top is the field
 * language continued inward: square corners, one-pixel --border frame,
 * the --bg-elev-2 popover, hover on --bg-elev-3, and the brand accent
 * marking the current choice with a left edge and a check.
 *
 * Two pieces live here. `SelectField` is the drop-in for an
 * `options`-shaped list and is what nearly every call site wants. The
 * primitives underneath it are exported for the handful of places that
 * need to compose something unusual.
 */

/**
 * Radix reserves the empty string for "nothing is selected" and throws
 * if an item claims it. A native `<select>`, though, routinely carries a
 * real, labelled choice at "" — `<option value="">Unassigned</option>`,
 * `<option value="">Whole book</option>` — and twenty-six of ours did.
 *
 * Rather than push that problem out to every call site, "" stays a legal
 * value in this component's API: it is swapped for this sentinel on the
 * way into Radix and swapped back on the way out. Nothing above this
 * file ever sees it, and nothing below it ever sees "".
 */
const EMPTY_VALUE = "__mandate_empty_option__";

const toRadix = (value: string) => (value === "" ? EMPTY_VALUE : value);
const fromRadix = (value: string) => (value === EMPTY_VALUE ? "" : value);

/**
 * Two type registers, because one does not fit every list.
 *
 * `label` is the house default and matches the trigger: 11px Space
 * Grotesk, uppercase, tracked. It is right for the closed vocabularies
 * these controls mostly hold — SOURCED, SHORTLISTED, ADMIN, DRAFT.
 *
 * `text` is for lists of proper nouns: people, clients, model ids.
 * Uppercasing a person's name is not a style, it is a mistake, and
 * `tracking-wider` on a long company name is unreadable. Same frame,
 * same motion, sentence case.
 */
type Tone = "label" | "text";

const TONE_CLASS: Record<Tone, string> = {
  label: "font-mono-label text-mono-label uppercase tracking-wider",
  text: "text-body-main tracking-normal",
};

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  tone = "label",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { tone?: Tone }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        // `group` so the chevron can read the open state off the trigger.
        "group flex h-8 w-full items-center justify-between gap-2 border border-outline-variant bg-surface-container-low px-2.5 text-left text-on-surface transition-colors outline-none",
        // 44px floor below `md`, where a finger is doing the pointing.
        //
        // The design handoff has required ≥44px touch targets all along
        // and the marketing surface enforces it in CSS; the app enforces
        // it the same way the sidebar nav items and the user menu do —
        // `min-h-11` released at `md`, so density returns the moment a
        // mouse is the likely instrument. At ≥768px this renders exactly
        // what it rendered before.
        //
        // A floor rather than a height on purpose: two call sites pass
        // `h-auto` and would defeat an `h-11`, and nothing can defeat a
        // `min-height`. One line here reaches all 57 controls.
        "min-h-11 md:min-h-0",
        "hover:border-outline",
        // Open and focused share one treatment: the accent border. A
        // keyboard user and a mouse user see the same control.
        "focus-visible:border-primary data-open:border-primary",
        "disabled:pointer-events-none disabled:opacity-60",
        // Radix marks the trigger `data-placeholder` while unset, which
        // is the only honest moment to drop to the muted ink.
        "data-placeholder:text-outline",
        // Radix renders the value in a span; a long client name has to
        // clip rather than stretch the control out of the row.
        "[&>span]:truncate",
        TONE_CLASS[tone],
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <IconChevronDown
          size={14}
          className="shrink-0 text-outline transition-transform duration-150 group-data-[state=open]:rotate-180"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center bg-surface-container py-1 text-outline",
        className
      )}
      {...props}
    >
      <IconChevronDown size={12} className="rotate-180" />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center bg-surface-container py-1 text-outline",
        className
      )}
      {...props}
    >
      <IconChevronDown size={12} />
    </SelectPrimitive.ScrollDownButton>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "relative z-50 overflow-hidden border border-outline-variant bg-surface-container text-on-surface",
          // A real cast shadow, because this panel floats over content
          // one and two steps down the ramp and a border alone leaves it
          // looking pasted on.
          "shadow-[0_12px_32px_-8px_rgba(0,0,0,0.65)]",
          // Never narrower than the control it came from, never taller
          // than the space available — and never wider than the window.
          // Some of these lists carry a sentence per option (the
          // archetypes do), and a panel sized to its widest row would
          // otherwise run off a phone screen.
          "min-w-(--radix-select-trigger-width) max-h-(--radix-select-content-available-height) max-w-[calc(100vw-1.5rem)]",
          // Same 100ms fade-and-lift the user menu uses, so the whole
          // product opens overlays one way.
          "origin-(--radix-select-content-transform-origin) duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
          className
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          // Vertical padding only: the selected item's accent edge has to
          // sit flush against the panel's left border to read as an edge
          // rather than a floating tick.
          className="py-1"
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "px-2.5 py-1.5 font-mono-label text-label-caps uppercase text-outline",
        className
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  tone = "label",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & { tone?: Tone }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 border-l-2 border-l-transparent py-1.5 pr-8 pl-2.5 text-on-surface-variant transition-colors outline-none select-none",
        // Radix drives `data-highlighted` for both hover and keyboard, so
        // the mouse and the arrow keys light the same row.
        "data-highlighted:bg-surface-container-high data-highlighted:text-on-surface",
        // The current choice: accent edge against the panel border, accent
        // ink, and a check. Three signals, none of them colour alone.
        "data-[state=checked]:border-l-primary data-[state=checked]:text-primary",
        "data-disabled:pointer-events-none data-disabled:opacity-40",
        TONE_CLASS[tone],
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="pointer-events-none absolute right-2 flex items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck size={13} className="text-primary" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("my-1 h-px bg-outline-variant", className)}
      {...props}
    />
  );
}

export type SelectFieldOption = {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
};

type SelectFieldProps = {
  readonly options: readonly SelectFieldOption[];
  /** Controlled value. "" is legal and may be a real, labelled choice. */
  readonly value?: string;
  /** Uncontrolled seed. Use with a `name` in a plain form. */
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  /**
   * Submits with a surrounding form.
   *
   * Radix can mirror its own value into a hidden input, but it would
   * mirror the sentinel, so a form whose empty option means "unassigned"
   * would post the sentinel string. We write the hidden input ourselves
   * instead and never hand `name` to Radix — one code path, and what
   * posts is exactly what a native `<select>` would have posted.
   */
  readonly name?: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  /** Shown only when nothing is selected and no option claims "". */
  readonly placeholder?: string;
  readonly tone?: Tone;
  /** Classes for the trigger — heights and widths belong here. */
  readonly className?: string;
  /** Classes for the popover panel. */
  readonly contentClassName?: string;
  readonly align?: "start" | "center" | "end";
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly "aria-invalid"?: boolean;
};

/**
 * The drop-in. Takes the same shape a native `<select>` call site
 * already has — a value, a change handler, a list of options — and
 * renders the styled list instead of the operating system's.
 */
function SelectField({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  id,
  disabled,
  required,
  placeholder,
  tone = "label",
  className,
  contentClassName,
  align = "start",
  ...aria
}: SelectFieldProps) {
  // Controlled when `value` is supplied, uncontrolled otherwise — the
  // same contract the native element has, so neither kind of call site
  // has to change how it holds state.
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const current = value !== undefined ? value : internal;

  // The sentinel is only correct when "" is a real, labelled option.
  //
  // Radix reserves "" for exactly one purpose — "nothing is selected,
  // show the placeholder" — so handing it the sentinel on a list that
  // has no "" option tells it something *is* selected, it then finds no
  // item carrying that value, and the trigger renders blank instead of
  // the placeholder. Pass "" straight through in that case and let Radix
  // do the job it reserved the value for.
  const hasEmptyOption = options.some((option) => option.value === "");
  const radixValue = hasEmptyOption ? toRadix(current) : current;

  const handleValueChange = (next: string) => {
    const outward = fromRadix(next);
    if (value === undefined) setInternal(outward);
    onValueChange?.(outward);
  };

  return (
    <>
      {name !== undefined && (
        <input type="hidden" name={name} value={current} />
      )}
      <Select
        value={radixValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        required={required}
      >
        <SelectTrigger
          id={id}
          tone={tone}
          className={className}
          aria-label={aria["aria-label"]}
          aria-labelledby={aria["aria-labelledby"]}
          aria-invalid={aria["aria-invalid"]}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align={align} className={contentClassName}>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={toRadix(option.value)}
              disabled={option.disabled}
              tone={tone}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export {
  Select,
  SelectContent,
  SelectField,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  EMPTY_VALUE,
};
