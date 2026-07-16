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

## Correctness — separate follow-up

- **`finalize_job_spec` likely has the same partial-index approval race** that
  was fixed in `approve_success_profile` (migration 035): it flips
  `is_final` in a single CASE-based UPDATE against the partial unique index
  `unique_final_spec_per_project`, which is enforced per row — promotion
  before demotion can transiently violate the index depending on row order.
  Apply the same demote-then-promote fix in its own migration, with an
  invariant test mirroring `supabase/tests/executive_intelligence_invariants.sql`.
