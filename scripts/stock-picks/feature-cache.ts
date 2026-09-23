import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StockFeatureVector } from '@/scripts/stock-picks/features'

/**
 * 피처 사전계산 디스크 캐시.
 *
 * 롤링 지표 계산이 실험 1회당 2,642종목 × 수백 거래일로 ~8분을 먹는다. 입력(가격·종목·구간)이
 * 같으면 결과가 결정적이므로 재계산할 이유가 없다 — 가설을 여러 개 돌려보려면 이게 병목이다.
 *
 * 키에 가격 행 수와 계산 소스 해시를 넣어 데이터나 계산 코드가 바뀌면 캐시를 무효화한다.
 */
const CACHE_DIR = join(process.cwd(), '.cache', 'stock-picks-features')
const FEATURE_SOURCE_FILES = [
  'scripts/stock-picks/optimize.ts',
  'scripts/stock-picks/features.ts',
  'scripts/stock-picks/indicators.ts',
  'scripts/stock-picks/data-handler.ts',
] as const

export const featureSourceHash = (): string => {
  const hash = createHash('sha256')
  for (const path of FEATURE_SOURCE_FILES) {
    hash.update(path).update('\0').update(readFileSync(join(process.cwd(), path))).update('\0')
  }
  return hash.digest('hex')
}

export interface FeatureCacheKey {
  readonly symbolCount: number
  readonly historyStart: string
  readonly historyEnd: string
  readonly evaluationStart: string
  readonly priceRowCount: number
  readonly featureSourceHash: string
}

export const featureCacheKey = (key: FeatureCacheKey): string => createHash('sha256')
  .update(JSON.stringify([
    key.symbolCount, key.historyStart, key.historyEnd, key.evaluationStart, key.priceRowCount,
    key.featureSourceHash,
  ]))
  .digest('hex')
  .slice(0, 16)

/**
 * 날짜당 한 줄(NDJSON)로 쓴다. 전체를 한 문자열로 만들면 피처맵이 커질 때
 * `JSON.stringify`가 V8 문자열 길이 한계에 걸려 터진다(실측: TRAIN 구간에서 RangeError).
 */
const cachePath = (key: FeatureCacheKey): string => join(CACHE_DIR, `${featureCacheKey(key)}.ndjson`)

export function readFeatureCache(key: FeatureCacheKey): ReadonlyMap<string, readonly StockFeatureVector[]> | null {
  const path = cachePath(key)
  if (!existsSync(path)) return null
  try {
    const map = new Map<string, readonly StockFeatureVector[]>()
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line) continue
      const [date, rows] = JSON.parse(line) as [string, StockFeatureVector[]]
      map.set(date, rows)
    }
    return map.size > 0 ? map : null
  } catch {
    // 깨진 캐시는 조용히 버리고 재계산한다 — 잘못된 피처로 실험하느니 8분을 쓴다.
    return null
  }
}

export function writeFeatureCache(
  key: FeatureCacheKey,
  featuresByDate: ReadonlyMap<string, readonly StockFeatureVector[]>,
): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  // 임시 파일에 다 쓴 뒤 rename — 중단된 쓰기가 반쪽 캐시로 남지 않게.
  const tmp = `${cachePath(key)}.tmp`
  rmSync(tmp, { force: true })
  writeFileSync(tmp, '', 'utf8')
  for (const [date, rows] of featuresByDate) {
    appendFileSync(tmp, `${JSON.stringify([date, rows])}\n`, 'utf8')
  }
  renameSync(tmp, cachePath(key))
}
