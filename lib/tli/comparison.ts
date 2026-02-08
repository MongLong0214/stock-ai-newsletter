/**
 * 테마 비교 및 분석 모듈
 *
 * 3-Pillar 복합 유사도 알고리즘:
 *   1. 특성 벡터 유사도 (Feature Vector) — 데이터 1일분만 있어도 동작
 *   2. 곡선 상관관계 (Curve Correlation) — 7일+ 데이터 보너스
 *   3. 키워드 유사도 (Keyword Jaccard) — 같은 섹터/카테고리 매칭
 *
 * 가중치는 데이터 가용량에 따라 적응적으로 조정됨.
 */

import { daysBetween, standardDeviation, avg } from './normalize';

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

export interface TimeSeriesPoint {
  day: number;
  value: number;
}

/** 테마의 수치적 특성을 요약한 벡터 */
export interface ThemeFeatures {
  /** 성장률 (최근 7일 vs 이전 7일), 0-1 정규화 */
  growthRate: number;
  /** 관심도 변동성 (표준편차 기반), 0-1 정규화 */
  volatility: number;
  /** 뉴스 집약도 (30일 기준), 0-1 정규화 */
  newsIntensity: number;
  /** 현재 점수 레벨, score / 100 */
  scoreLevel: number;
  /** 활동 기간 (최대 365일 기준), 0-1 정규화 */
  activeDaysNorm: number;
}

const MAX_LIFECYCLE_DAYS = 365;

// ---------------------------------------------------------------------------
// 타임라인 처리 (기존 유지)
// ---------------------------------------------------------------------------

/** 날짜 기반 데이터를 first_spike_date 기준 상대 일수로 변환 */
export function normalizeTimeline(
  data: Array<{ date: string; value: number }>,
  firstSpikeDate: string,
): TimeSeriesPoint[] {
  return data.map(d => ({
    day: daysBetween(firstSpikeDate, d.date),
    value: d.value,
  }));
}

/** peak 값 기준으로 0-1 정규화 */
export function normalizeValues(data: TimeSeriesPoint[]): TimeSeriesPoint[] {
  const peak = Math.max(...data.map(d => d.value), 1);
  return data.map(d => ({ day: d.day, value: d.value / peak }));
}

// ---------------------------------------------------------------------------
// 피어슨 상관계수 (임계값 완화: 0.005)
// ---------------------------------------------------------------------------

/**
 * 피어슨 상관계수 계산
 * - 최소 7개 데이터 포인트 필요
 * - 상수 타임라인(stddev < 0.005) 스킵
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 7) return 0; // 1주 미만 데이터로는 패턴 비교 불가

  const xSlice = x.slice(0, n);
  const ySlice = y.slice(0, n);

  const avgX = xSlice.reduce((a, b) => a + b, 0) / n;
  const avgY = ySlice.reduce((a, b) => a + b, 0) / n;

  // 상수 타임라인 스킵 (변동 없는 데이터는 상관분석 무의미)
  // 값이 0-1 정규화 범위이므로 임계값을 0.005로 완화
  const stdX = Math.sqrt(xSlice.reduce((s, v) => s + (v - avgX) ** 2, 0) / n);
  const stdY = Math.sqrt(ySlice.reduce((s, v) => s + (v - avgY) ** 2, 0) / n);
  if (stdX < 0.005 || stdY < 0.005) return 0;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = xSlice[i] - avgX;
    const dy = ySlice[i] - avgY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denominator = Math.sqrt(denX * denY);
  if (denominator === 0) return 0;

  return num / denominator;
}

// ---------------------------------------------------------------------------
// 피크 탐색
// ---------------------------------------------------------------------------

/** 타임라인에서 최대값의 day를 반환 */
export function findPeakDay(data: TimeSeriesPoint[]): number {
  if (data.length === 0) return 0;
  let maxIdx = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].value > data[maxIdx].value) {
      maxIdx = i;
    }
  }
  // 모든 값이 0인 경우 guard
  if (data[maxIdx].value === 0) return 0;
  return data[maxIdx].day;
}

// ---------------------------------------------------------------------------
// Pillar 1: 특성 벡터 추출 및 코사인 유사도
// ---------------------------------------------------------------------------

/**
 * 테마 데이터에서 수치적 특성 벡터를 추출한다.
 * 데이터가 1일분만 있어도 동작하도록 설계됨.
 */
export function extractFeatures(params: {
  scores: Array<{ score: number }>; // lifecycle_scores (최신순)
  interestValues: number[];         // 정규화된 관심도 값
  totalNewsCount: number;           // 최근 30일 뉴스 기사 수
  activeDays: number;               // 첫 활동 이후 경과 일수
}): ThemeFeatures {
  const { scores, interestValues, totalNewsCount, activeDays } = params;

  // growthRate: 최근 7일 평균 vs 이전 7일 평균 점수 비교
  const recentScores = scores.slice(0, Math.min(7, scores.length));
  const olderScores = scores.slice(7, Math.min(14, scores.length));
  const recentAvg = recentScores.length > 0 ? avg(recentScores.map(s => s.score)) : 0;
  const olderAvg = olderScores.length > 0 ? avg(olderScores.map(s => s.score)) : recentAvg;
  // +50pt → 1.0, -50pt → 0.0, 변동 없음 → 0.5
  const rawGrowth = olderAvg > 0 ? (recentAvg - olderAvg) / Math.max(olderAvg, 1) : 0;
  const growthRate = Math.max(0, Math.min(1, (rawGrowth + 1) / 2));

  // volatility: 관심도 값의 표준편차 (stddev 50 → 1.0)
  const vol = interestValues.length > 1 ? standardDeviation(interestValues) : 0;
  const volatility = Math.min(vol / 50, 1);

  // newsIntensity: 30일 기사 수 (100건/월 → 1.0)
  const newsIntensity = Math.min(totalNewsCount / 100, 1);

  // scoreLevel: 최신 점수 / 100
  const scoreLevel = scores.length > 0 ? scores[0].score / 100 : 0;

  // activeDaysNorm: 최대 365일 기준
  const activeDaysNorm = Math.min(activeDays, 365) / 365;

  return { growthRate, volatility, newsIntensity, scoreLevel, activeDaysNorm };
}

/**
 * 코사인 유사도 (두 벡터 간 각도 기반 유사도)
 * 결과 범위: [-1, 1], 동일 방향일수록 1에 가까움
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  return dot / denom;
}

/** Population statistics for feature dimensions */
export interface FeaturePopulationStats {
  means: number[];
  stddevs: number[];
}

/**
 * Z-score Euclidean similarity: z-score normalization으로 모집단 대비 상대적 위치 비교.
 * 코사인 유사도와 달리 비음수 벡터에서도 높은 판별력을 제공한다.
 * 반환: [0, 1] — 동일하면 1.0, 멀수록 0에 수렴
 */
export function zScoreEuclideanSimilarity(
  a: number[],
  b: number[],
  stats: FeaturePopulationStats
): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  let sumSqDiff = 0;
  for (let i = 0; i < n; i++) {
    const std = stats.stddevs[i] > 0.001 ? stats.stddevs[i] : 1;
    const zA = (a[i] - stats.means[i]) / std;
    const zB = (b[i] - stats.means[i]) / std;
    sumSqDiff += (zA - zB) ** 2;
  }
  const distance = Math.sqrt(sumSqDiff / n);
  // Exponential decay: distance 0 → 1.0, distance 2 → ~0.13
  return Math.exp(-distance);
}

// ---------------------------------------------------------------------------
// Pillar 3: 키워드 자카드 유사도
// ---------------------------------------------------------------------------

/** 두 키워드 집합의 Jaccard 유사도 (교집합 / 합집합) */
export function keywordJaccard(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 0;

  const a = new Set(setA.map(k => k.toLowerCase()));
  const b = new Set(setB.map(k => k.toLowerCase()));

  let intersection = 0;
  a.forEach(k => {
    if (b.has(k)) intersection++;
  });

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Phase-aligned curve comparison
// ---------------------------------------------------------------------------

const RESAMPLE_POINTS = 50;

/**
 * 곡선을 lifecycle 백분율 기반으로 리샘플링 (위상 정렬).
 * 두 곡선의 길이가 달라도 동일한 lifecycle 비율 구간끼리 비교 가능.
 */
function resampleCurve(curve: TimeSeriesPoint[], numPoints: number): number[] {
  if (curve.length === 0) return new Array(numPoints).fill(0);
  if (curve.length === 1) return new Array(numPoints).fill(curve[0].value);
  const maxDay = curve[curve.length - 1].day;
  if (maxDay <= 0) return new Array(numPoints).fill(curve[0].value);

  const resampled: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    const targetDay = (i / (numPoints - 1)) * maxDay;
    // Binary search for bracketing points
    let lo = 0;
    let hi = curve.length - 1;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (curve[mid].day <= targetDay) lo = mid;
      else hi = mid;
    }
    if (curve[hi].day <= targetDay || lo === hi) {
      resampled.push(curve[hi].value);
    } else {
      const span = curve[hi].day - curve[lo].day;
      const t = span > 0 ? (targetDay - curve[lo].day) / span : 0;
      resampled.push(curve[lo].value * (1 - t) + curve[hi].value * t);
    }
  }
  return resampled;
}

// ---------------------------------------------------------------------------
// Sector classification
// ---------------------------------------------------------------------------

/** 섹터 키워드 매핑 */
const SECTOR_KEYWORDS: Record<string, string[]> = {
  '반도체': ['반도체', 'HBM', 'DRAM', 'NAND', '파운드리', 'EUV', '메모리'],
  '2차전지': ['2차전지', '배터리', '리튬', '양극재', '음극재', '전해질', 'EV', '전기차'],
  '바이오': ['바이오', '제약', '신약', '임상', '의료', 'mRNA', '헬스케어'],
  'AI': ['AI', '인공지능', 'LLM', 'GPU', '데이터센터', 'ChatGPT', '딥러닝'],
  '로봇': ['로봇', '자동화', '로보틱스', '휴머노이드', '스마트팩토리'],
  '방산': ['방산', '방위', '무기', '미사일', 'K방산', '국방'],
  '에너지': ['태양광', '풍력', '수소', '원전', '원자력', 'SMR', '신재생'],
  '우주항공': ['우주', '위성', '항공', '발사체', 'UAM', '드론'],
  '블록체인': ['NFT', '비트코인', '이더리움', '코인', '블록체인', '가상자산', '크립토'],
  '엔터': ['엔터', 'K팝', '콘텐츠', '게임', '웹툰', 'OTT'],
  '건설부동산': ['건설', '부동산', '재건축', '리모델링', 'PF'],
  '금융': ['금융', '보험', '은행', '핀테크', '증권'],
};

/** 키워드 기반 섹터 분류 */
export function classifySector(keywords: string[]): string {
  let bestSector = 'etc';
  let bestScore = 0;
  for (const [sector, sectorKws] of Object.entries(SECTOR_KEYWORDS)) {
    const score = keywords.filter(kw =>
      sectorKws.some(sk => kw.toLowerCase().includes(sk.toLowerCase()))
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestSector = sector;
    }
  }
  return bestSector;
}

// ---------------------------------------------------------------------------
// 복합 비교 (3-Pillar Composite)
// ---------------------------------------------------------------------------

/** ThemeFeatures를 명시적 순서로 배열 변환 */
function featuresToArray(f: ThemeFeatures): number[] {
  return [f.growthRate, f.volatility, f.newsIntensity, f.scoreLevel, f.activeDaysNorm];
}

/**
 * 3가지 신호를 결합한 복합 유사도 비교
 *
 * 가중치 (데이터 가용량에 따라 적응):
 *   - 14일+ 곡선: feature=0.30, curve=0.45, keyword=0.25
 *   - 7-13일 곡선: feature=0.40, curve=0.25, keyword=0.35
 *   - 7일 미만:    feature=0.55, curve=0.00, keyword=0.45
 */
export function compositeCompare(params: {
  current: {
    features: ThemeFeatures;
    curve: TimeSeriesPoint[];
    keywords: string[];
    activeDays: number;
    sector: string;
  };
  past: {
    features: ThemeFeatures;
    curve: TimeSeriesPoint[];
    keywords: string[];
    peakDay: number;
    totalDays: number;
    name: string;
    sector: string;
  };
  populationStats?: FeaturePopulationStats;
}): {
  similarity: number;
  currentDay: number;
  pastPeakDay: number;
  pastTotalDays: number;
  estimatedDaysToPeak: number;
  message: string;
  featureSim: number;
  curveSim: number;
  keywordSim: number;
} {
  const { current, past } = params;

  // --- Pillar 1: 특성 벡터 유사도 ---
  const currentVec = featuresToArray(current.features);
  const pastVec = featuresToArray(past.features);
  const featureSim = params.populationStats
    ? zScoreEuclideanSimilarity(currentVec, pastVec, params.populationStats)
    : Math.max(0, cosineSimilarity(currentVec, pastVec));

  // --- Pillar 2: 곡선 상관관계 (위상 정렬 기반) ---
  let curveSim = 0;
  const minCurveLen = Math.min(current.curve.length, past.curve.length);
  if (minCurveLen >= 7) {
    const normCurrent = normalizeValues(current.curve);
    const normPast = normalizeValues(past.curve);
    // 위상 정렬: lifecycle 비율 기반 리샘플링
    const currentResampled = resampleCurve(normCurrent, RESAMPLE_POINTS);
    const pastResampled = resampleCurve(normPast, RESAMPLE_POINTS);
    const rawCorr = pearsonCorrelation(currentResampled, pastResampled);
    curveSim = Math.max(0, rawCorr);
  }

  // --- Pillar 3: 키워드 유사도 ---
  const keywordSim = keywordJaccard(current.keywords, past.keywords);

  // --- 적응적 가중치 ---
  let wFeature: number;
  let wCurve: number;
  let wKeyword: number;

  if (minCurveLen >= 14) {
    wFeature = 0.30;
    wCurve = 0.45;
    wKeyword = 0.25;
  } else if (minCurveLen >= 7) {
    wFeature = 0.40;
    wCurve = 0.25;
    wKeyword = 0.35;
  } else {
    wFeature = 0.55;
    wCurve = 0.00;
    wKeyword = 0.45;
  }

  // 키워드 dead weight 보정: keywordSim이 0이면 가중치를 feature+curve에 재분배
  if (keywordSim === 0 && wKeyword > 0) {
    const ratio = wCurve > 0 ? wFeature / (wFeature + wCurve) : 1;
    wFeature += wKeyword * ratio;
    wCurve += wKeyword * (1 - ratio);
    wKeyword = 0;
  }

  // 섹터 교차 패널티: 다른 섹터끼리 비교 시 30% 감쇄
  const sectorMatch = current.sector === past.sector || current.sector === 'etc' || past.sector === 'etc';
  const sectorFactor = sectorMatch ? 1.0 : 0.7;

  const similarity = (wFeature * featureSim + wCurve * curveSim + wKeyword * keywordSim) * sectorFactor;

  // 클램핑 및 소수점 3자리 반올림
  const finalSim = Math.round(Math.max(0, Math.min(1, similarity)) * 1000) / 1000;

  // Peak/day 계산
  const currentDay = current.activeDays;
  const pastPeakDay = past.peakDay;
  const pastTotalDays = Math.min(past.totalDays, MAX_LIFECYCLE_DAYS);
  const estimatedDaysToPeak = Math.max(0, pastPeakDay - currentDay);

  // 유사 근거 설명 (구체적 특성 기반)
  const simParts: string[] = [];

  // Pillar 2: 곡선 유사도 (가장 강력한 신호)
  if (wCurve > 0 && curveSim >= 0.3) {
    simParts.push(`생명주기 곡선 ${Math.round(curveSim * 100)}% 일치`);
  }

  // Pillar 1: 특성 벡터 — 어떤 특성이 유사한지 구체적으로 명시
  if (featureSim >= 0.3) {
    const cF = current.features;
    const pF = past.features;
    const details: string[] = [];
    if (Math.abs(cF.growthRate - pF.growthRate) < 0.2) details.push('성장 속도');
    if (Math.abs(cF.newsIntensity - pF.newsIntensity) < 0.2) details.push('뉴스 집중도');
    if (Math.abs(cF.volatility - pF.volatility) < 0.2) details.push('변동성');
    if (Math.abs(cF.scoreLevel - pF.scoreLevel) < 0.2) details.push('점수 수준');
    if (details.length > 0) {
      simParts.push(`${details.join('·')} 패턴 유사`);
    } else {
      simParts.push(`종합 특성 유사도 ${Math.round(featureSim * 100)}%`);
    }
  }

  // Pillar 3: 키워드
  if (keywordSim > 0) {
    const commonKws = current.keywords.filter(k =>
      past.keywords.some(pk => pk.toLowerCase() === k.toLowerCase())
    );
    if (commonKws.length > 0) {
      simParts.push(`공통 키워드: ${commonKws.slice(0, 3).join(', ')}`);
    } else {
      simParts.push('관련 키워드 겹침');
    }
  }

  // 섹터 매칭
  if (!sectorMatch) {
    simParts.push(`이종 섹터 (${current.sector}↔${past.sector})`);
  }

  if (simParts.length === 0) {
    simParts.push('복합 지표 기반 약한 유사성');
  }

  // 위치 분석 — 데이터 부족 시 분기 추가
  let positionMsg: string;
  if (pastTotalDays <= 3) {
    // 과거 데이터가 너무 짧으면 주기 비교 무의미
    positionMsg = `과거 테마 데이터 ${pastTotalDays}일분으로 주기 비교 제한적.`;
  } else if (currentDay >= pastTotalDays && pastTotalDays > 0) {
    positionMsg = `과거 ${past.name} 주기(${pastTotalDays}일) 초과, 새로운 전개 국면.`;
  } else if (estimatedDaysToPeak > 0) {
    const progress = pastTotalDays > 0 ? Math.round((currentDay / pastTotalDays) * 100) : 0;
    positionMsg = `과거 기준 피크까지 ~${estimatedDaysToPeak}일 (진행률 ${progress}%).`;
  } else if (pastPeakDay > 0) {
    positionMsg = '피크 구간 진입 추정, 하락 전환 모니터링 필요.';
  } else {
    positionMsg = '초기 단계로 추가 데이터 수집 필요.';
  }

  const message = `${simParts.join(' · ')}. ${positionMsg}`;

  return {
    similarity: finalSim,
    currentDay,
    pastPeakDay,
    pastTotalDays,
    estimatedDaysToPeak,
    message,
    featureSim,
    curveSim,
    keywordSim,
  };
}

