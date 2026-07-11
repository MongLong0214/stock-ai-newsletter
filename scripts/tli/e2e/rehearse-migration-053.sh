#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <prod-schema.sql>"
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
readonly DB_CONTAINER=tli-migration-053-rehearsal
readonly POSTGREST_CONTAINER=tli-migration-053-postgrest
readonly NETWORK=tli-migration-053-rehearsal-network
readonly VOLUME=tli-migration-053-rehearsal-data
readonly DB_IMAGE=postgres:17
readonly POSTGREST_IMAGE=postgrest/postgrest:v14.12
readonly JWT_SECRET=migration-053-postgrest-secret-2026-07-11

if [[ ! -f "${PROD_SCHEMA}" || ! -r "${PROD_SCHEMA}" ]]; then
  echo "prod schema is not a readable regular file: ${PROD_SCHEMA}" >&2
  exit 66
fi

cleanup() {
  docker rm -f -v "${POSTGREST_CONTAINER}" >/dev/null 2>&1 || true
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
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'postgrest';
  ELSE
    ALTER ROLE authenticator WITH LOGIN NOINHERIT PASSWORD 'postgrest';
  END IF;
END
$roles$;
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
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
  supabase/migrations/053_tli_label_guard_and_legacy_prediction_upsert.sql; do
  docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres < "${migration}"
done

docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  < scripts/tli/e2e/sql/migration-053-security-and-legacy-upsert.sql

docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres <<'SQL'
INSERT INTO public.themes (id, name)
VALUES ('53000000-0000-4000-8000-000000000010', 'migration-053-postgrest-writer');
SQL

SERVICE_ROLE_JWT=$(
  JWT_SECRET="${JWT_SECRET}" node --input-type=module <<'NODE'
import { createHmac } from 'node:crypto'

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const header = encode({ alg: 'HS256', typ: 'JWT' })
const payload = encode({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 3600 })
const unsigned = `${header}.${payload}`
const signature = createHmac('sha256', process.env.JWT_SECRET)
  .update(unsigned)
  .digest('base64url')
process.stdout.write(`${unsigned}.${signature}`)
NODE
)
readonly SERVICE_ROLE_JWT

docker run --name "${POSTGREST_CONTAINER}" \
  --network "${NETWORK}" \
  -p 127.0.0.1::3000 \
  -e "PGRST_DB_URI=postgres://authenticator:postgrest@${DB_CONTAINER}:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon \
  -e "PGRST_JWT_SECRET=${JWT_SECRET}" \
  -d "${POSTGREST_IMAGE}" >/dev/null

POSTGREST_PORT=$(docker port "${POSTGREST_CONTAINER}" 3000/tcp | head -n 1 | sed 's/.*://')
readonly POSTGREST_PORT
readonly POSTGREST_URL="http://127.0.0.1:${POSTGREST_PORT}"

for _attempt in $(seq 1 40); do
  if curl -fsS \
    -H "apikey: ${SERVICE_ROLE_JWT}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_JWT}" \
    "${POSTGREST_URL}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
curl -fsS \
  -H "apikey: ${SERVICE_ROLE_JWT}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_JWT}" \
  "${POSTGREST_URL}/" >/dev/null

POSTGREST_URL="${POSTGREST_URL}" \
NEXT_PUBLIC_SUPABASE_URL="${POSTGREST_URL}" \
SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_JWT}" \
node --import tsx --input-type=module <<'NODE'
const postgrestUrl = process.env.POSTGREST_URL
if (!postgrestUrl) throw new Error('POSTGREST_URL is required')

const nativeFetch = globalThis.fetch
const postgrestOrigin = new URL(postgrestUrl).origin
globalThis.fetch = (input, init) => {
  const url = input instanceof URL
    ? new URL(input)
    : new URL(typeof input === 'string' ? input : input.url)
  if (url.origin === postgrestOrigin) {
    url.pathname = url.pathname.replace(/^\/rest\/v1/, '')
  }
  const rewritten = typeof input === 'string' || input instanceof URL
    ? url
    : new Request(url, input)
  return nativeFetch(rewritten, init)
}

const { upsertLegacyPredictionsV3 } = await import(
  './scripts/tli/comparison/legacy-prediction-writer.ts'
)
const row = {
  theme_id: '53000000-0000-4000-8000-000000000010',
  prediction_date: '2026-07-13',
  horizon_days: 5,
  serving_role: 'champion',
  p_rise: 0.61,
  ci_lower: null,
  ci_upper: null,
  abstain: false,
  abstain_reasons: [],
  features: { feature_schema: [], values: [], missing_flags: [] },
  model_version: 'migration-053-postgrest',
  labeler_version: 'gta-v1',
  param_version: 'migration-053-v1',
  score_status: 'pending',
}
const inserted = await upsertLegacyPredictionsV3([row])
const updated = await upsertLegacyPredictionsV3([{ ...row, p_rise: 0.62 }])
if (inserted !== 1 || updated !== 1) {
  throw new Error(`PostgREST writer affected counts were ${inserted}/${updated}`)
}
process.stdout.write(`${JSON.stringify({ postgrest_production_writer: 'pass', inserted, updated })}\n`)
NODE

docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres <<'SQL'
DO $postgrest_writer_assertion$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.theme_predictions_v3
    WHERE theme_id = '53000000-0000-4000-8000-000000000010'
      AND prediction_date = DATE '2026-07-13'
      AND horizon_days = 5
      AND model_version = 'migration-053-postgrest'
      AND experiment_cycle_id IS NULL
      AND score_status = 'pending'
      AND p_rise = 0.62
  ) THEN
    RAISE EXCEPTION 'PostgREST production writer final state assertion failed';
  END IF;
END;
$postgrest_writer_assertion$;
SELECT jsonb_build_object('postgrest_production_writer', 'pass');
SQL
