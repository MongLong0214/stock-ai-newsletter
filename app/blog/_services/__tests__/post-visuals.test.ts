import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketContext, StockSnapshot } from '../market-data';

const { mockGenerateImage, mockGenerateText, mockPlan, mockQa, mockUpload, mockRemove, mockPriceChart, mockComparisonChart } = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(), mockGenerateText: vi.fn(), mockPlan: vi.fn(), mockQa: vi.fn(), mockUpload: vi.fn(), mockRemove: vi.fn(),
  mockPriceChart: vi.fn(), mockComparisonChart: vi.fn(),
}));

vi.mock('@/lib/llm/openai-client', () => ({ generateImage: mockGenerateImage, generateText: mockGenerateText }));
vi.mock('../image-storage', () => ({ uploadBlogImage: mockUpload, removeBlogImages: mockRemove }));
vi.mock('../chart-renderer', () => ({ renderPriceChart: mockPriceChart, renderComparisonChart: mockComparisonChart }));

import { VISUAL_CONFIG } from '../../_config/pipeline-config';
import { createPostVisuals, parseImageQa, parseVisualPlan, shouldTryNextModel } from '../post-visuals';

const SCENE = 'A quiet battery materials laboratory with glass beakers, a precision scale and soft morning light across a clean bench.';
const HEADINGS = ['LG화학 사업 구조', '실적 흐름 읽는 법', '자주 묻는 질문'];
const MARKDOWN = [
  '# LG화학 실적 분석',
  '',
  '도입 문단.',
  '',
  ...HEADINGS.flatMap((h) => [`## ${h}`, '', `${h} 본문 문단.`, '']),
].join('\n');

const plan = (sections: Array<{ heading: string }>) => JSON.stringify({
  cover: { scene: SCENE, alt: '배터리 소재 연구실의 실험대를 담은 LG화학 실적 분석 커버 이미지', caption: '배터리 소재 연구 현장을 표현한 이미지' },
  sections: sections.map((s) => ({ ...s, scene: SCENE, alt: '실험대 위에 놓인 유리 비커와 정밀 저울', caption: '소재 연구 과정을 표현한 이미지' })),
});

function snapshot(): StockSnapshot {
  const series = Array.from({ length: 80 }, (_, i) => ({ date: `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`, close: 100 + i, volume: 1 }));
  return {
    code: '051910', name: 'LG화학', market: 'KOSPI', series, asOf: series.at(-1)!.date, close: 179,
    returns: { m1: 5, m3: 20, y1: null }, high: series.at(-1)!, low: series[0], fromHighPct: 0, fullYear: false,
  };
}
const MARKET: MarketContext = { stocks: [snapshot()], theme: { id: 't1', name: '2차전지' }, direct: true, asOf: '2026-03-24' };

/** 비전 검수 응답 — 기본은 전부 통과 */
const qa = (flags: Record<string, boolean> = {}, note = '') => JSON.stringify({
  text: false, logo: false, face: false, screen: false, chart: false, artifact: false, alt_mismatch: false, off_topic: false, ...flags, note,
});

const input = (market: MarketContext | null = MARKET) => ({ slug: 'lg-chem-2026-11-10-abc', keyword: 'LG화학 실적 분석', title: 'LG화학 실적 분석', markdown: MARKDOWN, market });

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of ['log', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation(() => {});
  // 이미지가 붙은 호출은 검수, 아니면 기획
  mockGenerateText.mockImplementation((options: { image?: unknown }) => (options.image ? mockQa(options) : mockPlan(options)));
  mockPlan.mockResolvedValue(plan([{ heading: HEADINGS[0] }, { heading: HEADINGS[1] }]));
  mockQa.mockResolvedValue(qa());
  mockGenerateImage.mockResolvedValue(Buffer.from('webp'));
  mockPriceChart.mockResolvedValue(Buffer.from('png'));
  mockComparisonChart.mockResolvedValue(Buffer.from('png'));
  mockUpload.mockImplementation(async (path: string) => `https://x.supabase.co/storage/v1/object/public/blog-images/${path}`);
  mockRemove.mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('parseVisualPlan', () => {
  it('keeps the cover and sections whose heading matches the body exactly', () => {
    const raw = '```json\n' + plan([{ heading: HEADINGS[1] }, { heading: '없는 섹션' }, { heading: HEADINGS[1] }]) + '\n```';
    const parsed = parseVisualPlan(raw, HEADINGS, 3);
    expect(parsed.map((p) => p.heading)).toEqual([null, HEADINGS[1]]);
  });

  it('skips the data section, enforces the cap and drops thin entries', () => {
    const headings = ['데이터로 보는 LG화학 주가 흐름', ...HEADINGS];
    const raw = JSON.stringify({
      cover: { scene: 'too short', alt: 'x', caption: 'y' },
      sections: [
        { heading: headings[0], scene: SCENE, alt: '충분히 긴 대체텍스트입니다', caption: '캡션입니다' },
        ...HEADINGS.map((heading) => ({ heading, scene: SCENE, alt: '충분히 긴 대체텍스트입니다', caption: '캡션입니다' })),
      ],
    });
    expect(parseVisualPlan(raw, headings, 2).map((p) => p.heading)).toEqual([HEADINGS[0], HEADINGS[1]]);
  });

  it('throws on output without JSON', () => {
    expect(() => parseVisualPlan('no json here', HEADINGS, 3)).toThrow();
  });
});

describe('createPostVisuals', () => {
  it('adds a cover, planned section images and the measured data section', async () => {
    const result = await createPostVisuals(input());
    const lines = result.markdown.split('\n');

    expect(result.summary).toEqual({ chart: true, cover: true, sections: 2 });
    expect(lines[0]).toBe('# LG화학 실적 분석');
    expect(lines[2]).toMatch(/^!\[.+\]\(https:\/\/.+-cover-1536x1024\.webp ".+ · AI 생성 이미지"\)$/);
    expect(result.markdown).toMatch(/-section\d-1536x1024\.webp/);
    expect(result.markdown).toContain('## 데이터로 보는 LG화학 주가 흐름');
    expect(result.markdown).toMatch(/-chart-1600x900\.png "LG화학 주가 흐름 · 출처 한국투자증권 Open API, 기준일 2026-03-24"\)/);
    // 데이터 섹션은 첫 섹션 뒤, 두 번째 섹션 앞
    expect(result.markdown.indexOf('## 데이터로 보는')).toBeGreaterThan(result.markdown.indexOf(`## ${HEADINGS[0]}`));
    expect(result.markdown.indexOf('## 데이터로 보는')).toBeLessThan(result.markdown.indexOf(`## ${HEADINGS[1]}`));
    expect(result.uploadedPaths).toHaveLength(4);
    for (const path of result.uploadedPaths) {
      expect(path.startsWith('posts/lg-chem-2026-11-10-abc/')).toBe(true);
      expect(result.markdown).toContain(path);
    }
    expect(mockRemove).toHaveBeenCalledWith([]);
    expect(mockGenerateImage.mock.calls[0][0]).toMatchObject({ model: VISUAL_CONFIG.imageModels[0], size: '1536x1024' });
    expect(mockGenerateImage.mock.calls[0][0].prompt).toContain('Strictly forbidden');
  });

  it('publishes no AI image when planning fails — no generic off-topic cover', async () => {
    mockPlan.mockRejectedValue(new Error('plan timeout'));
    const result = await createPostVisuals(input(null));
    expect(result.summary).toEqual({ chart: false, cover: false, sections: 0 });
    expect(result.markdown).not.toContain('![');
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  it('keeps section images without inventing a cover when the plan has none', async () => {
    mockPlan.mockResolvedValue(JSON.stringify(JSON.parse(plan([{ heading: HEADINGS[0] }]), (k, v) => (k === 'cover' ? undefined : v))));
    const result = await createPostVisuals(input(null));
    expect(result.summary).toEqual({ chart: false, cover: false, sections: 1 });
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
  });

  it('asks the planner for the literal subject, not symbolic still lifes', async () => {
    await createPostVisuals(input(null));
    const prompt = mockPlan.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('3초 안에');
    expect(prompt).toContain('나무 블록·구슬');
    expect(mockPlan.mock.calls[0][0].config).toMatchObject({ reasoningEffort: 'medium' });
    expect(mockGenerateImage.mock.calls[0][0].prompt).toContain('not a conceptual still life');
  });

  it('moves to the next model only for access or service errors', () => {
    const e = (status: number, message = 'x') => Object.assign(new Error(message), { status });
    expect(shouldTryNextModel(e(404, 'model not found'))).toBe(true);
    expect(shouldTryNextModel(e(403))).toBe(true);
    expect(shouldTryNextModel(e(429))).toBe(true);
    expect(shouldTryNextModel(e(503))).toBe(true);
    expect(shouldTryNextModel(e(400, 'rejected by moderation'))).toBe(false);
    // 타임아웃: 취소된 요청도 과금될 수 있다 — 같은 장면을 다른 모델로 다시 부르지 않는다
    expect(shouldTryNextModel(new Error('Timeout after 150000ms'))).toBe(false);
  });

  it('tries the next image model on a service error but not on a policy rejection', async () => {
    mockPlan.mockResolvedValue(plan([]));
    mockGenerateImage.mockRejectedValueOnce(Object.assign(new Error('server error'), { status: 500 }));
    expect((await createPostVisuals(input(null))).summary.cover).toBe(true);
    expect(mockGenerateImage.mock.calls.map((c) => c[0].model)).toEqual(VISUAL_CONFIG.imageModels.slice(0, 2));

    mockGenerateImage.mockReset().mockRejectedValue(Object.assign(new Error('rejected by moderation'), { status: 400 }));
    expect((await createPostVisuals(input(null))).summary.cover).toBe(false);
    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
  });

  it('keeps the data table when the chart fails and the text when every image fails', async () => {
    mockPriceChart.mockRejectedValue(new Error('font missing'));
    mockGenerateImage.mockRejectedValue(Object.assign(new Error('down'), { status: 503 }));
    const result = await createPostVisuals(input());
    expect(result.summary).toEqual({ chart: false, cover: false, sections: 0 });
    expect(result.markdown).toContain('| LG화학 |');
    expect(result.markdown).not.toContain('![');
    expect(result.uploadedPaths).toEqual([]);
  });

  it('drops only the image whose upload failed', async () => {
    mockPlan.mockResolvedValue(plan([{ heading: HEADINGS[0] }]));
    mockUpload.mockImplementation(async (path: string) => {
      if (path.includes('-section')) throw new Error('storage down');
      return `https://x.supabase.co/storage/v1/object/public/blog-images/${path}`;
    });
    const partial = await createPostVisuals(input(null));
    expect(partial.summary).toEqual({ chart: false, cover: true, sections: 0 });
    expect(partial.uploadedPaths).toHaveLength(1);
  });

  it('publishes what finished by the deadline and deletes uploads that land afterwards', async () => {
    vi.useFakeTimers();
    mockPlan.mockResolvedValue(plan([{ heading: HEADINGS[0] }]));
    let finishSlow: () => void = () => {};
    mockUpload.mockImplementation(async (path: string) => {
      if (path.includes('-section')) await new Promise<void>((r) => { finishSlow = r; });
      return `https://x.supabase.co/storage/v1/object/public/blog-images/${path}`;
    });

    const pending = createPostVisuals({ ...input(), budgetMs: 60_000 });
    await vi.advanceTimersByTimeAsync(60_000 + 20_000);
    const result = await pending;
    expect(result.summary).toEqual({ chart: true, cover: true, sections: 0 });
    expect(result.uploadedPaths).toHaveLength(2);

    // 마감 뒤에 끝난 섹션 업로드는 실리지 않고 스스로 지워진다
    finishSlow();
    await vi.advanceTimersByTimeAsync(0);
    const late = mockUpload.mock.calls.map((c) => c[0] as string).find((p) => p.includes('-section'))!;
    expect(late).toBeDefined();
    expect(mockRemove).toHaveBeenCalledWith([late]);
    expect(result.markdown).not.toContain(late);
  });

  it('drops every image when the public URL cannot be read, keeping the data table', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 400 })));
    const result = await createPostVisuals(input());
    expect(result.summary).toEqual({ chart: false, cover: false, sections: 0 });
    expect(result.markdown).not.toContain('![');
    expect(result.markdown).toContain('| LG화학 |');
    expect(result.uploadedPaths).toEqual([]);
    expect(mockRemove.mock.calls.at(-1)![0]).toHaveLength(4);
  });

  it('drops only the image whose public URL cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(null, { status: url.includes('-section') ? 404 : 200 })));
    const result = await createPostVisuals(input());
    expect(result.summary).toEqual({ chart: true, cover: true, sections: 0 });
    expect(result.markdown).not.toContain('-section');
    expect(result.uploadedPaths).toHaveLength(2);
    expect(mockRemove.mock.calls.at(-1)![0]).toEqual(expect.arrayContaining([expect.stringContaining('-section')]));
    expect(mockRemove.mock.calls.at(-1)![0]).toHaveLength(2);
  });

  it('sends every generated image to the vision check with its alt text before uploading', async () => {
    mockPlan.mockResolvedValue(plan([]));
    await createPostVisuals(input(null));
    expect(mockQa).toHaveBeenCalledTimes(1);
    const call = mockQa.mock.calls[0][0];
    expect(call.image).toEqual({ data: Buffer.from('webp'), mimeType: 'image/webp' });
    expect(call.prompt).toContain('배터리 소재 연구실의 실험대를 담은 LG화학 실적 분석 커버 이미지');
    expect(call.config).toMatchObject({ responseMimeType: 'application/json' });
  });

  it('checks every image against the article topic with the readable-text rule', async () => {
    mockPlan.mockResolvedValue(plan([{ heading: HEADINGS[0] }]));
    await createPostVisuals(input(null));
    const prompts = mockQa.mock.calls.map((c) => c[0].prompt as string);
    expect(prompts).toHaveLength(2);
    for (const p of prompts) {
      expect(p).toContain('<topic>LG화학 실적 분석 — LG화학 실적 분석</topic>');
      expect(p).toContain('- off_topic:');
      expect(p).toContain('Ignore tiny incidental marks');
      expect(p).toContain('- face: a clearly visible, in-focus human face');
    }
  });

  it('redraws an off-topic image', async () => {
    mockPlan.mockResolvedValue(plan([]));
    mockQa.mockResolvedValueOnce(qa({ off_topic: true }, 'Wooden blocks on a plinth.'));
    const result = await createPostVisuals(input(null));
    expect(result.summary.cover).toBe(true);
    expect(mockGenerateImage).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('검수 탈락 (커버, 1차): off_topic / Wooden blocks on a plinth.'));
  });

  it('redraws an image the vision check rejects, and drops it after a second rejection', async () => {
    mockPlan.mockResolvedValue(plan([]));
    mockQa.mockResolvedValueOnce(qa({ face: true }, 'A worker faces the camera.'));
    const redrawn = await createPostVisuals(input(null));
    expect(redrawn.summary.cover).toBe(true);
    expect(mockGenerateImage).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('검수 탈락 (커버, 1차): face / A worker faces the camera.'));

    vi.clearAllMocks();
    mockQa.mockResolvedValue(qa({ text: true }));
    const dropped = await createPostVisuals(input(null));
    expect(dropped.summary.cover).toBe(false);
    expect(mockGenerateImage).toHaveBeenCalledTimes(2);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('fails closed when the vision check itself errors', async () => {
    mockPlan.mockResolvedValue(plan([]));
    mockQa.mockRejectedValue(new Error('vision down'));
    const result = await createPostVisuals(input(null));
    expect(result.summary.cover).toBe(false);
    expect(result.markdown).not.toContain('![');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('skips AI images when switched off but keeps the chart', async () => {
    vi.stubEnv('BLOG_AI_IMAGES', 'off');
    const result = await createPostVisuals(input());
    expect(result.summary).toEqual({ chart: true, cover: false, sections: 0 });
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('uses a comparison chart for several stocks', async () => {
    const ctx: MarketContext = { ...MARKET, stocks: [snapshot(), { ...snapshot(), name: '삼성SDI', code: '006400' }] };
    await createPostVisuals(input(ctx));
    expect(mockComparisonChart).toHaveBeenCalledWith(ctx.stocks, 'LG화학 · 삼성SDI 주가 비교');
    expect(mockPriceChart).not.toHaveBeenCalled();
  });
});

describe('parseImageQa', () => {
  it('passes only when every flag is false', () => {
    expect(parseImageQa(qa())).toEqual({ ok: true, reasons: [] });
    expect(parseImageQa('```json\n' + qa({ logo: true, artifact: true }, '간판 글자') + '\n```')).toEqual({ ok: false, reasons: ['logo', 'artifact', '간판 글자'] });
  });

  it('rejects malformed or incomplete verdicts', () => {
    expect(parseImageQa('looks fine').ok).toBe(false);
    expect(parseImageQa('{ broken').ok).toBe(false);
    expect(parseImageQa(JSON.stringify({ text: false, logo: false })).reasons).toEqual(['검수 응답 항목 누락']);
    expect(parseImageQa(qa().replace('"face":false', '"face":"no"')).ok).toBe(false);
  });
});
