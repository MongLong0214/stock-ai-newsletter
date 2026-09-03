export const NEWSLETTER_DELIVERY_STATUSES = [
  'pending',
  'sending',
  'accepted',
  'failed_retryable',
  'failed_terminal',
  'unknown',
] as const

export type NewsletterDeliveryStatus = typeof NEWSLETTER_DELIVERY_STATUSES[number]

export interface NewsletterDeliveryCounts {
  readonly pending: number
  readonly sending: number
  readonly accepted: number
  readonly failedRetryable: number
  readonly failedTerminal: number
  readonly unknown: number
}

export function emptyNewsletterDeliveryCounts(): NewsletterDeliveryCounts {
  return {
    pending: 0,
    sending: 0,
    accepted: 0,
    failedRetryable: 0,
    failedTerminal: 0,
    unknown: 0,
  }
}

export function countNewsletterDeliveryStatuses(
  rows: readonly { readonly status: NewsletterDeliveryStatus }[],
): NewsletterDeliveryCounts {
  const counts = emptyNewsletterDeliveryCounts()
  const mutableCounts = { ...counts }
  for (const row of rows) {
    switch (row.status) {
      case 'pending': mutableCounts.pending += 1; break
      case 'sending': mutableCounts.sending += 1; break
      case 'accepted': mutableCounts.accepted += 1; break
      case 'failed_retryable': mutableCounts.failedRetryable += 1; break
      case 'failed_terminal': mutableCounts.failedTerminal += 1; break
      case 'unknown': mutableCounts.unknown += 1; break
    }
  }
  return mutableCounts
}
