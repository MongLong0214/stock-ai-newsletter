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
readonly DB_CONTAINER=tli-migration-054-rehearsal
readonly NETWORK=tli-migration-054-rehearsal-network
readonly VOLUME=tli-migration-054-rehearsal-data
readonly DB_IMAGE=postgres:17

if [[ ! -f "${PROD_SCHEMA}" || ! -r "${PROD_SCHEMA}" ]]; then
  echo "prod schema is not a readable regular file: ${PROD_SCHEMA}" >&2
  exit 66
fi

cleanup() {
  docker rm -f -v "${DB_CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
  docker volume rm -f "${VOLUME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
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

docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  < scripts/tli/e2e/sql/migration-053-security-and-legacy-upsert.sql
docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  < scripts/tli/e2e/sql/migration-054-legacy-label-finalizer.sql
