/**
 * Outreach vocabulary, kept out of the actions file.
 *
 * `OUTREACH_CHANNELS` used to be exported from `outreach-actions.ts`,
 * which carries `"use server"` — and a `"use server"` module may only
 * export async functions. Next builds the page's action manifest from
 * every such export, so the array made the manifest invalid and *every*
 * server action on the candidate page failed with
 * `A "use server" file can only export async functions, found object`.
 *
 * It went unnoticed because it only fires when an action is actually
 * invoked from this page, and the outreach panel had never been driven in
 * a browser — it was still on the "never seen rendered" list. Recording a
 * placement was the first action anyone submitted from here, so it looked
 * like a placement bug and was not.
 *
 * Same shape as `notes-constants.ts`, which already existed for this
 * reason. Anything shared between a client panel and a server action
 * belongs in a file like this one, not in the action module.
 */

export const OUTREACH_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "phone", label: "Phone" },
  { value: "referral", label: "Referral / intro" },
  { value: "other", label: "Other" },
] as const;

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number]["value"];
export type OutreachDirection = "outbound" | "inbound";
