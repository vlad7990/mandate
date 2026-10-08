# Schema bootstrap — rebuilding the database from the repository

**Status: tested.** On 2026-10-08 the baseline in `supabase/schema-reference.sql`
was applied to an empty PostgreSQL 14.19 database by
`supabase/bootstrap/apply.sh` and reproduced the production schema exactly.
Counts below are measured on both sides, not asserted.

| | production | rebuild |
|---|---|---|
| tables | 73 | 73 |
| functions | 154 | 154 |
| SECURITY DEFINER functions | 92 | 92 |
| RLS policies (`public`) | 261 | 261 |
| RLS policies (`storage`) | 10 | 10 |
| tables with RLS enabled | 73 | 73 |
| triggers | 75 | 75 |
| indexes | 481 | 481 |
| foreign keys | 328 | 328 |
| CHECK constraints | 191 | 191 |
| generated columns | 10 | 10 |
| views | 2 | 2 |
| object comments | 24 | 24 |
| function comments | 17 | 17 |
| storage buckets | 3 | 3 |
| grants to anon/authenticated/service_role | 1,567 | 1,567 |

RLS was then exercised rather than counted:

```
as owner (RLS bypassed) ........ 2 rows
as authenticated, uid NULL ..... 0 rows      <- denies
as anon ........................ 0 rows      <- denies
as service_role (BYPASSRLS) .... 2 rows      <- sees everything
```

That last line is the whole argument for guarding the service-role key.

---

## What this does and does not close

**Closes.** The repository can now describe and rebuild the shape of its own
database. Before this, `001_core_schema.sql` was 0 bytes and the base schema
existed only in the live database.

**Does not close.** This is schema, not data. There is still no database
backup — the Supabase organisation is on the free plan — and no plan at any
price backs up the three storage buckets. A rebuilt schema with no rows in it
is not a recovery story. See `2026-10-07-recovery-plan.md`.

---

## How to run it

```bash
# Rebuilding onto a real Supabase project (auth, storage and roles already exist)
./supabase/bootstrap/apply.sh "$DATABASE_URL"

# Rebuilding on plain Postgres, or testing the baseline
./supabase/bootstrap/apply.sh "$DATABASE_URL" --with-stubs
```

The script refuses to run against a database that already has tables in
`public`. It builds a database; it does not migrate one.

`--with-stubs` adds placeholder `auth` and `storage` schemas. **Never pass it
to a real Supabase project** — it would shadow the real `auth.uid()` with one
that returns NULL, and every policy in the product would silently deny.

---

## The apply order, and why it is not the file order

`schema-reference.sql` is grouped for reading. Applying it top to bottom
produces **1,457 errors and 8 of 73 tables.** The order that works:

1. **extensions** — into an `extensions` schema, and `search_path` must
   include it or every trigram index fails on `gin_trgm_ops`
2. **roles** — `anon`, `authenticated`, `service_role`; without them 432
   grant statements fail
3. **stubs** — non-Supabase targets only
4. **functions, pass 1** — tolerant, `check_function_bodies = off`
5. **tables**
6. **functions, pass 2** — strict
7. **indexes**
8. **foreign keys**
9. views → triggers → policies → buckets → storage policies → grants → comments

### The function/table cycle

The dependency runs both ways and cannot be ordered away:

- a CHECK constraint on `fee_terms` calls `fee_instalment_plan_is_valid(jsonb)`,
  so that function must exist **before** the table
- several functions return a table's row type (e.g. `candidate_portal_tokens`),
  and a row type does not exist until its table does

Two passes resolve it. Pass 1 creates everything whose signature does not need
a row type; pass 2 runs after the tables and creates the rest.
`CREATE OR REPLACE` makes pass 2 idempotent over pass 1. On the current
baseline exactly **one** function defers to pass 2.

### Indexes before foreign keys

The org-scoping composite keys —
`(organization_id, candidate_id) REFERENCES candidates(organization_id, id)` —
are backed by **unique indexes, not unique constraints**. Apply the FKs first
and Postgres rejects them with *"no unique constraint matching given keys"*.

---

## Relationship to `supabase/migrations/`

This is the part that is easy to get wrong, so it is stated as a rule.

**`001_core_schema.sql` stays 0 bytes. Do not fill it with this baseline.**

The baseline is the schema *after* 160 migrations. A file named `001` holding
current state would be replayed alongside `002`–`161`, which `ALTER` the very
objects it creates — double-applied, failing in a way that is hard to trace
back to its cause.

Two paths exist and they must not be mixed:

| | path A — migrations | path B — baseline |
|---|---|---|
| builds | the database as it evolved | the database as it is today |
| source | `supabase/migrations/001…161` | `supabase/schema-reference.sql` |
| `001` empty? | yes, and the chain is broken because of it | irrelevant |
| use for | ongoing change | disaster rebuild, inspection, diffing |

**Going forward, nothing changes about how migrations are written.** New work
is still a numbered file in `supabase/migrations/` applied via MCP
`apply_migration`, exactly as `CLAUDE.md` requires. The baseline is a
*snapshot*, not a replacement: regenerate it after significant schema change so
it does not drift, and treat the live catalogue as the authority whenever the
two disagree.

Suggested cadence: regenerate at every tagged release, and immediately before
any restore rehearsal.

---

## Limits of the test

Stated plainly, because a rebuild that is trusted too far is worse than one
trusted too little.

- **Tested on PostgreSQL 14.19, production runs 17.6.** The baseline applied
  cleanly on 14, which is the stronger direction to test (14 accepts a subset
  of 17 syntax). It does not prove 17-specific behaviour.
- **The stubs are not Supabase.** `auth.uid()` returns NULL, so policies were
  proven to *deny*, not to *allow the right rows*. Proving the allow path needs
  a real Supabase target and a real session.
- **No data was restored.** Schema only.
- **`supabase_vault` is absent from the stub path.** It is platform-provided
  and has no open-source equivalent. Nothing in `public` depends on it.
- **Ownership and default privileges are not replayed.** Objects are owned by
  whoever runs the script.
- **The generator had six defects**, found only by running this test; they are
  listed at the top of `supabase/generate-schema-reference.sql`. The one that
  matters most was silent: ten generated columns emitted as `DEFAULT` would
  have produced a schema that worked and was wrong.
