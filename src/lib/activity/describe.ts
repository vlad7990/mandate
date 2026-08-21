/**
 * Turning a stored event into a sentence.
 *
 * The wording is derived here rather than stored on the row, so improving
 * a phrase does not mean rewriting history — and so a row written by an
 * older build still reads correctly under a newer one. What *is* stored is
 * the facts: before and after values, amounts, currencies, reasons.
 *
 * Every function is pure over a row, so the feed, a per-entity history
 * panel and a test all produce the same string from the same event.
 */

import { formatMoney } from "@/lib/fees/compute";
import { PLACEMENT_STATUS_LABELS, parsePlacementStatus } from "@/lib/fees/types";
import { ROLE_LABELS, parseRole } from "@/lib/auth/roles";
import type { ActivityEventRow, ActivityEventType } from "./types";

/** Read a string out of `detail`, or null. */
function str(detail: Record<string, unknown>, key: string): string | null {
  const value = detail[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Read a number out of `detail`. Postgres numerics arrive as numbers or strings. */
function num(detail: Record<string, unknown>, key: string): number | null {
  const value = detail[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** A placement status, labelled if we recognise it, raw if we do not. */
function stage(value: unknown): string {
  const parsed = parsePlacementStatus(value);
  if (parsed) return PLACEMENT_STATUS_LABELS[parsed].toLowerCase();
  return typeof value === "string" && value ? value.replace(/_/g, " ") : "unknown";
}

function role(value: unknown): string {
  const parsed = parseRole(value);
  if (parsed) return ROLE_LABELS[parsed];
  return typeof value === "string" && value ? value : "unknown";
}

/** Money from a detail pair, in whichever currency the event recorded. */
function money(detail: Record<string, unknown>, amountKey: string, currencyKey = "currency"): string | null {
  const amount = num(detail, amountKey);
  if (amount == null) return null;
  const currency = str(detail, currencyKey) ?? "USD";
  return formatMoney(amount, currency);
}

/**
 * One line describing what happened.
 *
 * Deliberately does not name the actor — the feed renders that separately
 * so it can be styled and so a per-person view is not repeating the name
 * on every row.
 */
export function describeActivity(event: ActivityEventRow): string {
  const d = event.detail ?? {};

  switch (event.event_type) {
    case "placement_recorded":
      return `Recorded a placement${str(d, "offer_date") ? `, offer dated ${str(d, "offer_date")}` : ""}`;

    case "placement_status_changed": {
      const from = stage(d.from);
      const to = stage(d.to);
      const reason = str(d, "reason");
      return `Moved the placement from ${from} to ${to}${reason ? ` — ${reason}` : ""}`;
    }

    case "placement_signoff_changed": {
      const from = str(d, "from");
      const to = str(d, "to");
      // Three sentences rather than one with two optional halves, because
      // "changed the sign-off from nobody to Jane" reads like a bug.
      if (to && from) return `Changed who signed the placement off from ${from} to ${to}`;
      if (to) return `Recorded ${to} as signing the placement off`;
      return `Removed ${from ?? "the contact"} as signing the placement off`;
    }

    case "placement_deleted":
      return "Deleted a placement";

    case "client_contact_added": {
      const who = contactName(d);
      // `mode` distinguishes a new contact from a restored one; the event
      // type is the same because the effect a reader cares about is the
      // same — this person is a contact again.
      if (str(d, "mode") === "restored") return `Restored ${who} as a contact`;
      const title = str(d, "title");
      return `Added ${who}${title ? `, ${title},` : ""} as a contact${
        d.is_primary === true ? " and made them the primary" : ""
      }`;
    }

    case "client_contact_updated": {
      const who = contactName(d);
      const from = str(d, "name_from");
      if (from && from !== str(d, "name")) return `Renamed the contact ${from} to ${who}`;
      if (d.is_primary === true && d.was_primary === false) {
        return `Made ${who} the primary contact`;
      }
      if (d.is_primary === false && d.was_primary === true) {
        return `${who} is no longer the primary contact`;
      }
      return `Updated the contact ${who}`;
    }

    case "client_contact_removed": {
      const who = contactName(d);
      return str(d, "mode") === "archived"
        ? `Archived the contact ${who}`
        : `Deleted the contact ${who}`;
    }

    case "fee_recorded": {
      const total = money(d, "total");
      const pct = num(d, "percentage");
      const model = str(d, "model");
      const parts = [model, pct != null ? `${pct}%` : null].filter(Boolean).join(", ");
      return `Recorded a fee of ${total ?? "an unrecorded amount"}${parts ? ` (${parts})` : ""}`;
    }

    case "fee_updated": {
      const from = money(d, "total_from");
      const to = money(d, "total_to");
      if (from && to && from !== to) return `Changed the fee from ${from} to ${to}`;

      const pctFrom = num(d, "percentage_from");
      const pctTo = num(d, "percentage_to");
      if (pctFrom != null && pctTo != null && pctFrom !== pctTo) {
        return `Changed the fee rate from ${pctFrom}% to ${pctTo}%`;
      }

      const curFrom = str(d, "currency_from");
      const curTo = str(d, "currency_to");
      if (curFrom && curTo && curFrom !== curTo) {
        return `Changed the fee currency from ${curFrom} to ${curTo}`;
      }
      return "Changed the fee";
    }

    case "fee_line_earned": {
      const label = str(d, "label") ?? "An instalment";
      const amount = money(d, "amount");
      const on = str(d, "earned_on");
      return `Marked ${label}${amount ? ` (${amount})` : ""} earned${on ? ` on ${on}` : ""}`;
    }

    case "fee_line_cancelled": {
      const label = str(d, "label") ?? "An instalment";
      return `Cancelled ${label}`;
    }

    case "fee_reversed": {
      const amount = money(d, "amount");
      const reason = str(d, "reason");
      // The amount is stored negative; the sentence already says "reversed",
      // so showing "-US$30,000" here would read as a double negative.
      const shown = amount ? amount.replace("-", "") : null;
      return `Reversed ${shown ?? "a fee"}${reason ? ` — ${reason}` : ""}`;
    }

    case "fee_terms_created":
      return `Added ${str(d, "scope") === "client" ? "client" : "mandate"} fee terms${termsSuffix(d)}`;

    case "fee_terms_updated":
      return `Updated ${str(d, "scope") === "client" ? "client" : "mandate"} fee terms${termsSuffix(d)}`;

    case "fee_terms_deleted":
      return `Removed ${str(d, "scope") === "client" ? "client" : "mandate"} fee terms`;

    case "member_role_changed": {
      const who = str(d, "member") ?? "a member";
      return `Changed ${who} from ${role(d.from)} to ${role(d.to)}`;
    }

    case "member_status_changed": {
      const who = str(d, "member") ?? "a member";
      return `Changed ${who}'s account from ${str(d, "from") ?? "unknown"} to ${str(d, "to") ?? "unknown"}`;
    }

    case "member_founder_changed": {
      const who = str(d, "member") ?? "a member";
      return d.to === true
        ? `Made ${who} a platform operator`
        : `Removed platform operator from ${who}`;
    }

    case "shortlist_published": {
      const count = num(d, "count");
      return `Published a shortlist${count != null ? ` of ${count}` : ""}`;
    }

    case "report_exported":
      return `Exported ${str(d, "kind") ?? "a report"}`;

    case "hm_portal_opened":
      return "Opened the hiring-manager portal";

    case "mandate_reassigned": {
      const from = str(d, "from_label") ?? "unassigned";
      const to = str(d, "to_label") ?? "unassigned";
      return `Reassigned the mandate from ${from} to ${to}`;
    }

    case "candidate_evaluated": {
      const trigger = str(d, "trigger");
      return trigger === "regenerate"
        ? "Re-evaluated the candidate against the role"
        : "Evaluated the candidate against the role";
    }

    case "candidate_positioned": {
      // The byline names the positioner; the sentence names the trigger.
      const trigger = str(d, "trigger");
      return trigger === "regenerate"
        ? "Rewrote the candidate's positioning kit"
        : "Wrote the candidate's positioning kit";
    }

    case "candidate_researched": {
      // The byline names the researcher; the sentence names the trigger.
      const trigger = str(d, "trigger");
      const sources = num(d, "sources_count");
      const base =
        trigger === "re_research"
          ? "Re-researched the candidate's public presence"
          : "Researched the candidate's public presence";
      return sources != null && sources > 0
        ? `${base} — ${sources} source${sources === 1 ? "" : "s"}`
        : base;
    }

    case "candidate_parsed": {
      // Same D4 split: the byline names the parser, the sentence names
      // the trigger. The candidate link is rendered by the feed from
      // candidate_id; repeating the name here would double it.
      const trigger = str(d, "trigger");
      const source =
        trigger === "network_copy"
          ? " from a network copy"
          : trigger === "upload"
            ? " from an upload"
            : "";
      return `Parsed the CV${source}${
        d.identity_changed === true ? " and updated the candidate's details" : ""
      }`;
    }

    case "candidates_ranked": {
      // The byline names the ranker; the sentence names the trigger —
      // the same D4 split as feedback_interpreted.
      const scored = num(d, "scored");
      const moved = num(d, "moved");
      const trigger = str(d, "trigger");
      const why =
        trigger === "weights_edit"
          ? " after a calibration change"
          : trigger === "new_candidate"
            ? " for a new candidate"
            : trigger === "feedback"
              ? " after new feedback"
              : trigger === "recalibration"
                ? " after a recalibration"
                : "";
      const size =
        scored != null ? ` — ${scored} candidate${scored === 1 ? "" : "s"}` : "";
      const movement = moved != null && moved > 0 ? `, ${moved} moved` : "";
      return `Scored the slate${why}${size}${movement}`;
    }

    case "feedback_interpreted": {
      // The actor byline already names the agent; the sentence names the
      // trigger — D4's whole point is that the two are different people.
      const source = str(d, "hm_label");
      const recalibrated = d.recalibrated === true;
      return `Interpreted hiring-manager feedback${source ? ` from ${source}` : ""}${
        recalibrated ? " and recalibrated the search's weights" : ""
      }`;
    }

    default: {
      // A row written by a migration this build predates. Render it rather
      // than crash the feed — an audit trail that goes blank on an
      // unrecognised row is the opposite of what it is for.
      const exhaustive: never = event.event_type;
      return String(exhaustive).replace(/_/g, " ");
    }
  }
}

/**
 * The contact's name out of `detail`.
 *
 * The trail stores the name rather than joining to `client_contacts`,
 * because the row it would join to is gone by the time a removal is being
 * read back. Same reasoning as `actor_label` in 053 and
 * `signed_off_by_label` on a placement.
 */
function contactName(d: Record<string, unknown>): string {
  return str(d, "name") ?? "a contact";
}

function termsSuffix(d: Record<string, unknown>): string {
  const pct = num(d, "percentage");
  const fixed = num(d, "fixed_amount");
  const currency = str(d, "currency") ?? "USD";
  if (pct != null) return ` at ${pct}%`;
  if (fixed != null) return ` at ${formatMoney(fixed, currency)}`;
  return "";
}

/** Who did it, for the feed's byline. */
export function describeActor(event: ActivityEventRow): string {
  return event.actor_label?.trim() || "System";
}

/**
 * Whether an event carries money a reader might not be allowed to see.
 *
 * Only used to decide styling and grouping in the UI — RLS has already
 * refused to send rows the caller may not read, so this never has to
 * withhold anything. It exists so the feed can mark the commercial rows,
 * which is useful precisely because not everyone is seeing them.
 */
export function isMoneyEvent(type: ActivityEventType): boolean {
  return type.startsWith("fee_");
}
