export function buildComparisonsQueryDescriptor(input: {
  themeId: string
  threeDaysAgo: string
  useV4Serving: boolean
}) {
  return input.useV4Serving
    ? { mode: 'v4' as const, themeId: input.themeId }
    : { mode: 'legacy' as const, themeId: input.themeId, threeDaysAgo: input.threeDaysAgo }
}

export function shouldFallbackToLegacyComparisons(result: {
  data: unknown[] | null
  error: { code?: string; message?: string } | null
}) {
  if (result.error) return false
  if (result.data == null) return false
  return false
}

export function isCertificationArtifactError(error: { code?: string; message?: string } | null) {
  return error?.code === 'CERTIFICATION_REQUIRED'
}

export function resolveComparisonsResult<T>(
  v4Result: { data: T[] | null; error: { code?: string; message?: string } | null },
  _legacyResult: { data: T[] | null; error: { code?: string; message?: string } | null },
) {
  void _legacyResult
  if (isCertificationArtifactError(v4Result.error)) return v4Result
  if (v4Result.error || v4Result.data == null) return v4Result
  return v4Result
}
