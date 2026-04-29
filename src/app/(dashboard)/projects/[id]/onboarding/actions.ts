"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deriveAndStoreCalibration } from "@/lib/ai/derive-calibration";
import {
  ANTI_PATTERNS_MAX,
  ANTI_PATTERNS_MIN,
  MUST_HAVES_MAX,
  MUST_HAVES_MIN,
  ROLE_ORIGIN_OPTIONS,
  STAKEHOLDERS_MAX,
  STAKEHOLDERS_MIN,
  type OnboardingResponses,
  type RoleOrigin,
} from "@/lib/ai/onboarding-analysis";

const ROLE_ORIGIN_VALUES = ROLE_ORIGIN_OPTIONS.map((o) => o.value) as readonly RoleOrigin[];

function clean(arr: string[]): string[] {
  return arr.map((s) => s.trim()).filter(Boolean);
}

function validate(responses: OnboardingResponses): string | null {
  if (!ROLE_ORIGIN_VALUES.includes(responses.role_origin)) {
    return "Invalid role origin.";
  }
  const must = clean(responses.must_haves);
  if (must.length < MUST_HAVES_MIN || must.length > MUST_HAVES_MAX) {
    return `Provide between ${MUST_HAVES_MIN} and ${MUST_HAVES_MAX} must-haves.`;
  }
  const anti = clean(responses.anti_patterns);
  if (anti.length < ANTI_PATTERNS_MIN || anti.length > ANTI_PATTERNS_MAX) {
    return `Provide between ${ANTI_PATTERNS_MIN} and ${ANTI_PATTERNS_MAX} anti-patterns.`;
  }
  const stakeholders = responses.stakeholders.filter(
    (s) => s.name.trim() || s.role.trim() || s.focus.trim()
  );
  if (
    stakeholders.length < STAKEHOLDERS_MIN ||
    stakeholders.length > STAKEHOLDERS_MAX
  ) {
    return `Provide between ${STAKEHOLDERS_MIN} and ${STAKEHOLDERS_MAX} stakeholders.`;
  }
  for (const w of [
    responses.priority_signals.technical,
    responses.priority_signals.leadership,
    responses.priority_signals.domain,
  ]) {
    if (!Number.isFinite(w) || w < 1 || w > 10) {
      return "Priority signals must be between 1 and 10.";
    }
  }
  return null;
}

export async function submitOnboarding(
  projectId: string,
  responses: OnboardingResponses
): Promise<void> {
  const error = validate(responses);
  if (error) throw new Error(error);

  const sanitized: OnboardingResponses = {
    role_origin: responses.role_origin,
    must_haves: clean(responses.must_haves),
    anti_patterns: clean(responses.anti_patterns),
    stakeholders: responses.stakeholders
      .map((s) => ({
        name: s.name.trim(),
        role: s.role.trim(),
        focus: s.focus.trim(),
      }))
      .filter((s) => s.name || s.role || s.focus),
    priority_signals: {
      technical: Math.round(responses.priority_signals.technical),
      leadership: Math.round(responses.priority_signals.leadership),
      domain: Math.round(responses.priority_signals.domain),
    },
  };

  await deriveAndStoreCalibration(projectId, sanitized);

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}
