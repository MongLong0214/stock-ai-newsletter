'use client';

import Link from "next/link";
import { trackEvent } from "@/lib/analytics/ga";

interface CTAButtonProps {
  formatted: string;
  ariaLabel?: string;
  className?: string;
  location?: string;
}

function CTAButton({
  formatted,
  ariaLabel = "무료 메일 받기",
  className = "",
  location = "unknown",
}: CTAButtonProps) {
  return (
    <Link
      href="/subscribe"
      aria-label={ariaLabel}
      className="inline-block"
      onClick={() => {
        trackEvent('subscribe_cta_click', {
          cta_location: location,
          destination_path: '/subscribe',
          content_type: 'homepage',
          cta_variant: 'home_primary',
        });
      }}
    >
      {/* 단색 버튼 + hover는 밝기·그림자만 (scale·glow·흐르는 그라데이션 금지 — 디자인 원칙) */}
      <span
        className={`block bg-emerald-600 hover:bg-emerald-500 text-slate-50 text-base font-medium px-8 py-3.5 rounded-xl shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-black/40 transition-[background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 tracking-wide cursor-pointer ${className}`}
      >
        {formatted ? `${formatted} 후 메일 받기` : '무료 메일 받기'}
      </span>
    </Link>
  );
}

export default CTAButton;