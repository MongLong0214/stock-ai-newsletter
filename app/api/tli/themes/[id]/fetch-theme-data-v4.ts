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
  error: unknown | null
}) {
  if (result.error) return true
  if (!result.data) return true
  return false
}

export function resolveComparisonsResult<T>(
  v4Result: { data: T[] | null; error: { code?: string; message?: string } | null },
  legacyResult: { data: T[] | null; error: { code?: string; message?: string } | null },
) {
  if (v4Result.error || v4Result.data == null) return legacyResult
  return v4Result
}
