const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/

export const parseCanonicalUtcTimestamp = (value: string): number | null => {
  if (!CANONICAL_UTC_TIMESTAMP.test(value)) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString() === value ? parsed : null
}

export const isCanonicalTimestampAtOrBefore = (
  value: string,
  cutoffAt: string,
): boolean => {
  const timestamp = parseCanonicalUtcTimestamp(value)
  const cutoff = parseCanonicalUtcTimestamp(cutoffAt)
  return timestamp !== null && cutoff !== null && timestamp <= cutoff
}

export const isCanonicalSha256 = (value: string): boolean => LOWERCASE_SHA256.test(value)
