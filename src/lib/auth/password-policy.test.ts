import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_SYMBOLS,
  validatePassword,
} from "./password-policy";

describe("validatePassword", () => {
  it("accepts a password with all four character classes at the minimum length", () => {
    expect(validatePassword("Abcdefghij1!")).toBeNull();
  });

  it("rejects one character short of the minimum, even with every class present", () => {
    const short = "Abcdefghi1!";
    expect(short.length).toBe(PASSWORD_MIN_LENGTH - 1);
    expect(validatePassword(short)).toMatch(/at least 12 characters/);
  });

  it("reports length before character classes — the user fixes one thing at a time", () => {
    expect(validatePassword("abc")).toMatch(/at least 12 characters/);
  });

  it.each([
    ["a lowercase letter", "ABCDEFGHIJ1!"],
    ["an uppercase letter", "abcdefghij1!"],
    ["a digit", "Abcdefghijk!"],
    ["a symbol", "Abcdefghij12"],
  ])("requires %s", (missing, password) => {
    expect(password.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
    expect(validatePassword(password)).toBe(
      `Password must contain ${missing}.`
    );
  });

  it("lists several missing classes in one message rather than one at a time", () => {
    expect(validatePassword("abcdefghijkl")).toBe(
      "Password must contain an uppercase letter, a digit and a symbol."
    );
  });

  it("accepts every symbol Supabase Auth allows", () => {
    // The set contains \\, ", ] and a backtick. If this file and the policy
    // ever disagree about escaping, one of these fails rather than a user
    // being told a valid password is invalid.
    for (const symbol of PASSWORD_SYMBOLS) {
      const password = `Abcdefghij1${symbol}`;
      expect(
        validatePassword(password),
        `symbol ${JSON.stringify(symbol)} should be accepted`
      ).toBeNull();
    }
  });

  it("does not count a non-Supabase symbol as a symbol", () => {
    // £ is not in the allowed set, so GoTrue would reject this password.
    // Accepting it here would mean the form promising something the auth
    // server refuses, which is the exact failure this module exists to stop.
    expect(PASSWORD_SYMBOLS).not.toContain("£");
    expect(validatePassword("Abcdefghij1£")).toBe(
      "Password must contain a symbol."
    );
  });

  it("rejects the empty string with the length message", () => {
    expect(validatePassword("")).toMatch(/at least 12 characters/);
  });
});
