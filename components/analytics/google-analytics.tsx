'use client';

import { Suspense } from 'react';
import Script from 'next/script';
import GA4RouteTracker from '@/components/analytics/ga4-route-tracker';
import { GA_MEASUREMENT_ID } from '@/lib/analytics/ga';

export default function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', {
            send_page_view: false,
            debug_mode: ${process.env.NODE_ENV !== 'production'}
          });
        `}
      </Script>
      <Suspense fallback={null}>
        <GA4RouteTracker />
      </Suspense>
    </>
  );
}
