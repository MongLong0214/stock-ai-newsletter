/** 키워드 유사도 검사 (Jaccard + 포함도 + 핵심 주제어 오버랩) */

import { CORE_TOPIC_WORDS, MODIFIER_WORDS, STOP_WORDS } from '../_config/keyword-dictionaries';

/** 텍스트에서 핵심 주제어 추출 (불용어 제외, 부분 매칭 포함) */
export function extractCoreTopics(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^가-힣a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);

  const topics = new Set<string>();

  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;

    if (CORE_TOPIC_WORDS.has(word)) {
      topics.add(word);
      continue;
    }

    // 부분 매칭 (예: "볼린저" -> "볼린저밴드"), 짧은 단어 역매칭 방지
    for (const coreTopic of CORE_TOPIC_WORDS) {
      if (word.includes(coreTopic) || (word.length >= 3 && coreTopic.includes(word))) {
        topics.add(coreTopic);
      }
    }

    if (word.length >= 2) {
      topics.add(word);
    }
  }

  return topics;
}

/** 퍼지 교집합: 정확 일치 + 한국어 형태소 부분 매칭 (3자 이상) */
function computeFuzzyIntersection(setA: Set<string>, setB: Set<string>): Set<string> {
  const result = new Set<string>();

  for (const a of setA) {
    if (setB.has(a)) {
      result.add(a);
      continue;
    }

    // 부분 문자열 매칭 (한국어 조사/어미 변형 대응: "매매법" ⊂ "매매법으로")
    for (const b of setB) {
      if (a.length >= 3 && b.includes(a)) {
        result.add(a);
        break;
      }
      if (b.length >= 3 && a.includes(b)) {
        result.add(b);
        break;
      }
    }
  }

  return result;
}

/** 3겹 방어 유사도 검사: Jaccard + 포함도(containment) + 핵심 주제어 오버랩 */
export function isSimilar(newText: string, existingTexts: string[], threshold: number = 0.5): boolean {
  const newTopics = extractCoreTopics(newText);
  if (newTopics.size === 0) return false;

  for (const existing of existingTexts) {
    const existingTopics = extractCoreTopics(existing);
    if (existingTopics.size === 0) continue;

    const intersection = computeFuzzyIntersection(newTopics, existingTopics);
    if (intersection.size === 0) continue;

    // [안전장치] 수식어만 겹치면 다른 주제 (예: "반도체 관련주 전망" vs "2차전지 관련주 전망")
    const substantiveOverlap = [...intersection].filter((w) => !MODIFIER_WORDS.has(w));
    if (substantiveOverlap.length === 0) continue;

    const union = new Set([...newTopics, ...existingTopics]);
    const jaccardSimilarity = intersection.size / union.size;

    // [방어 1] Jaccard — 작은 집합(< 5단어)에서는 우연 일치 방지를 위해 더 엄격
    const adjustedThreshold = union.size < 5 ? Math.max(threshold, 0.6) : threshold;

    // [방어 2] 포함도 — 키워드 주제어의 50%+ 가 기존 텍스트에 존재하면 중복
    const containment = intersection.size / newTopics.size;
    const minIntersection = Math.max(2, Math.ceil(newTopics.size * 0.5));

    // [방어 3] 핵심 주제어(지표/전략/시장 용어) 중 수식어 아닌 것 2개+ 겹침
    const coreOverlap = [...intersection].filter((w) => CORE_TOPIC_WORDS.has(w) && !MODIFIER_WORDS.has(w));

    // [안전장치 2] 양쪽에 겹치지 않는 고유 실체어가 있으면 → 구조만 같고 주제 다름
    // 예: "삼성전자 PER 분석" vs "네이버 PER 분석" (PER은 겹치지만 종목이 다름)
    const newOnlyEntities = [...newTopics].filter((w) => !intersection.has(w) && !MODIFIER_WORDS.has(w));
    const existOnlyEntities = [...existingTopics].filter((w) => !intersection.has(w) && !MODIFIER_WORDS.has(w));

    if (newOnlyEntities.length > 0 && existOnlyEntities.length > 0) {
      // 구조만 같고 주제 다름 → 핵심 주제어 2개+ 겹침만 허용
      if (coreOverlap.length >= 2) return true;
      continue;
    }

    // [방어 4] 실체어 완전 포함 — 2+ 단어 키워드의 모든 비수식어가 기존 텍스트에 존재하면 중복
    // 예: "RSI 활용법"(비수식어=rsi) vs "RSI 매매 전략 가이드" → rsi 완전 커버 → 중복
    const newNonModifiers = [...newTopics].filter((w) => !MODIFIER_WORDS.has(w));
    const allSubstanceCovered = newTopics.size >= 2
      && newNonModifiers.length > 0
      && newNonModifiers.every((w) => intersection.has(w));

    if (
      jaccardSimilarity >= adjustedThreshold ||
      (intersection.size >= minIntersection && containment >= 0.5) ||
      coreOverlap.length >= 2 ||
      allSubstanceCovered
    ) {
      return true;
    }
  }

  return false;
}

/** 키워드 중복 검사 (완전 일치 + 유사도 + 기존 제목 비교) */
export function isDuplicate(
  newKeyword: string,
  existingKeywords: string[],
  existingTitles: string[] = []
): boolean {
  const normalized = newKeyword.toLowerCase().trim();

  if (existingKeywords.includes(normalized)) return true;
  if (isSimilar(newKeyword, existingKeywords, 0.5)) return true;
  if (existingTitles.length > 0 && isSimilar(newKeyword, existingTitles, 0.4)) return true;

  return false;
}
