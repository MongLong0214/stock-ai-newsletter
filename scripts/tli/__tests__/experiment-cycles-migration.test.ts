import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const migrationPath = join(process.cwd(), 'supabase/migrations/049_tli_experiment_cycles.sql')
const cycleRpcs = [
  'freeze_tli_cycle', 'start_tli_cycle', 'record_tli_safety_decision',
  'record_tli_final_decision', 'promote_tli_internal', 'record_tli_canary_failure',
  'release_tli_public', 'hold_tli_public_release', 'resume_tli_public_release',
  'attest_tli_origin', 'enroll_tli_origin', 'extend_tli_cycle_calendar',
] as const
const allRpcs = [...cycleRpcs, 'finalize_tli_scientific_prediction_score'] as const

let sql = ''
let normalizedSql = ''

beforeAll(() => {
  sql = readFileSync(migrationPath, 'utf8')
  normalizedSql = sql.replace(/\s+/g, ' ').trim()
})

function tableBody(table: string): string {
  const match = normalizedSql.match(new RegExp(`CREATE TABLE public\\.${table} \\((.*?)\\);`))
  expect(match, `missing table ${table}`).not.toBeNull()
  return match?.[1] ?? ''
}

function functionBody(name: string): string {
  const match = normalizedSql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`,
  ))
  expect(match, `missing function ${name}`).not.toBeNull()
  return match?.[0] ?? ''
}

function expectFragments(value: string, fragments: readonly string[]): void {
  for (const fragment of fragments) expect(value).toContain(fragment)
}

describe('TLI immutable experiment-cycle migration', () => {
  it('is atomic and creates the exact six Todo 12 tables', () => {
    expect(normalizedSql).toMatch(/^BEGIN;/)
    expect(normalizedSql).toMatch(/COMMIT;$/)
    expect([...normalizedSql.matchAll(/CREATE TABLE public\.(tli_[a-z_]+) \(/g)]
      .map(([, name]) => name)).toEqual([
      'tli_experiment_cycles', 'tli_evidence_artifacts', 'tli_evidence_attestations',
      'tli_cycle_calendar_extensions', 'tli_experiment_origin_manifests',
      'tli_model_release_events',
    ])
  })

  it('defines the frozen cycle contract and the single-active-cycle race guard', () => {
    const body = tableBody('tli_experiment_cycles')
    expectFragments(body, [
      'id UUID PRIMARY KEY',
      "status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','frozen','running','safety_hold','ready_for_decision','rejected','promoted_internal','public_approved'))",
      'study_contract_id UUID REFERENCES public.tli_attention_study_contracts(id) ON DELETE RESTRICT',
      'study_contract_sha256 TEXT', 'candidate_model_version TEXT',
      'candidate_model_sha256 TEXT', 'comparator_version TEXT',
      'comparator_artifact_sha256 TEXT', 'dataset_manifest_sha256 TEXT',
      'feature_contract_version TEXT', 'feature_contract_sha256 TEXT',
      'labeler_version TEXT', 'label_contract_sha256 TEXT', 'calibration_version TEXT',
      'calibration_artifact_sha256 TEXT', 'babl_contract_sha256 TEXT',
      "primary_endpoint TEXT CHECK (primary_endpoint = 'paired_brier_delta')",
      'alpha NUMERIC CHECK (alpha = 0.01)', 'thresholds JSONB',
      'power_simulation_sha256 TEXT', 'power_simulation_result JSONB',
      'planned_origins INTEGER CHECK (planned_origins BETWEEN 16 AND 52)',
      'safety_origins INTEGER CHECK (safety_origins = 8)', 'calendar_start DATE',
      'initial_calendar_end DATE', 'frozen_at TIMESTAMPTZ', 'running_at TIMESTAMPTZ',
      'safety_checked_at TIMESTAMPTZ', 'decision_at TIMESTAMPTZ',
      'decision_origin_date DATE', 'promoted_internal_at TIMESTAMPTZ',
      'public_approved_at TIMESTAMPTZ', 'preregistration_sha256 TEXT',
      'preregistration_payload JSONB',
    ])
    expect(normalizedSql).toContain(
      "CREATE UNIQUE INDEX uniq_tli_active_cycle ON public.tli_experiment_cycles ((true)) WHERE status IN ('frozen','running','ready_for_decision','promoted_internal')",
    )
  })

  it('defines append-only calendar and enrolled-origin provenance with four uniqueness guards', () => {
    expectFragments(tableBody('tli_cycle_calendar_extensions'), [
      'id UUID PRIMARY KEY', 'cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT',
      'previous_end DATE NOT NULL', 'new_end DATE NOT NULL',
      "reason_code TEXT NOT NULL CHECK (reason_code IN ('source_maturity_delay','market_calendar_delay','operational_outage'))",
      'evidence_artifact_id UUID NOT NULL UNIQUE REFERENCES public.tli_evidence_artifacts(id) ON DELETE RESTRICT',
      'evidence_sha256 TEXT NOT NULL', 'created_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      'UNIQUE (cycle_id, new_end)',
    ])
    const origin = tableBody('tli_experiment_origin_manifests')
    expectFragments(origin, [
      'id UUID PRIMARY KEY', 'cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT',
      'study_origin_manifest_id UUID NOT NULL REFERENCES public.tli_study_origin_manifests(id) ON DELETE RESTRICT',
      'forecast_origin_manifest_id UUID NOT NULL REFERENCES public.tli_forecast_origin_manifests(id) ON DELETE RESTRICT',
      'sequence_no INTEGER NOT NULL CHECK (sequence_no > 0)',
      "enrollment_role TEXT NOT NULL CHECK (enrollment_role IN ('confirmatory','predecision_diagnostic','public_canary','prepublic_diagnostic','monitoring'))",
      'public_canary_no SMALLINT', 'candidate_model_sha256 TEXT NOT NULL',
      'comparator_artifact_sha256 TEXT NOT NULL', 'kospi_base_trade_date DATE NOT NULL',
      'kospi_base_close NUMERIC NOT NULL', 'kospi_lookback_trade_date DATE NOT NULL',
      'kospi_lookback_close NUMERIC NOT NULL', 'kospi_source_ids JSONB NOT NULL',
      'kospi_input_sha256 TEXT NOT NULL',
      "regime TEXT NOT NULL CHECK (regime IN ('risk_off','neutral','risk_on'))",
      'created_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      'UNIQUE (cycle_id, study_origin_manifest_id)',
      'UNIQUE (cycle_id, forecast_origin_manifest_id)', 'UNIQUE (cycle_id, sequence_no)',
    ])
    expect(normalizedSql).toContain('CREATE UNIQUE INDEX uniq_tli_experiment_origin_canary ON public.tli_experiment_origin_manifests (cycle_id, public_canary_no) WHERE public_canary_no IS NOT NULL')
    expect(origin).toContain("(enrollment_role = 'public_canary' AND public_canary_no IS NOT NULL AND public_canary_no BETWEEN 1 AND 4)")
    expect(origin).toContain("(enrollment_role <> 'public_canary' AND public_canary_no IS NULL)")
  })

  it('defines exact evidence/release schemas, canonical paths and immutable least privilege', () => {
    expectFragments(tableBody('tli_evidence_artifacts'), [
      'id UUID PRIMARY KEY', 'cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT',
      'experiment_origin_manifest_id UUID',
      "artifact_type TEXT NOT NULL CHECK (artifact_type IN ('preregistration','dataset_manifest','model_manifest','cycle_manifest','origin_manifest','calendar_extension','safety_report','final_decision','public_canary','monitoring_hold','monitoring_resume'))",
      'artifact_key TEXT NOT NULL', 'content_sha256 TEXT NOT NULL', 'payload JSONB NOT NULL',
      'created_at TIMESTAMPTZ NOT NULL DEFAULT now()', 'UNIQUE (cycle_id, artifact_type, artifact_key)',
    ])
    expectFragments(tableBody('tli_evidence_attestations'), [
      'id UUID PRIMARY KEY', 'artifact_id UUID NOT NULL UNIQUE REFERENCES public.tli_evidence_artifacts(id) ON DELETE RESTRICT',
      'git_commit_sha TEXT NOT NULL', 'git_blob_sha TEXT NOT NULL', 'repo_relative_path TEXT NOT NULL',
      'content_sha256 TEXT NOT NULL', 'verifier_version TEXT NOT NULL',
      'verifier_code_sha TEXT NOT NULL', 'verified_at TIMESTAMPTZ NOT NULL',
    ])
    expectFragments(tableBody('tli_model_release_events'), [
      'id UUID PRIMARY KEY', 'model_registry_id UUID REFERENCES public.model_registry(experiment_cycle_id) ON DELETE RESTRICT',
      'cycle_id UUID NOT NULL REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT',
      'from_status TEXT NOT NULL', 'to_status TEXT NOT NULL', 'reason_code TEXT NOT NULL',
      'evidence_sha256 TEXT NOT NULL', 'created_at TIMESTAMPTZ NOT NULL DEFAULT now()',
    ])
    expectFragments(normalizedSql, [
      'ADD CONSTRAINT tli_evidence_artifacts_origin_fkey FOREIGN KEY (experiment_origin_manifest_id) REFERENCES public.tli_experiment_origin_manifests(id) ON DELETE RESTRICT',
      "docs/evidence/tli-v3-scientific-rebuild/", "artifact_key = 'singleton'",
      "artifact_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'", "artifact_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'",
      'CREATE UNIQUE INDEX uniq_tli_evidence_origin_artifact',
      'BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_evidence_artifacts',
      'BEFORE UPDATE OR DELETE OR TRUNCATE ON public.tli_evidence_attestations',
      'ALTER TABLE public.tli_evidence_artifacts ENABLE ROW LEVEL SECURITY',
      'ALTER TABLE public.tli_evidence_attestations ENABLE ROW LEVEL SECURITY',
      'REVOKE ALL ON TABLE public.tli_evidence_artifacts, public.tli_evidence_attestations FROM PUBLIC, anon, authenticated', 'evidence verified_at must be canonical UTC and not in the future',
      'tli_require_canonical_json_v1', 'canonical-json-v1 input is not the unique RFC 8785 representation',
    ])
  })

  it('splits legacy/scientific prediction identity and enforces immutable one-shot scoring', () => {
    expectFragments(normalizedSql, [
      'ADD COLUMN experiment_cycle_id UUID REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT',
      'ADD COLUMN experiment_origin_manifest_id UUID REFERENCES public.tli_experiment_origin_manifests(id) ON DELETE RESTRICT',
      "ADD COLUMN scientific_prediction_role TEXT CHECK (scientific_prediction_role IN ('candidate','comparator'))",
      'ADD COLUMN model_artifact_sha256 TEXT', 'ADD COLUMN feature_contract_hash TEXT',
      'ADD COLUMN feature_snapshot_hash TEXT', 'ADD COLUMN forecast_cutoff TIMESTAMPTZ',
      'ADD COLUMN forecast_origin_week DATE',
      'ADD COLUMN actual_label_id UUID REFERENCES public.theme_labels(id) ON DELETE RESTRICT',
      'ADD COLUMN score_payload_sha256 TEXT', 'ADD COLUMN score_exclusion_reason TEXT',
      'CREATE UNIQUE INDEX uniq_theme_predictions_v3_legacy_identity',
      'WHERE experiment_cycle_id IS NULL', 'CREATE UNIQUE INDEX uniq_theme_predictions_v3_scientific_identity',
      'WHERE experiment_cycle_id IS NOT NULL',
      'scientific rows require cycle, origin, and role together',
      "serving_role = 'shadow'", "score_status = 'pending'",
      'scientific predictions cannot be deleted', 'scientific inference and provenance are immutable',
      'scientific terminal scores are immutable', 'guard_tli_scientific_prediction_truncate', 'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.theme_predictions_v3 FROM service_role', "score_status IN ('scored','excluded')",
      "labeler_version = 'gta-v2'", 'prediction foundation does not match the exact label foundation',
      'FOR UPDATE', "current_setting('tli.finalize_scientific_prediction_id', true)",
      "'public.finalize_tli_scientific_prediction_score(text,text)'::REGPROCEDURE",
      'CREATE VIEW public.tli_public_scientific_predictions_v3', 'JOIN public.model_registry AS registry',
      "registry.scientific_release_status = 'public'", "prediction.scientific_prediction_role = 'candidate'",
      "hashtextextended('tli-cycle-v1|' || NEW.experiment_cycle_id::text, 0)",
    ])
    const immutable = 'id theme_id prediction_date horizon_days serving_role p_rise ci_lower ci_upper abstain abstain_reasons features model_version labeler_version param_version experiment_cycle_id experiment_origin_manifest_id scientific_prediction_role model_artifact_sha256 feature_contract_hash feature_snapshot_hash forecast_cutoff forecast_origin_week created_at'.split(' ')
    for (const column of immutable) expect(normalizedSql).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`)
  })

  it('adds the registry FK/UNIQUE and replaces Todo 1 with a cycle-RPC-only guard', () => {
    expectFragments(normalizedSql, [
      'DROP TRIGGER guard_model_registry_before_scientific_cycles ON public.model_registry',
      'DROP FUNCTION public.reject_model_registry_mutation_before_scientific_cycles()',
      'FOREIGN KEY (experiment_cycle_id) REFERENCES public.tli_experiment_cycles(id) ON DELETE RESTRICT',
      'UNIQUE (experiment_cycle_id)', 'guard_model_registry_scientific_cycle_rpc',
      "current_setting('tli.cycle_registry_rpc', true)",
      'model_registry scientific lifecycle mutates only through cycle RPCs',
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.model_registry FROM service_role',
    ])
    expect(normalizedSql).not.toContain('mutation is blocked until the Todo 12 cycle RPC is installed')
  })

  it('defines all 12 cycle RPCs plus the separate score finalizer with lock ordering', () => {
    expect([...normalizedSql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)]
      .map(([, name]) => name).filter((name) => allRpcs.includes(name as typeof allRpcs[number])))
      .toEqual(allRpcs)
    for (const name of allRpcs) {
      const body = functionBody(name)
      expect(body).toContain('SECURITY DEFINER')
      expect(body).toContain('SET search_path = public, extensions')
    }
    for (const name of cycleRpcs) expect(functionBody(name)).toContain("'tli-cycle-v1|'")
    for (const name of ['freeze_tli_cycle', 'start_tli_cycle', 'record_tli_safety_decision',
      'record_tli_final_decision', 'record_tli_canary_failure', 'release_tli_public']) {
      const body = functionBody(name)
      expect(body.indexOf("hashtextextended('tli-active-cycle-v1', 0)"))
        .toBeLessThan(body.indexOf("'tli-cycle-v1|'"))
    }
    expect(functionBody('record_tli_final_decision')).toMatch(/safety_report[\s\S]*safety_checked_at/)
    expect(functionBody('release_tli_public')).toMatch(/public_canary_no[\s\S]*4/)
    expectFragments(functionBody('start_tli_cycle'), ["'prospective_cycle_running'", "v_model_manifest_payload -> 'coefficients' IS DISTINCT FROM p_coefficients"])
    expect(functionBody('promote_tli_internal')).toContain("status = 'challenger'")
    expect(functionBody('release_tli_public')).toContain("'superseded_by_validated_cycle'")
  })

  it('pins enrollment roles, state edges, direct-update rejection and service-only execution', () => {
    expectFragments(normalizedSql, [
      "OLD.status = 'draft' AND NEW.status = 'frozen'",
      "OLD.status = 'frozen' AND NEW.status = 'running'",
      "OLD.status = 'running' AND NEW.status IN ('running','safety_hold','ready_for_decision','rejected')",
      "OLD.status = 'ready_for_decision' AND NEW.status = 'promoted_internal'",
      "OLD.status = 'promoted_internal' AND NEW.status IN ('safety_hold','public_approved')",
      'cycle state transition is not allowed', 'cycle updates require a Todo 12 RPC',
      "WHEN v_cycle.status = 'running'", "THEN 'confirmatory'", "ELSE 'predecision_diagnostic'",
      "WHEN v_cycle.status = 'promoted_internal'", "THEN 'public_canary'", "ELSE 'prepublic_diagnostic'",
      "WHEN v_cycle.status = 'public_approved'", "THEN 'monitoring'",
      'matching origin artifact and attestation are required before scientific prediction insert',
      'same cycle origin is already enrolled', 'monitoring enrollment requires the current exact public champion',
      'monitoring hold reason must be a canonical nonempty reason code',
    ])
    for (const name of allRpcs) {
      expect(normalizedSql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}`)
      expect(normalizedSql).toContain('FROM PUBLIC, anon, authenticated')
      expect(normalizedSql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}`)
    }
  })

  it('materializes every fail-closed enrollment, evidence, and concurrency boundary', () => {
    expectFragments(normalizedSql, [
      'another active challenger cycle already exists',
      'an active challenger already exists; start never auto-replaces it',
      'cycle freeze must precede the first prospective origin cutoff',
      'cycle start must precede the first prospective origin cutoff',
      'origin enrollment is forbidden for this cycle status',
      'origin enrollment dates must be strictly increasing',
      'running enrollment requires a prospective foundation inside the effective calendar',
      'enrollment requires a tradable Monday KOSPI base close at the forecast cutoff',
      'public canary and prepublic origins must be after internal promotion',
      'monitoring origins must be after public approval',
      'origin artifact payload does not match the enrolled DB provenance',
      'evidence attestation content SHA must match its immutable artifact',
      'evidence path is not the canonical cycle evidence path',
      'calendar extension previous end, new end, or reason is invalid',
      'calendar extension evidence changes the frozen planned count or hash bundle',
      'public release requires public_canary_no 1 through 4 without replacement',
      'KOSPI provenance closes must be finite positive numbers', 'v_old_champion.experiment_cycle_id',
    ])
  })

  it('materializes every fail-closed prediction, score, and final-decision boundary', () => {
    expectFragments(normalizedSql, [
      "score_status = 'pending'", 'actual_label_id IS NULL',
      'scientific prediction role does not match the frozen model version and artifact',
      'scientific prediction foundation, theme, cutoff, label, or feature contract is not exact',
      'scientific prediction updates require finalize_tli_scientific_prediction_score',
      'scientific pending scores transition only to scored or excluded',
      'scientific prediction is missing, legacy, or already terminal',
      'scientific scoring time must be after exact label finalization and not in the future', "'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'",
      'excluded scientific prediction requires the exact terminal excluded label reason',
      'final decision requires exact eligible sequences 1 through planned_origins',
      'passing safety_report attestation and safety_checked_at are required before final decision',
      'safety report metrics must be complete, finite, and in range',
      'cycle freeze statistical and preregistration payloads must have exact JSON types',
      "scientific_prediction_role = 'candidate' THEN 'comparator'",
    ])
  })
})
