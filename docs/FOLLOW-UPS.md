# Follow-Ups

Deferred items that are known, bounded, and deliberately not part of the
current change. Remove entries as they land.

## Security — before enterprise customers

- **Audit events are still self-attributable via PostgREST.** Migration 034
  prevents forging `executive_audit_events` rows for *another* actor
  (`actor_id = auth.uid()` in the INSERT policy), but an authenticated user
  can still insert self-attributed rows with arbitrary `event_type`/`detail`
  directly through the REST API — audit noise, not forgery. Move audit writes
  behind a SECURITY DEFINER RPC (and drop the direct INSERT policy) before
  enterprise customers rely on the trail.

## Resolved

- **`finalize_job_spec` partial-index race — false alarm, resolved 2026-07-16.**
  Investigation showed migration `008_fix_finalize_rpc.sql` already fixed this
  exact bug class (demote-then-promote under project + target row locks); the
  live function matches the migration. The suspicion came from a stale
  docstring on `markAsFinal` in `spec/actions.ts` describing the pre-008
  implementation — now corrected. Behavior is pinned by
  `supabase/tests/job_spec_finalize_invariants.sql` (4 checks: final-to-final
  replacement, re-finalize, mismatched project rejection, swap-back), verified
  against the live database. No migration was needed.
