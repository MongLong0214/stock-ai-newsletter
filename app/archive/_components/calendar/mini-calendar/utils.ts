/**
 * 미니 캘린더 유틸리티 함수
 */

import { getDaysInMonth, getFirstDayOfMonth } from '../../../_utils/formatting/date';

/**
 * 캘린더 그리드 배열 생성
 *
 * 첫 주의 빈 셀을 null로 채우고, 월의 모든 날짜를 포함하는 배열 반환
 *
 * @example
 * // 2025년 1월 1일이 수요일인 경우
 * [null, null, null, 1, 2, 3, 4, 5, ...]
 */
export function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const grid: (number | null)[] = [];

  // 첫날 이전 빈 셀 추가 (일요일=0부터 첫날 요일 전까지)
  for (let i = 0; i < firstDay; i++) {
    grid.push(null);
  }

  // 월의 모든 날짜 추가 (1일부터 마지막 날까지)
  for (let day = 1; day <= daysInMonth; day++) {
    grid.push(day);
  }

  return grid;
}

/** 날짜 셀 기본 스타일 */
const BASE_CELL_CLASSES = [
  'relative aspect-square rounded-lg min-h-[36px]',
  'text-xs font-mono tabular-nums',
  'transition-all duration-200',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
  'focus-visible:ring-offset-slate-900',
].join(' ');

/** 날짜 셀 상태별 스타일 */
const CELL_STATE_CLASSES = {
  selected:
    'bg-emerald-500/20 text-white border-2 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]',
  hasData:
    'bg-emerald-500/5 text-slate-300 border border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40',
  disabled: 'bg-transparent text-slate-600 border border-transparent cursor-not-allowed',
} as const;

/**
 * 날짜 셀 스타일 클래스 계산
 */
export function getDateCellClassName(isSelected: boolean, hasData: boolean): string {
  const state = isSelected ? 'selected' : hasData ? 'hasData' : 'disabled';
  return `${BASE_CELL_CLASSES} ${CELL_STATE_CLASSES[state]}`;
}

/**
 * 요일 헤더 텍스트 색상 클래스 반환
 *
 * 일요일=빨강, 토요일=청록, 평일=회색
 */
export function getDayNameColorClass(dayIndex: number): string {
  if (dayIndex === 0) return 'text-red-400';
  if (dayIndex === 6) return 'text-cyan-400';
  return 'text-slate-400';
}