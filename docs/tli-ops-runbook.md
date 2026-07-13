# TLI Ops Runbook

> **`superseded_for_scientific_claims`**: For scientific claims and execution criteria, the master plan takes precedence; the pre-existing content in this document is retained to preserve intent and research history. Master plan: `.omo/plans/tli-v3-scientific-rebuild-master.md`.

## Goal

Provide the canonical operator entrypoints for TLI runtime maintenance, v4 comparison governance, and the self-improving loop.

## Scientific Promotion and Exposure Freeze

- Current state: promotion and exposure are frozen. All legacy M1 models are `invalidated` / `blocked`; B-Abl is `unvalidated` / `blocked`.
- Promotion remains blocked unless `TLI_M1_PROMOTION_ENABLED === 'true'` and the frozen candidate cycle passes the master plan's prospective gate. The flag alone does not unlock promotion.
- Exposure remains empty unless `TLI_PREDICTIONS_V3_EXPOSURE_ENABLED === 'true'`, the registry row has `status='champion'`, `scientific_claim_status='eligible'`, and `scientific_release_status='public'`, and the prediction exactly joins that registry row by `experiment_cycle_id`, model version, and `role='candidate'`. The flag alone does not unlock exposure.
- Unfreeze condition: complete master plan Todos 16-17 for the same frozen candidate, including Todo 16 data-floor, power simulation, preregistration, and cycle start, followed by Todo 17's full prospective and four-canary gates. Any failed or incomplete gate keeps promotion and exposure blocked.

## Runtime Batch Surface

- `npm run tli:run`
  - Full collection, scoring, comparison generation, prediction snapshotting, and evaluation.
- `npm run tli:compare`
  - Rebuilds phase0 analog artifacts and v4 comparison candidates using the current auto-tuned threshold.

## Level-4 Certification Surface

- `npm run tli:level4:calibrate`
  - Builds the latest certification-grade calibration artifact from `theme_comparison_eval_v2`.
- `npm run tli:level4:weights`
  - Runs weight tuning over evaluated comparison rows and persists the selected weight artifact.
- `npm run tli:level4:drift`
  - Builds the latest drift artifact and evaluates hold conditions.
- `npm run tli:level4:certify`
  - Generates the certification report using the latest published serving state and artifacts.

## Promotion Surface

- `npm run tli:v4:promote -- <run-id> [run-id...]`
  - Promotes one or more published v4 runs after gate validation.
  - Required env:
    - `TLI_COMPARISON_V4_PRODUCTION_VERSION`
    - `TLI_COMPARISON_V4_CALIBRATION_VERSION`
    - `TLI_COMPARISON_V4_WEIGHT_VERSION`
    - `TLI_COMPARISON_V4_DRIFT_VERSION`

## Bridge Surface

- `npm run tli:phase0:materialize`
  - Builds the canonical `episode_registry_v1`, `query_snapshot_v1`, `label_table_v1`, `analog_candidates_v1`, and `analog_evidence_v1` artifacts.
  - The default compare/runtime path relies on this materialization being healthy.
- `npm run tli:phase0:bridge`
  - Executes the phase-0 bridge parity runner.
  - Used to validate bridge artifacts and cutover readiness, not request-path runtime.
- `npm run tli:state-history:backfill`
  - Ensures `theme_state_history_v2` has a baseline row for every theme before episode materialization.
- `npm run tli:first-spike:repair`
  - Re-infers `first_spike_date` for targeted suspect dates.
  - Default target: `2026-02-06`
  - Optional env: `TLI_FIRST_SPIKE_REPAIR_DATES=2026-02-06,2026-02-07`

## Operating Principles

- Request-path comparison serving is always v4.
- Request-path comparison serving prefers canonical analog artifacts (`analog_candidates_v1` / `analog_evidence_v1`) and only falls back to `theme_comparison_candidates_v2` when artifact reads are unavailable.
- If an active `comparison_v4_control` row exists, it pins the production/calibration/weight versions.
- If no active control row exists, serving falls back to the latest published v4 archetype run and latest certification-grade artifacts.
- Self-improving loop code is retained only when it feeds calibration, tuning, drift, certification, or promotion.

## Migrations 045–052 Forward Recovery

These migrations define one scientific schema generation. Once any of them has committed, recovery is forward-only. **Never run a down migration** or reconstruct a prior function, trigger, grant, threshold, or scientific state from memory. A transaction wrapper protects an uncommitted migration; it is not a post-deploy rollback mechanism.

### Evidence to preserve before deployment

Create a release directory named by the application Git SHA and record all command exits. Keep the directory outside the deployment host.

1. Record the application Git SHA, migration file SHA-256 values, PostgreSQL version, and the current rows in `supabase_migrations.schema_migrations`.
2. Take both a `pg_dump --schema-only` snapshot and a `pg_dump --data-only` snapshot. Encrypt and access-control the data snapshot because it can contain production data.
3. Export row counts and the exact rows affected by 045 from `model_registry` and `theme_labels`; this is the required preimage for deterministic state recovery.
4. Export `pg_get_functiondef` for TLI functions, `pg_get_triggerdef` for TLI triggers, and `information_schema.role_table_grants` for affected public tables. Preserve the output checksum beside the dump checksums.
5. Confirm the snapshots restore into an isolated PostgreSQL 17 instance before changing production.

Do not continue if a dump is incomplete, its checksum cannot be reproduced, the restore probe fails, or the running application Git SHA is not the reviewed release SHA.

### Migration recovery matrix

| Migration | Preserve and verify | Compatible recovery action |
| --- | --- | --- |
| 045 | Exact pre-change `model_registry` and `theme_labels` rows; revoked legacy RPC grants | Keep containment active. Repair only from the preserved preimage with a reviewed forward-fix; never re-enable legacy promotion RPCs as a rollback shortcut. |
| 046 | Source snapshot parent/observation counts, hashes, functions, and deferred triggers | Retain immutable rows. Restore the canonical function/trigger definitions with a forward migration and re-run byte-equivalence checks. |
| 047 | Membership-history row counts, interval bounds, and current-as-of results | Append or correct history through a reviewed forward-fix; do not collapse history back into current membership. |
| 048 | Versioned label identity, GTA-v2 rows, immutability trigger, and indexes | Keep the five-column identity. Resolve any old-key collision explicitly before considering an older application binary. |
| 049 | Cycles, evidence, attestations, origin manifests, release events, prediction identities, functions, triggers, and grants | Preserve the cycle graph and release ledger. Repair definitions additively; do not drop cycle/evidence rows or restore the old prediction identity. |
| 050 | Collection append function, Git-attestation behavior, observation counts/hashes, and table/function grants | Restore the reviewed exclusive append RPC and exact ACLs through a forward migration; do not reopen direct collection inserts. |
| 051 | Observation validator definition and its parent/row trigger binding | Reapply the reviewed binding fix and validate both parent and observation paths; do not restore the stale `NEW` binding. |
| 052 | Abstain-sentinel guard function/trigger, rejected fixture behavior, and grants | Reapply the canonical guard through a forward migration and repeat malformed-sentinel negative probes. |

### Application rollback decision

An application binary may be rolled back only when its recorded compatibility manifest supports the already-committed database generation. In particular, an application that assumes the pre-048 label identity, the pre-049 prediction identity, direct collection inserts before 050, the stale 051 trigger binding, or no 052 sentinel guard is incompatible. Keep traffic on the current compatible binary or deploy a reviewed compatibility hotfix; do not change the database backward to fit an older binary.

Before choosing an application rollback, compare the candidate binary's Git SHA and database assumptions with the preserved release manifest in a restored PostgreSQL copy. Exercise collection, scientific scoring, lifecycle, canary failure, public hold/resume, and public-view fail-closed behavior there. Production remains frozen if any path is unproved.

### Verification queries

Capture results and checksums before deployment, after deployment, and after any forward-fix.

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version BETWEEN '045' AND '052'
ORDER BY version;

SELECT p.proname, pg_get_functiondef(p.oid)
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE '%tli%'
ORDER BY p.proname;

SELECT c.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger AS t
JOIN pg_class AS c ON c.oid = t.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND (c.relname LIKE 'tli_%' OR c.relname IN ('model_registry', 'theme_labels', 'theme_predictions_v3'))
ORDER BY c.relname, t.tgname;

SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('model_registry', 'theme_labels', 'theme_predictions_v3',
                     'tli_collection_runs', 'tli_collection_observations')
ORDER BY table_name, grantee, privilege_type;
```

#### 045 deterministic state recovery

Compare the preserved preimage with the post-045 rows by primary key and write an explicit reviewed repair set. If the preimage was not captured, deterministic restoration of the overwritten scientific state is impossible: stop, keep containment active, and escalate instead of guessing prior values.

#### 048/049 identity collision check

Run this on the restored copy before any older application is considered. Any returned row proves the old four-column label identity cannot represent the current data and blocks application rollback.

```sql
SELECT theme_id, base_date, horizon_days, label_type, count(*) AS versions
FROM public.theme_labels
GROUP BY theme_id, base_date, horizon_days, label_type
HAVING count(*) > 1;
```

Also verify that every scientific prediction still joins its exact cycle, origin, model version, role, and label version. Never delete a colliding version to make this query empty.

#### 050–052 function, trigger, and ACL verification

Diff the normalized `pg_get_functiondef`, `pg_get_triggerdef`, and `role_table_grants` outputs against the reviewed release evidence. Then run the collection append, trigger-binding, Git-SHA compatibility, and abstain-sentinel negative rehearsal suites. A definition-only match without executable probes is insufficient.

### Forward-fix procedure

1. Freeze TLI collection, scientific scoring, promotion, canary, and public-release writers. Keep public exposure fail-closed when release state is uncertain.
2. Restore the preserved schema-only and data-only snapshots into isolated PostgreSQL 17 and reproduce the incident with the exact application Git SHA.
3. Author the smallest additive forward migration from the checked-in 045–052 definitions. Do not edit an already-applied migration and do not change formulas, thresholds, scientific identities, or immutable evidence.
4. Apply the forward-fix to the restored copy. Run the verification queries, affected migration tests, collection rehearsal, lifecycle rehearsal, and public-view probes. Compare counts, hashes, definitions, triggers, and ACLs with the preserved evidence.
5. Take a fresh production backup and checksum, apply the reviewed forward migration once, repeat the same gates, and retain all receipts with the incident record.
6. Unfreeze only the writers whose exact probes pass. Promotion and exposure remain frozen until every scientific gate for the same cycle is again evidenced.

### Stop conditions

Stop the recovery and keep the system fail-closed when any preimage or checksum is missing; the 048/049 collision query returns unexpected rows; a function, trigger, or ACL differs from the reviewed definition; immutable row counts or hashes change; an application binary lacks an explicit compatibility record; a rehearsal fails; or a repair would require editing an applied migration, deleting evidence, or changing a formula, threshold, identity, or scientific state contract.

## Cleanup Rule

- If a `scripts/tli` file is not on one of the surfaces above and is not imported by runtime code, it is a deletion candidate.
