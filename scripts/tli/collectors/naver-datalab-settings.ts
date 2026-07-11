const ANCHOR_BATCH_THEME_SIZE = 4
const LEGACY_BATCH_THEME_SIZE = 5

export const isDatalabAnchorEnabled = (
  envValue = process.env.TLI_ANCHOR_ENABLED,
): boolean => envValue !== 'false' && envValue !== '0'

export const splitDatalabThemeBatches = <T>(
  themes: readonly T[],
  anchorEnabled: boolean,
): T[][] => {
  const batchSize = anchorEnabled ? ANCHOR_BATCH_THEME_SIZE : LEGACY_BATCH_THEME_SIZE
  const batches: T[][] = []
  for (let index = 0; index < themes.length; index += batchSize) {
    batches.push(themes.slice(index, index + batchSize))
  }
  return batches
}
