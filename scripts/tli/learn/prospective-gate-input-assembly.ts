import { canonicalJsonV1Sha256 } from '../../../lib/tli/canonical-json-v1'
import {
  resolveProspectiveCheckpoint,
  sortedUnique,
  type ProspectiveLifecycleInput,
} from './prospective-gate-contract'
import type {
  ProspectiveGateIncident,
  ProspectiveGateInputBundle,
  ProspectiveGateSource,
} from './prospective-gate-input-contract'
import { resolveFrozenGateHashes } from './prospective-gate-input-hashes'
import {
  addIncident,
  artifactAttested,
  summarizeCompleteness,
  summarizeProspectiveOrigin,
} from './prospective-gate-origin-summary'

export function assembleProspectiveGateInput(source: ProspectiveGateSource): ProspectiveGateInputBundle {
  const incidents = new Map<string, string[]>()
  for (const type of ['preregistration', 'cycle_manifest', 'dataset_manifest', 'model_manifest']) {
    const artifacts = source.evidence.filter((row) => row.artifact_type === type && row.artifact_key === 'singleton')
    if (artifacts.length !== 1 || !artifactAttested(artifacts[0], source)) {
      addIncident(incidents, `cycle:${source.cycle.id}`, 'gate_evidence_artifact_missing')
    }
  }
  const summaries = source.origins
    .filter((origin) => origin.enrollment_role === 'confirmatory' && origin.sequence_no <= source.cycle.planned_origins)
    .sort((left, right) => left.sequence_no - right.sequence_no)
    .map((origin) => summarizeProspectiveOrigin(source, origin, incidents))
  const safetyArtifacts = source.evidence.filter((row) => row.artifact_type === 'safety_report'
    && row.artifact_key === 'singleton' && artifactAttested(row, source))
  const safetyDecision = safetyArtifacts.length === 1 ? safetyArtifacts[0].payload.decision : null
  const safetyArtifact: ProspectiveLifecycleInput['safetyArtifact'] = safetyDecision === 'pass'
    || safetyDecision === 'safety_hold'
    ? { decision: safetyDecision, attested: true }
    : null
  const lifecycle: ProspectiveLifecycleInput = {
    cycleId: source.cycle.id,
    cycleStatus: source.cycle.status,
    plannedOrigins: source.cycle.planned_origins,
    safetyOrigins: source.cycle.safety_origins,
    enrolledOrigins: summaries.map((row) => ({
      sequenceNo: row.origin.sequence_no, originDate: row.originDate,
      enrollmentRole: row.origin.enrollment_role, eligible: row.eligible,
    })),
    safetyCheckedAt: source.cycle.safety_checked_at,
    safetyArtifact,
    decisionAt: source.cycle.decision_at,
  }
  const checkpoint = resolveProspectiveCheckpoint(lifecycle)
  const hashes = resolveFrozenGateHashes(source)
  const incidentRows: ProspectiveGateIncident[] = [...incidents]
    .map(([originId, reasons]) => ({ originId, reasons: sortedUnique(reasons) }))
    .sort((left, right) => left.originId.localeCompare(right.originId))
  if (checkpoint.kind === 'safety_due') {
    const safetySummaries = summaries.filter((row) => row.origin.sequence_no <= 8)
    const safetyOriginIds = new Set(safetySummaries.map((row) => row.origin.id))
    const safetyIncidents = incidentRows.filter((incident) => (
      incident.originId.startsWith('cycle:') || safetyOriginIds.has(incident.originId)
    ))
    const rows = safetySummaries.flatMap((row) => row.exactPairs)
      .map(({ originDate, themeId, candidateProbability, outcome }) => ({
        originDate, themeId, candidateProbability, outcome,
      }))
    return {
      lifecycle, checkpoint, incidents: safetyIncidents,
      safetyInput: {
        cycleId: source.cycle.id, sequenceStart: 1, sequenceEnd: 8, rows,
        criticalIncidentCount: safetyIncidents.length,
        gateInputSha256: canonicalJsonV1Sha256({
          cycleId: source.cycle.id, sequenceStart: 1, sequenceEnd: 8,
          rows: rows.map((row) => ({ ...row, candidateProbability: Number.isFinite(row.candidateProbability)
            ? row.candidateProbability : String(row.candidateProbability) })),
          incidents: safetyIncidents, frozenHashes: hashes.expected,
        }),
        frozenHashes: hashes.expected,
      },
    }
  }
  if (checkpoint.kind !== 'final_due') return { lifecycle, checkpoint, incidents: incidentRows }
  const report = summarizeCompleteness(summaries)
  const rows = summaries.flatMap((row) => row.exactPairs)
    .sort((left, right) => left.originDate.localeCompare(right.originDate) || left.themeId.localeCompare(right.themeId))
  const eligibleOrigins = summaries.map((row) => ({
    originId: row.origin.id,
    sequenceNo: row.origin.sequence_no,
    originDate: row.originDate,
    regime: row.origin.regime,
    kospiBaseTradeDate: row.origin.kospi_base_trade_date,
    kospiBaseClose: row.origin.kospi_base_close,
    kospiLookbackTradeDate: row.origin.kospi_lookback_trade_date,
    kospiLookbackClose: row.origin.kospi_lookback_close,
    kospiSourceIds: row.origin.kospi_source_ids,
    kospiInputSha256: row.origin.kospi_input_sha256,
  }))
  const originAccounting = summaries.map((row) => row.accounting)
  const decisionOriginDate = summaries.find((row) => row.origin.sequence_no === source.cycle.planned_origins)?.originDate
  if (decisionOriginDate === undefined || decisionOriginDate.length === 0) throw new Error('planned decision origin date is missing')
  const hashRows = rows.map((row) => ({
    ...row,
    candidateProbability: Number.isFinite(row.candidateProbability) ? row.candidateProbability : String(row.candidateProbability),
    comparatorProbability: Number.isFinite(row.comparatorProbability) ? row.comparatorProbability : String(row.comparatorProbability),
  }))
  const gateInputSha256 = canonicalJsonV1Sha256({
    cycleId: source.cycle.id, plannedOrigins: source.cycle.planned_origins,
    eligibleOrigins, originAccounting, rows: hashRows, completeness: report, incidents: incidentRows,
    frozenHashes: hashes.observed, expectedFrozenHashes: hashes.expected,
  })
  return {
    lifecycle, checkpoint, incidents: incidentRows,
    finalDataset: {
      cycleId: source.cycle.id, plannedOrigins: source.cycle.planned_origins,
      sequenceStart: 1, sequenceEnd: source.cycle.planned_origins, decisionOriginDate,
      eligibleOrigins, originAccounting, rows, completeness: report, criticalIncidentCount: incidentRows.length,
      incidents: incidentRows, gateInputSha256,
      frozenHashes: hashes.observed, expectedFrozenHashes: hashes.expected,
    },
  }
}
