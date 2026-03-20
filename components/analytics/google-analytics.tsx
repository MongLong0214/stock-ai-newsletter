'use client';

import { Suspense } from 'react';
import GA4RouteTracker from '@/components/analytics/ga4-route-tracker';
import { GA_MEASUREMENT_ID } from '@/lib/analytics/ga';

export default function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <Suspense fallback={null}>
      <GA4RouteTracker />
    </Suspense>
  );
}