/**
 * Eval setup: resolve the API key from the founder's environment.
 *
 * Vercel refuses to export sensitive-flagged vars (`vercel env pull`
 * writes "[SENSITIVE]") — correct posture, and it means the harness
 * runs on the founder's machine with the founder's own key. When the
 * shell doesn't carry ANTHROPIC_API_KEY, read it from .env.local —
 * the founder-owned file the dev server already uses. Absent both,
 * every eval skips honestly.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const m = env.match(/^ANTHROPIC_API_KEY=(?:"([^"]*)"|'([^']*)'|(.*))$/m);
    const value = (m?.[1] ?? m?.[2] ?? m?.[3])?.trim();
    if (value && value !== "[SENSITIVE]") {
      process.env.ANTHROPIC_API_KEY = value;
    }
  } catch {
    // No .env.local — evals will skip with the honest message.
  }
}
