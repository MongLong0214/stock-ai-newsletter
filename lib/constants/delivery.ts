/**
 * 뉴스레터 발송 시간 (Single Source of Truth)
 *
 * GitHub Actions cron은 별도 수정 필요:
 * daily-newsletter.yml → cron: '25 22 * * 0-4' (KST 07:25)
 */
const HOUR = 7;
const MINUTE = 30;

export const DELIVERY_TIME_DISPLAY = `오전 ${HOUR}시 ${MINUTE}분`;
export const DELIVERY_TIME_SHORT = `${HOUR}:${MINUTE}`;

/** 카운트다운 대상 시각 (발송 + 1시간 버퍼) */
export const COUNTDOWN_HOUR = HOUR + 1;
export const COUNTDOWN_MINUTE = MINUTE;