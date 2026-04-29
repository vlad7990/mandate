/**
 * Shared constants for the Job Spec Builder.
 *
 * Importable from both client and server code. Lives outside the route's
 * actions.ts because that file has a module-level `"use server"` directive
 * — Next.js explicitly disallows non-async exports from such modules and
 * will reject string sentinels at build/runtime.
 */

/**
 * Sentinel error message thrown by the saveDraft server action when the
 * target row was not eligible for in-place editing — most commonly because
 * it was finalised between the client's last read and the write. The
 * editor compares against this exact string to decide when to force a
 * router refresh and surface the new FINAL state.
 */
export const SAVE_DRAFT_FINALIZED_MESSAGE =
  "This spec has been finalized and cannot be edited. Create a new version instead.";
