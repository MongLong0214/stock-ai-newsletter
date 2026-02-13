/** 키워드 유사도 검사 (Jaccard + 핵심 주제어 오버랩) */

import { CORE_TOPIC_WORDS, STOP_WORDS } from '../_config/keyword-dictionaries';

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

/** Jaccard 유사도 + 핵심 주제어 오버랩 기반 유사도 검사 */
export function isSimilar(newText: string, existingTexts: string[], threshold: number = 0.5): boolean {
  const newTopics = extractCoreTopics(newText);
  if (newTopics.size === 0) return false;

  for (const existing of existingTexts) {
    const existingTopics = extractCoreTopics(existing);
    if (existingTopics.size === 0) continue;

    const intersection = new Set([...newTopics].filter((w) => existingTopics.has(w)));
    const union = new Set([...newTopics, ...existingTopics]);
    const jaccardSimilarity = intersection.size / union.size;

    // 핵심 주제어 2개 이상 겹치면 중복으로 판정
    const coreOverlap = [...intersection].filter((w) => CORE_TOPIC_WORDS.has(w));

    if (jaccardSimilarity >= threshold || coreOverlap.length >= 2) {
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
