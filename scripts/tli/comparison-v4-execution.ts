export function buildPromotionExecutionInput(input: {
  runIds: string[]
  actor: string
  productionVersion: string
}) {
  return {
    runIds: [...input.runIds],
    actor: input.actor,
    productionVersion: input.productionVersion,
  }
}

export function buildBackfillManifestExecutionInput(input: {
  sourceTable: string
  targetTable: string
  actor: string
}) {
  return {
    sourceTable: input.sourceTable,
    targetTable: input.targetTable,
    actor: input.actor,
  }
}
