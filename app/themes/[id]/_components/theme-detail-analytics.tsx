'use client';

import { useEffect, useRef } from 'react';
import { buildThemeItem, trackEvent } from '@/lib/analytics/ga';

interface ThemeDetailAnalyticsProps {
  themeId: string;
  themeName: string;
  themeStage: string | null;
  themeScore: number | null;
}

export default function ThemeDetailAnalytics({
  themeId,
  themeName,
  themeStage,
  themeScore,
}: ThemeDetailAnalyticsProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current) return;

    trackedRef.current = true;

    const item = buildThemeItem({
      id: themeId,
      name: themeName,
      stage: themeStage,
      listId: 'theme_detail',
      listName: 'Theme detail',
    });

    trackEvent('view_item', {
      item_list_id: 'theme_detail',
      item_list_name: 'Theme detail',
      items: [item],
    });

    trackEvent('view_theme_detail', {
      theme_id: themeId,
      theme_name: themeName,
      theme_stage: themeStage ?? 'unknown',
      theme_score: themeScore ?? undefined,
      content_type: 'theme_detail',
    });
  }, [themeId, themeName, themeScore, themeStage]);

  return null;
}
