/** TLI 컨텍스트를 프롬프트 문자열로 변환하는 포맷터 */

import type { TLIContext, TLIThemeContext, ActiveStage } from '../_services/tli-context';
import { STAGE_CONFIG } from '../_services/tli-context';

/** TLI 컨텍스트를 프롬프트 문자열로 변환 */
export function formatTLIForPrompt(ctx: TLIContext): string {
  if (ctx.isEmpty) return '';

  const groups: Record<string, TLIThemeContext[]> = {};
  const reigniting = ctx.themes.filter((t) => t.isReigniting);

  for (const t of ctx.themes) {
    if (t.isReigniting) continue;
    if (!groups[t.stage]) groups[t.stage] = [];
    groups[t.stage].push(t);
  }

  let result = `## 현재 시장 트렌드 (TLI 실시간 데이터, ${ctx.fetchedAt})\n\n`;

  // STAGE_CONFIG에서 priority 순으로 정렬된 스테이지 순서
  const stageOrder = (Object.keys(STAGE_CONFIG) as ActiveStage[]).sort(
    (a, b) => STAGE_CONFIG[a].priority - STAGE_CONFIG[b].priority,
  );

  for (const stage of stageOrder) {
    const themes = groups[stage];
    if (!themes || themes.length === 0) continue;
    result += `### ${stage} (${STAGE_CONFIG[stage].label})\n`;
    for (const t of themes) {
      result += formatThemeLine(t);
    }
    result += '\n';
  }

  if (reigniting.length > 0) {
    result += `### Reigniting (재점화 - 숨은 기회)\n`;
    for (const t of reigniting) {
      result += formatThemeLine(t);
    }
    result += '\n';
  }

  return result.trim();
}

/** Prompt injection 방어: 제어문자, HTML 태그, 과도한 길이 제거 */
function sanitizeForPrompt(text: string): string {
  return text
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function formatThemeLine(t: TLIThemeContext): string {
  const name = sanitizeForPrompt(t.name);
  let line = `- **${name}** (점수: ${t.score})`;
  if (t.topStocks.length > 0) {
    line += `\n  종목: ${t.topStocks.map((s) => sanitizeForPrompt(s)).join(', ')}`;
  }
  if (t.recentNews.length > 0) {
    line += `\n  최신뉴스: ${t.recentNews.map((n) => `"${sanitizeForPrompt(n)}"`).join(', ')}`;
  }
  return line + '\n';
}
