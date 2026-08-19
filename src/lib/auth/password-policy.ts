/**
 * Password policy — the app-side half of it.
 *
 * This file mirrors the Supabase Auth settings at
 * `Dashboard → Authentication → Providers → Email`. **The two must stay in
 * sync**, and this side is not the one that matters: GoTrue is where the
 * rule is enforced, because a caller holding their own anon key can call
 * `supabase.auth.signUp()` directly and never reach `signUpAction`. This
 * exists so the product tells the truth about itself before the auth server
 * has to refuse — the same three-layer argument as `roles.ts` and §2 of the
 * handoff, where only the last layer is a boundary.
 *
 * That means raising the numbers here is worth nothing on its own. It is
 * worth something in the other direction: if this file is *looser* than the
 * dashboard, a user passes our check, submits, and gets a raw GoTrue error
 * for a rule the form never mentioned. That was the state before — the form
 * asked for 8 characters and no character classes.
 *
 * The server-side settings, applied via the Management API and verified by
 * direct GoTrue probe on 2026-08-19 (an 8-char and a letters-only password
 * both refused by the auth server itself; handoff §18):
 *
 *   Minimum password length ....... 12
 *   Required characters ........... lowercase, uppercase, digits, symbols
 *   Email confirmations ........... on (mailer_autoconfirm off)
 *
 * Leaked-password protection (HaveIBeenPwned) belongs beside those and
 * is Pro-gated — see the pre-launch checklist in CLAUDE.md.
 */

export const PASSWORD_MIN_LENGTH = 12;

/**
 * Exactly the symbol set Supabase Auth accepts, copied from the Password
 * Security guide. Not a regex class on purpose — the set contains `\`, `"`,
 * `]` and a backtick, and every attempt to express it as an escaped
 * character class is a bug waiting to be written. Membership is tested
 * against this string directly.
 */
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

const SYMBOL_SET = new Set(PASSWORD_SYMBOLS.split(""));

/**
 * Returns a human-readable reason the password is unacceptable, or `null`
 * if it passes. One message rather than a list, because the form shows a
 * single error line and a user retyping a password does not want a
 * checklist scored against them.
 */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  const missing: string[] = [];
  if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (!/[0-9]/.test(password)) missing.push("a digit");
  if (![...password].some((c) => SYMBOL_SET.has(c))) missing.push("a symbol");

  if (missing.length > 0) {
    return `Password must contain ${formatList(missing)}.`;
  }

  return null;
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
