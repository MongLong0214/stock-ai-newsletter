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
readonly DB_CONTAINER=tli-migration-067-rehearsal-${RESOURCE_SUFFIX}
readonly NETWORK=tli-migration-067-rehearsal-network-${RESOURCE_SUFFIX}
readonly VOLUME=tli-migration-067-rehearsal-data-${RESOURCE_SUFFIX}
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

psql_in() {
  docker exec -i "${DB_CONTAINER}" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"
}

docker info >/dev/null
docker network create "${NETWORK}" >/dev/null
docker run --name "${DB_CONTAINER}" \
  --network "${NETWORK}" \
  --mount "type=volume,source=${VOLUME},target=/var/lib/postgresql/data" \
  -e POSTGRES_PASSWORD=postgres -d "${DB_IMAGE}" >/dev/null

# initdb 임시 서버가 pg_isready에 먼저 응답하므로 init 완료 로그까지 기다린다.
for _attempt in $(seq 1 120); do
  if docker logs "${DB_CONTAINER}" 2>&1 | grep -q 'PostgreSQL init process complete; ready for start up.' \
    && docker exec "${DB_CONTAINER}" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
docker exec "${DB_CONTAINER}" pg_isready -U postgres >/dev/null

psql_in <<'SQL'
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

sed '/CREATE EXTENSION IF NOT EXISTS "supabase_vault"/d' < "${PROD_SCHEMA}" | psql_in >/dev/null

for migration in supabase/migrations/04[9]_*.sql supabase/migrations/05*_*.sql supabase/migrations/06[0-6]_*.sql; do
  psql_in -q < "${migration}" >/dev/null
done

psql_in -q <<'SQL'
CREATE SCHEMA migration_067_rehearsal;
CREATE TABLE migration_067_rehearsal.results (
  probe TEXT PRIMARY KEY, passed BOOLEAN NOT NULL CHECK (passed)
);
CREATE TABLE migration_067_rehearsal.stock_cache_before AS
SELECT (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute AS a
        WHERE a.attrelid = 'public.stock_daily_prices'::regclass AND a.attnum > 0) AS columns,
       (SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname) FROM pg_trigger AS t
        WHERE t.tgrelid = 'public.stock_daily_prices'::regclass AND NOT t.tgisinternal) AS triggers;
SQL

ENROLL_BEFORE=$(psql_in -qAt -c "SELECT pg_get_functiondef('public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure)")
ENROLL_ACL_BEFORE=$(psql_in -qAt -c "SELECT proacl::text FROM pg_proc WHERE oid = 'public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure")
readonly ENROLL_BEFORE ENROLL_ACL_BEFORE
psql_in < supabase/migrations/067_tli_kospi_series_attestation.sql >/dev/null
ENROLL_AFTER=$(psql_in -qAt -c "SELECT pg_get_functiondef('public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure)")
ENROLL_ACL_AFTER=$(psql_in -qAt -c "SELECT proacl::text FROM pg_proc WHERE oid = 'public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure")
readonly ENROLL_AFTER ENROLL_ACL_AFTER

python3 - "${ENROLL_BEFORE}" "${ENROLL_AFTER}" <<'PYDIFF'
import difflib
import pathlib
import sys

before, after = sys.argv[1:]
original = pathlib.Path('supabase/migrations/049_tli_experiment_cycles.sql').read_text()
original = original.split('CREATE OR REPLACE FUNCTION public.enroll_tli_origin(', 1)[1]
body = original.split('AS $$\n', 1)[1].split('\n$$;', 1)[0]
if body not in before:
    sys.exit('pre-067 enroll body differs from 049')
def without_kospi_blocks(text, selection_start):
    start = text.index(selection_start)
    end = text.index('  IF v_base_close IS NULL', start)
    text = text[:start] + '<KOSPI selection>\n' + text[end:]
    start = text.index('  v_source_ids := ARRAY[')
    end = text.index('  v_input_sha :=', start)
    return text[:start] + '<KOSPI provenance>\n' + text[end:]
if without_kospi_blocks(before, '  SELECT trade_date, close, source') != without_kospi_blocks(after, '  -- One attested KIS response'):
    sys.exit('enroll changed outside KOSPI selection/provenance blocks')
print('enroll_tli_origin diff vs 049: only KOSPI selection/provenance blocks changed')
print('\n'.join(difflib.unified_diff(before.splitlines(), after.splitlines(), fromfile='049', tofile='067', lineterm='')))
PYDIFF
if [[ "${ENROLL_ACL_BEFORE}" != "${ENROLL_ACL_AFTER}" ]]; then
  echo "enroll_tli_origin ACL changed: ${ENROLL_ACL_BEFORE} -> ${ENROLL_ACL_AFTER}" >&2
  exit 1
fi
printf 'enroll_tli_origin ACL unchanged: %s\n' "${ENROLL_ACL_AFTER}"
psql_in -q <<'SQL'
INSERT INTO migration_067_rehearsal.results VALUES
  ('enroll_body_only_kospi_selection_and_provenance_changed', true), ('enroll_acl_unchanged', true);
SQL

psql_in -q < scripts/tli/e2e/sql/migration-067-kospi-series-attestation.sql
psql_in -q < scripts/tli/e2e/sql/migration-067-enroll-kospi-provenance.sql
psql_in -qAt <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM migration_067_rehearsal.results)
     OR (SELECT bool_and(passed) FROM migration_067_rehearsal.results) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'missing or failed rehearsal results';
  END IF;
END $$;
SELECT jsonb_object_agg(probe, passed ORDER BY probe) FROM migration_067_rehearsal.results;
SQL
