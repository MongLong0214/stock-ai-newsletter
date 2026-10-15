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

# 067 이전에 생긴 legacy 행(2026-08-31 개장 전 phantom 재현)은 close_written_at 컬럼 자체가 없다.
psql_in -q <<'SQL'
INSERT INTO public.stock_daily_prices (symbol, trade_date, close, volume, source, created_at)
VALUES ('KOSPI', DATE '2026-08-31', 2800, 1, 'kis', TIMESTAMPTZ '2026-08-31 08:51:00+09');
SQL

readonly ENROLL_BEFORE=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT pg_get_functiondef('public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure)")
readonly ENROLL_ACL_BEFORE=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT proacl::text FROM pg_proc WHERE oid = 'public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure")

psql_in < supabase/migrations/067_stock_daily_prices_close_provenance.sql >/dev/null

readonly ENROLL_AFTER=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT pg_get_functiondef('public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure)")
readonly ENROLL_ACL_AFTER=$(docker exec "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  -c "SELECT proacl::text FROM pg_proc WHERE oid = 'public.enroll_tli_origin(uuid,uuid,uuid)'::regprocedure")

# enroll_tli_origin은 KOSPI provenance 판정 2줄만 달라야 하고 권한은 그대로여야 한다.
CHANGED_LINES=$(diff <(printf '%s\n' "${ENROLL_BEFORE}") <(printf '%s\n' "${ENROLL_AFTER}") | grep -c '^[<>]' || true)
readonly CHANGED_LINES
if [[ "${CHANGED_LINES}" != "4" ]]; then
  echo "enroll_tli_origin changed beyond the two KOSPI provenance predicates (${CHANGED_LINES} changed lines)" >&2
  exit 1
fi
if [[ "${ENROLL_ACL_BEFORE}" != "${ENROLL_ACL_AFTER}" ]]; then
  echo "enroll_tli_origin ACL changed: ${ENROLL_ACL_BEFORE} -> ${ENROLL_ACL_AFTER}" >&2
  exit 1
fi

docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  < scripts/tli/e2e/sql/migration-067-stock-close-provenance.sql | tail -1
docker exec -i "${DB_CONTAINER}" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres \
  < scripts/tli/e2e/sql/migration-067-enroll-kospi-provenance.sql | tail -1
echo '{"enroll_tli_origin":"only_kospi_provenance_predicates_changed","acl":"unchanged"}'
