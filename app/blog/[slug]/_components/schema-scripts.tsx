/**
 * Schema.org 구조화 데이터 스크립트
 * - SEO 최적화를 위한 JSON-LD 메타데이터
 */

import Script from 'next/script';

interface SchemaScriptsProps {
  /** Schema.org 데이터 배열 */
  schemas: Array<{ id: string; data: object }>;
}

export function SchemaScripts({ schemas }: SchemaScriptsProps) {
  return (
    <>
      {schemas.map(({ id, data }) => (
        <Script
          key={id}
          id={id}
          type="application/ld+json"
          strategy="afterInteractive"
        >
          {JSON.stringify(data)}
        </Script>
      ))}
    </>
  );
}