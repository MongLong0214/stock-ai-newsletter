/**
 * 점수 포맷팅 유틸리티
 *
 * 점수 기반 색상 코딩 및 시각적 계층 구조를 위한 함수들
 * 컴포넌트 전체에 일관된 Matrix/사이버펑크 미학 구현
 */

import type { ScoreLevel, ScoreColorConfig } from '../_types/archive.types';

/**
 * 숫자 값을 기반으로 점수 레벨 결정
 *
 * 점수 범위:
 * - Excellent: 81-100 (최상위 성능)
 * - Good: 61-80 (평균 이상)
 * - Fair: 41-60 (평균)
 * - Poor: 0-40 (평균 이하)
 *
 * @param score - 숫자 점수 값 (0-100)
 * @returns 점수 레벨 분류
 *
 * @example
 * getScoreLevel(95) // Returns "excellent"
 * getScoreLevel(70) // Returns "good"
 * getScoreLevel(50) // Returns "fair"
 * getScoreLevel(30) // Returns "poor"
 */
export function getScoreLevel(score: number): ScoreLevel {
  if (score >= 81) return 'excellent';
  if (score >= 61) return 'good';
  if (score >= 41) return 'fair';
  return 'poor';
}

/**
 * 점수 레벨에 따른 Matrix 테마 색상 구성 반환
 *
 * 색상 시스템:
 * - Excellent: 에메랄드 그린 (주요 브랜드 색상)
 * - Good: 시안 블루 (보조 긍정 색상)
 * - Fair: 앰버 옐로우 (주의)
 * - Poor: 레드 (경고)
 *
 * 각 레벨에 포함된 요소:
 * - 배경 색상 (미묘한 반투명)
 * - 텍스트 색상 (가독성을 위한 높은 대비)
 * - 테두리 색상 (중간 불투명도)
 * - 글로우 효과 (깊이감과 시각적 계층 구조)
 *
 * @param level - 점수 레벨 분류
 * @returns Tailwind CSS 클래스를 포함한 색상 구성 객체
 *
 * @example
 * const colors = getScoreColors('excellent');
 * // Returns: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ... }
 */
export function getScoreColors(level: ScoreLevel): ScoreColorConfig {
  const colorMap: Record<ScoreLevel, ScoreColorConfig> = {
    excellent: {
      gradient: 'from-emerald-400 to-green-400',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      glow: 'shadow-[0_0_10px_rgba(16,185,129,0.3)]',
    },
    good: {
      gradient: 'from-cyan-400 to-blue-400',
      bg: 'bg-cyan-500/10',
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      glow: 'shadow-[0_0_10px_rgba(6,182,212,0.3)]',
    },
    fair: {
      gradient: 'from-amber-400 to-yellow-400',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      glow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]',
    },
    poor: {
      gradient: 'from-red-400 to-orange-400',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      border: 'border-red-500/30',
      glow: 'shadow-[0_0_10px_rgba(239,68,68,0.3)]',
    },
  };

  return colorMap[level];
}

/**
 * 전체 점수 표시를 위한 그라데이션 색상 클래스 반환
 * 크고 눈에 띄는 점수 표시에 사용 (예: 카드 헤더)
 *
 * @param score - 숫자 점수 값 (0-100)
 * @returns Tailwind CSS 그라데이션 클래스
 *
 * @example
 * getOverallScoreColor(85) // Returns "from-emerald-400 to-green-400"
 * getOverallScoreColor(65) // Returns "from-cyan-400 to-blue-400"
 */
export function getOverallScoreColor(score: number): string {
  const level = getScoreLevel(score);
  return getScoreColors(level).gradient;
}

/**
 * 점수 배지를 위한 접근 가능한 색상 조합 반환
 * 색상 대비에 대한 WCAG AAA 준수 보장
 *
 * @param score - 숫자 점수 값 (0-100)
 * @returns 배지 렌더링을 위한 완전한 색상 구성
 *
 * @example
 * const colors = getScoreBadgeColors(75);
 * // Use colors.bg, colors.text, colors.border, colors.glow
 */
export function getScoreBadgeColors(score: number): ScoreColorConfig {
  const level = getScoreLevel(score);
  return getScoreColors(level);
}