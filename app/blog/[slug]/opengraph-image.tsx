import { getServerSupabaseClient } from '@/lib/supabase/server-client';
import { isValidBlogSlug } from '../_utils/slug-validator';
import { createOgLayout } from '@/lib/og-template';
import { createOgImageResponse } from '@/lib/og-image-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const alt = 'Stock Matrix 블로그';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

type BlogOgTypography = {
  titleLines: string[];
  titleSize: number;
  titleLineHeight: number;
  titleMaxWidth: number;
  subtitleMaxWidth: number;
  descriptionLimit: number;
};

function normalizeTitle(rawTitle: string): string {
  return rawTitle.replace(/\.$/, '').replace(/\s+/g, ' ').trim();
}

function getDesiredLineCount(title: string): number {
  if (title.length > 40) return 4;
  if (title.length > 28) return 3;
  if (title.length > 16) return 2;
  return 1;
}

function balanceTitleLines(title: string, lineCount: number): string[] {
  const commaIndex = title.indexOf(', ');
  if (lineCount >= 3 && commaIndex !== -1) {
    const firstClause = title.slice(0, commaIndex + 1).trim();
    const remaining = title.slice(commaIndex + 2).trim();

    if (firstClause.length >= 10 && firstClause.length <= 26 && remaining.length > 0) {
      return [firstClause, ...balanceTitleLines(remaining, lineCount - 1)];
    }
  }

  const words = title.split(' ').filter(Boolean);

  if (lineCount <= 1 || words.length <= lineCount) {
    return [title];
  }

  const prefixLengths = [0];
  for (const word of words) {
    prefixLengths.push(prefixLengths[prefixLengths.length - 1] + word.length);
  }

  const totalLength = prefixLengths[prefixLengths.length - 1] + Math.max(0, words.length - 1);
  const targetLength = totalLength / lineCount;
  const memo = new Map<string, { score: number; breaks: number[] }>();

  function segmentLength(start: number, end: number): number {
    return prefixLengths[end] - prefixLengths[start] + Math.max(0, end - start - 1);
  }

  function solve(start: number, linesLeft: number): { score: number; breaks: number[] } {
    const key = `${start}:${linesLeft}`;
    const cached = memo.get(key);
    if (cached) return cached;

    if (linesLeft === 1) {
      const result = {
        score: Math.pow(segmentLength(start, words.length) - targetLength, 2),
        breaks: [words.length],
      };
      memo.set(key, result);
      return result;
    }

    let best = { score: Number.POSITIVE_INFINITY, breaks: [words.length] };
    const maxEnd = words.length - linesLeft + 1;

    for (let end = start + 1; end <= maxEnd; end += 1) {
      const currentLength = segmentLength(start, end);
      const penalty =
        Math.pow(currentLength - targetLength, 2) +
        Math.max(0, end - start - 6) * 40;
      const next = solve(end, linesLeft - 1);
      const score = penalty + next.score;

      if (score < best.score) {
        best = { score, breaks: [end, ...next.breaks] };
      }
    }

    memo.set(key, best);
    return best;
  }

  const breaks = solve(0, lineCount).breaks;
  const lines: string[] = [];
  let start = 0;

  for (const end of breaks) {
    lines.push(words.slice(start, end).join(' '));
    start = end;
  }

  return lines;
}

function getBlogOgTypography(rawTitle: string): BlogOgTypography {
  const normalizedTitle = normalizeTitle(rawTitle);
  const desiredLineCount = getDesiredLineCount(normalizedTitle);
  const balancedTitleLines = balanceTitleLines(normalizedTitle, desiredLineCount);

  if (desiredLineCount >= 4) {
    return {
      titleLines: balancedTitleLines,
      titleSize: 40,
      titleLineHeight: 1.14,
      titleMaxWidth: 700,
      subtitleMaxWidth: 620,
      descriptionLimit: 72,
    };
  }

  if (desiredLineCount === 3) {
    return {
      titleLines: balancedTitleLines,
      titleSize: 48,
      titleLineHeight: 1.12,
      titleMaxWidth: 700,
      subtitleMaxWidth: 620,
      descriptionLimit: 86,
    };
  }

  if (desiredLineCount === 2) {
    return {
      titleLines: balancedTitleLines,
      titleSize: 60,
      titleLineHeight: 1.12,
      titleMaxWidth: 740,
      subtitleMaxWidth: 620,
      descriptionLimit: 96,
    };
  }

  return {
    titleLines: [normalizedTitle],
    titleSize: 76,
    titleLineHeight: 1.14,
    titleMaxWidth: 700,
    subtitleMaxWidth: 560,
    descriptionLimit: 100,
  };
}

async function getBlogPost(slug: string) {
  const supabase = getServerSupabaseClient();
  const { data } = await supabase
    .from('blog_posts')
    .select('title, description, category, published_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();
  return data;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidBlogSlug(slug)) {
    return new Response('Not found', { status: 404 });
  }
  const post = await getBlogPost(slug);

  if (!post) {
    return new Response('Not found', { status: 404 });
  }

  const typography = getBlogOgTypography(post.title);
  const description =
    post.description.length > typography.descriptionLimit
      ? `${post.description.slice(0, typography.descriptionLimit - 3)}...`
      : post.description;

  return createOgImageResponse(
    createOgLayout({
      title: (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {typography.titleLines.map((line, index) => (
            <div key={`${index}-${line}`} style={{ display: 'flex' }}>
              {line}
            </div>
          ))}
        </div>
      ),
      subtitle: description,
      titleSize: typography.titleSize,
      titleLineHeight: typography.titleLineHeight,
      titleMaxWidth: typography.titleMaxWidth,
      subtitleMaxWidth: typography.subtitleMaxWidth,
    }),
    size
  );
}
