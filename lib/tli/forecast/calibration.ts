/**
 * TCAR-016: Calibration — ECE (Expected Calibration Error) computation
 *
 * Global and per-slice ECE. All functions are PURE (no DB calls).
 */

// --- Types ---

export interface CalibrationBin {
  predictedProb: number
  actualOutcome: number
  count: number
}

export interface ECEResult {
  ece: number
  totalSamples: number
  binCount: number
}

export interface SliceECEResult {
  sliceResults: Record<string, ECEResult>
  worstSliceName: string
  worstSliceECE: number
}

// --- ECE Computation ---

export const computeECE = (bins: CalibrationBin[]): ECEResult => {
  const activeBins = bins.filter((b) => b.count > 0)

  if (activeBins.length === 0) {
    return { ece: 0, totalSamples: 0, binCount: 0 }
  }

  const totalSamples = activeBins.reduce((sum, b) => sum + b.count, 0)

  let ece = 0
  for (const bin of activeBins) {
    const weight = bin.count / totalSamples
    const error = Math.abs(bin.predictedProb - bin.actualOutcome)
    ece += weight * error
  }

  // Clamp to [0, 1]
  ece = Math.max(0, Math.min(1, ece))
  // Fail-closed: corrupt ECE → worst-case (1.0), not best-case (0)
  if (!isFinite(ece)) ece = 1

  return { ece, totalSamples, binCount: activeBins.length }
}

// --- Per-Slice ECE ---

export const computeSliceECE = (
  slices: Record<string, CalibrationBin[]>,
): SliceECEResult => {
  const sliceNames = Object.keys(slices)

  if (sliceNames.length === 0) {
    return { sliceResults: {}, worstSliceName: '', worstSliceECE: 0 }
  }

  const sliceResults: Record<string, ECEResult> = {}
  let worstSliceName = ''
  let worstSliceECE = 0

  for (const name of sliceNames) {
    const result = computeECE(slices[name])
    sliceResults[name] = result

    if (result.ece > worstSliceECE) {
      worstSliceECE = result.ece
      worstSliceName = name
    }
  }

  return { sliceResults, worstSliceName, worstSliceECE }
}
