'use client';

import { useMemo } from 'react';
import type { CalendarDate, CalendarMonth } from '@/types/newsletter';

/**
 * Hook to calculate calendar dates for a given year and month
 *
 * @param year - Year number
 * @param month - Month number (0-11)
 * @param selectedDate - Currently selected date string (YYYY-MM-DD)
 * @param availableDates - Array of dates with newsletter data
 * @returns Calendar month data with date grid
 */
export function useCalendarDates(
  year: number,
  month: number,
  selectedDate: string | null,
  availableDates: string[]
): CalendarMonth {
  return useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dates: CalendarDate[] = [];

    // Add padding days from previous month
    const prevMonthLastDay = new Date(year, month, 0);
    const prevMonthDays = prevMonthLastDay.getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthDays - i;
      const date = new Date(year, month - 1, day);
      const dateString = formatDateString(date);

      dates.push({
        date,
        dateString,
        hasData: availableDates.includes(dateString),
        isToday: false,
        isSelected: false,
      });
    }

    // Add current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateString = formatDateString(date);
      const isToday = date.getTime() === today.getTime();
      const isSelected = dateString === selectedDate;

      dates.push({
        date,
        dateString,
        hasData: availableDates.includes(dateString),
        isToday,
        isSelected,
      });
    }

    // Add padding days from next month
    const remainingDays = 42 - dates.length; // 6 weeks * 7 days
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      const dateString = formatDateString(date);

      dates.push({
        date,
        dateString,
        hasData: availableDates.includes(dateString),
        isToday: false,
        isSelected: false,
      });
    }

    return {
      year,
      month,
      dates,
      daysInMonth,
      firstDayOfWeek,
    };
  }, [year, month, selectedDate, availableDates]);
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getTodayString(): string {
  return formatDateString(new Date());
}

/**
 * Parse date string to Date object
 */
export function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get month name in Korean
 */
export function getMonthName(month: number): string {
  const months = [
    '1월',
    '2월',
    '3월',
    '4월',
    '5월',
    '6월',
    '7월',
    '8월',
    '9월',
    '10월',
    '11월',
    '12월',
  ];
  return months[month];
}

/**
 * Get day of week name in Korean (short form)
 */
export function getDayName(day: number): string {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[day];
}