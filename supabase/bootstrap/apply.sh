#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Apply the schema baseline to an EMPTY database, in dependency order.
#
#   ./supabase/bootstrap/apply.sh "postgresql://user:pass@host:5432/db"
#
# ## Why this script exists
#
# `schema-reference.sql` is grouped for READING. That is not the order it
# APPLIES in, and the difference is not cosmetic: functions must exist
# before the triggers and policies that call them, tables before the
# functions that query them, and every table before any foreign key.
#
# Feeding the file to psql top to bottom produces 1,457 errors and 8 of
# 73 tables. This order produces a working schema. The ordering below is
# the deliverable; the file is just where the text lives.
#
# ## Refuses to run against a non-empty database
#
# This builds a database; it does not migrate one. Pointing it at a
# populated database would be a destructive mistake, so it checks first.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

# Every section runs with `extensions` on the search path, the same as
# Supabase sets at the database level. Without it the trigram indexes
# cannot resolve gin_trgm_ops.
export PGOPTIONS="${PGOPTIONS:-} -c search_path=public,extensions"

DB_URL="${1:?usage: apply.sh <postgres-url> [--with-stubs]}"
WITH_STUBS="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REF="$HERE/../schema-reference.sql"
PRE="$HERE/00-prerequisites.sql"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

[[ -f "$REF" ]] || { echo "missing $REF" >&2; exit 1; }

existing=$(psql "$DB_URL" -tAc \
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'")
if [[ "$existing" != "0" ]]; then
  echo "REFUSING: target already has $existing tables in public." >&2
  echo "This script bootstraps an EMPTY database. It is not a migration." >&2
  exit 1
fi

# Split the reference into one file per section marker.
awk -v out="$WORK" '
  /^-- ={10,} .* ={10,}$/ {
    name = $0
    gsub(/^-- =+ /, "", name); gsub(/ =+$/, "", name)
    gsub(/[^A-Za-z]+/, "_", name)
    file = out "/" tolower(name) ".sql"
    next
  }
  file { print > file }
' "$REF"

# A missing section is FATAL, not a skip.
#
# It was a skip for one iteration of writing this script, and the
# consequence was instructive: a renamed section meant the index file
# was silently not applied, and the failure surfaced three steps later
# as an unrelated-looking foreign key error. A bootstrap that quietly
# omits part of the schema is worse than one that stops.
run() {
  local label="$1" path="$2"
  [[ -f "$path" ]] || {
    echo "FATAL: section '$label' not found at $path" >&2
    echo "The section headers in schema-reference.sql have probably changed." >&2
    echo "Sections present: $(cd "$WORK" && ls -1 *.sql | tr '\n' ' ')" >&2
    exit 1
  }
  echo "  -- $label"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$path"
}

echo "== prerequisites =="
if [[ "$WITH_STUBS" == "--with-stubs" ]]; then
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$PRE"
else
  # Extensions and roles only; leave the real auth/storage alone.
  awk '/^-- ===== 3\./{exit} {print}' "$PRE" > "$WORK/pre.sql"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$WORK/pre.sql"
fi

echo "== schema, in dependency order =="

# Two passes, because the cycle runs in both directions:
#
#   tables  -> functions   a CHECK constraint calls
#                          fee_instalment_plan_is_valid(jsonb)
#   functions -> tables    some functions RETURN a table's row type
#                          (e.g. candidate_portal_tokens), and a row
#                          type does not exist until its table does
#
# Pass 1 is tolerant: it creates every function whose signature does not
# need a table type yet, which is enough to satisfy the CHECK. Pass 2 is
# strict and runs after the tables, by which point every row type
# resolves. CREATE OR REPLACE makes pass 2 idempotent over pass 1.
{ echo "SET check_function_bodies = off;"; cat "$WORK/functions.sql"; } > "$WORK/functions-unchecked.sql"

echo "  -- functions, pass 1 of 2 (tolerant: row types may not exist yet)"
psql "$DB_URL" -v ON_ERROR_STOP=0 -q -f "$WORK/functions-unchecked.sql" 2>"$WORK/fn-pass1.err" || true
echo "     deferred to pass 2: $(grep -c 'ERROR:' "$WORK/fn-pass1.err" || echo 0)"

run "tables"              "$WORK/tables.sql"

echo "  -- functions, pass 2 of 2 (strict)"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$WORK/functions-unchecked.sql"
# Indexes BEFORE foreign keys. The org-scoping composite keys
#   (organization_id, candidate_id) REFERENCES candidates(organization_id, id)
# are backed by UNIQUE INDEXES, not UNIQUE CONSTRAINTS, so the index
# must exist or the FK is rejected with "no unique constraint matching
# given keys". Tables carry only p/u/c/x constraints; unique indexes
# live in the index section.
run "indexes"             "$WORK/indexes_non_constraint_.sql"
run "foreign keys"        "$WORK/foreign_keys.sql"
run "views"               "$WORK/views.sql"
run "triggers"            "$WORK/triggers.sql"
run "rls policies"        "$WORK/row_level_security_policies.sql"
run "storage buckets"     "$WORK/storage_buckets.sql"
run "storage policies"    "$WORK/storage_policies.sql"
run "grants: tables"      "$WORK/grants_tables.sql"
run "grants: routines"    "$WORK/grants_routines.sql"
run "comments"            "$WORK/comments.sql"

echo "== verify =="
psql "$DB_URL" -tAc "
select 'tables='   || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')
    || ' functions=' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')
    || ' policies='  || (select count(*) from pg_policies where schemaname='public')
    || ' triggers='  || (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal)
    || ' rls_on='    || (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity)
    || ' fks='       || (select count(*) from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and co.contype='f')"

echo
echo "Expected against the 2026-10-08 baseline (post-161/162):"
echo "  tables=73 functions=157 policies=261 triggers=75 rls_on=73 fks=328"
