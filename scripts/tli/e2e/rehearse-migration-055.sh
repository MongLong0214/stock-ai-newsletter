#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <prod-schema-through-048.sql>"
}

if [[ ${1:-} == "--help" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 ]]; then
  usage >&2
  exit 64
fi

readonly PROD_SCHEMA=$1
readonly RESOURCE_SUFFIX=$$
readonly DB_CONTAINER=tli-migration-055-rehearsal-${RESOURCE_SUFFIX}
readonly NETWORK=tli-migration-055-rehearsal-network-${RESOURCE_SUFFIX}
readonly VOLUME=tli-migration-055-rehearsal-data-${RESOURCE_SUFFIX}
readonly DB_IMAGE=postgres:17
SESSION_DIR=

if [[ ! -f "${PROD_SCHEMA}" || ! -r "${PROD_SCHEMA}" ]]; then
  echo "prod schema is not a readable regular file: ${PROD_SCHEMA}" >&2
  exit 66
fi

cleanup() {
  if [[ -n ${SESSION_DIR} ]]; then
    rm -f "${SESSION_DIR}/input" "${SESSION_DIR}/output"
    rmdir "${SESSION_DIR}" 2>/dev/null || true
  fi
  docker rm -f -v "${DB_CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
  docker volume rm -f "${VOLUME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker info >/dev/null
docker network create "${NETWORK}" >/dev/null
docker run --name "${DB_CONTAINER}" \
  --network "${NETWORK}" \
  --mount "type=volume,source=${VOLUME},target=/var/lib/postgresql/data" \
  -e POSTGRES_PASSWORD=postgres -d "${DB_IMAGE}" >/dev/null

for _attempt in $(seq 1 40); do
  if docker exec "${DB_CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
docker exec "${DB_CONTAINER}" pg_isready -U postgres >/dev/null

docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE PUBLICATION supabase_realtime;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION extensions.gen_random_uuid()
RETURNS UUID LANGUAGE sql VOLATILE PARALLEL SAFE
AS 'SELECT pg_catalog.gen_random_uuid()';
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB LANGUAGE sql STABLE AS 'SELECT NULL::JSONB';
SQL

sed '/CREATE EXTENSION IF NOT EXISTS "supabase_vault"/d' < "${PROD_SCHEMA}" \
  | docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres

for migration in \
  supabase/migrations/049_tli_experiment_cycles.sql \
  supabase/migrations/050_tli_collection_append_rpc_and_git_sha.sql \
  supabase/migrations/051_tli_fix_observation_trigger_binding.sql \
  supabase/migrations/052_tli_abstain_sentinel_db_guard.sql \
  supabase/migrations/053_tli_label_guard_and_legacy_prediction_upsert.sql \
  supabase/migrations/054_tli_legacy_label_finalizer.sql; do
  docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres < "${migration}"
done

PROTECTED_FUNCTIONS_BEFORE=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 \
  -U postgres -c "SELECT string_agg(md5(pg_get_functiondef(function_oid)), ',' ORDER BY function_oid::text) FROM unnest(ARRAY['public.guard_tli_gta_v2_label_transition()'::regprocedure, 'public.finalize_tli_gta_v2_label(text,text)'::regprocedure, 'public.finalize_tli_legacy_labels(jsonb)'::regprocedure]) AS protected(function_oid)")
readonly PROTECTED_FUNCTIONS_BEFORE

docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres \
  < supabase/migrations/055_tli_label_truncate_guard_and_cohort_view.sql

PROTECTED_FUNCTIONS_AFTER=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 \
  -U postgres -c "SELECT string_agg(md5(pg_get_functiondef(function_oid)), ',' ORDER BY function_oid::text) FROM unnest(ARRAY['public.guard_tli_gta_v2_label_transition()'::regprocedure, 'public.finalize_tli_gta_v2_label(text,text)'::regprocedure, 'public.finalize_tli_legacy_labels(jsonb)'::regprocedure]) AS protected(function_oid)")
readonly PROTECTED_FUNCTIONS_AFTER

if [[ "${PROTECTED_FUNCTIONS_BEFORE}" != "${PROTECTED_FUNCTIONS_AFTER}" ]]; then
  echo "migration 055 changed a protected label guard or finalizer" >&2
  exit 1
fi

docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  < scripts/tli/e2e/sql/migration-055-label-truncate-and-latest-cohort.sql

OLD_LATEST=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT max(prediction_date) FROM public.tli_public_scientific_predictions_v3")
readonly OLD_LATEST

docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SELECT set_config('tli.cycle_registry_rpc', 'migration-055-race', true);
UPDATE public.model_registry
SET status = 'archived', scientific_release_status = 'blocked'
WHERE model_version = 'migration-055-old';
UPDATE public.model_registry
SET status = 'champion', scientific_release_status = 'public'
WHERE model_version = 'migration-055-new';
COMMIT;
SQL

RACED_ROW_COUNT=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT count(*) FROM public.tli_public_scientific_predictions_v3 WHERE prediction_date = DATE '${OLD_LATEST}'")
readonly RACED_ROW_COUNT
if [[ "${RACED_ROW_COUNT}" != "0" ]]; then
  echo "two-statement release-swap race was not reproduced" >&2
  exit 1
fi
docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT jsonb_build_object('two_statement_race', 'reproduced', 'stale_date', '${OLD_LATEST}', 'second_query_rows', ${RACED_ROW_COUNT})"

docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres <<'SQL'
BEGIN;
SELECT set_config('tli.cycle_registry_rpc', 'migration-055-reset', true);
UPDATE public.model_registry
SET status = 'challenger', scientific_release_status = 'internal'
WHERE model_version = 'migration-055-new';
UPDATE public.model_registry
SET status = 'champion', scientific_release_status = 'public'
WHERE model_version = 'migration-055-old';
COMMIT;
SQL

SESSION_DIR=$(mktemp -d "${TMPDIR:-/tmp}/migration-055-swap.XXXXXX")
readonly SESSION_INPUT=${SESSION_DIR}/input
readonly SESSION_OUTPUT=${SESSION_DIR}/output
mkfifo "${SESSION_INPUT}" "${SESSION_OUTPUT}"
docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  < "${SESSION_INPUT}" > "${SESSION_OUTPUT}" &
readonly SWAP_SESSION_PID_VALUE=$!
exec 3>"${SESSION_INPUT}"
exec 4<"${SESSION_OUTPUT}"
printf '%s\n' \
  'BEGIN;' \
  "SET LOCAL tli.cycle_registry_rpc = 'migration-055-atomic';" \
  "UPDATE public.model_registry SET status = 'archived', scientific_release_status = 'blocked' WHERE model_version = 'migration-055-old';" \
  "UPDATE public.model_registry SET status = 'champion', scientific_release_status = 'public' WHERE model_version = 'migration-055-new';" \
  '\echo swap_uncommitted' \
  >&3

IFS= read -r SWAP_MARKER <&4
if [[ "${SWAP_MARKER}" != "swap_uncommitted" ]]; then
  echo "unexpected release-swap synchronization marker: ${SWAP_MARKER}" >&2
  exit 1
fi

ATOMIC_DURING=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT count(*) || '|' || min(prediction_date) || '|' || max(prediction_date) || '|' || min(model_version) || '|' || max(model_version) FROM public.load_tli_latest_public_scientific_predictions_v3(NULL)")
readonly ATOMIC_DURING
if [[ "${ATOMIC_DURING}" != "2|2026-07-06|2026-07-06|migration-055-old|migration-055-old" ]]; then
  echo "atomic RPC did not return the complete old cohort during the uncommitted swap: ${ATOMIC_DURING}" >&2
  exit 1
fi

printf '%s\n' 'COMMIT;' '\q' >&3
exec 3>&-
wait "${SWAP_SESSION_PID_VALUE}"
exec 4<&-
rm -f "${SESSION_INPUT}" "${SESSION_OUTPUT}"
rmdir "${SESSION_DIR}"
SESSION_DIR=

ATOMIC_AFTER=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT count(*) || '|' || min(prediction_date) || '|' || max(prediction_date) || '|' || min(model_version) || '|' || max(model_version) FROM public.load_tli_latest_public_scientific_predictions_v3(NULL)")
readonly ATOMIC_AFTER
if [[ "${ATOMIC_AFTER}" != "2|2026-07-13|2026-07-13|migration-055-new|migration-055-new" ]]; then
  echo "atomic RPC did not return the complete new cohort after the swap: ${ATOMIC_AFTER}" >&2
  exit 1
fi

docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT jsonb_build_object('atomic_during_swap', 'old_cohort', 'atomic_after_swap', 'new_cohort', 'protected_functions', 'unchanged')"
