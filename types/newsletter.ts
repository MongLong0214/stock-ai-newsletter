import { StockData } from '@/lib/llm/_types/stock-data';

/**
 * Newsletter content from Supabase database
 *
 * @property id - UUID
 * @property created_at - Creation timestamp
 * @property newsletter_date - Date in YYYY-MM-DD format
 * @property gemini_analysis - JSON string containing StockData array
 * @property is_sent - Whether newsletter has been sent
 * @property sent_at - Timestamp when sent
 * @property subscriber_count - Number of recipients
 */
export interface NewsletterContent {
  id: string;
  created_at: string;
  newsletter_date: string;
  gemini_analysis: string;
  is_sent: boolean;
  sent_at: string | null;
  subscriber_count: number;
}

/**
 * Parsed newsletter with stock data
 *
 * @property date - Newsletter date string (YYYY-MM-DD)
 * @property stocks - Array of 1-3 stock recommendations
 * @property sentAt - When newsletter was sent
 * @property subscriberCount - Number of recipients
 */
export interface Newsletter {
  date: string;
  stocks: StockData[];
  sentAt: string | null;
  subscriberCount: number;
}

/**
 * Calendar date with data availability flag
 *
 * @property date - Date object
 * @property dateString - YYYY-MM-DD format
 * @property hasData - Whether newsletter exists for this date
 * @property isToday - Whether this is today
 * @property isSelected - Whether this date is selected
 */
export interface CalendarDate {
  date: Date;
  dateString: string;
  hasData: boolean;
  isToday: boolean;
  isSelected: boolean;
}

/**
 * Calendar month data
 *
 * @property year - Year number
 * @property month - Month number (0-11)
 * @property dates - Array of dates in the month grid (including padding)
 * @property daysInMonth - Number of days in the month
 * @property firstDayOfWeek - Day of week for month's first day (0-6)
 */
export interface CalendarMonth {
  year: number;
  month: number;
  dates: CalendarDate[];
  daysInMonth: number;
  firstDayOfWeek: number;
}

/**
 * Score color configuration
 *
 * @property gradient - Tailwind gradient class
 * @property text - Tailwind text color class
 * @property badge - Badge background class
 */
export interface ScoreColor {
  gradient: string;
  text: string;
  badge: string;
}