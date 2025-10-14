import Anthropic from '@anthropic-ai/sdk';
import { CircuitBreaker } from './circuit-breaker';
import { STOCK_ANALYSIS_PROMPT, SYSTEM_MESSAGE } from '../prompts/stock-analysis-prompt';

const claudeBreaker = new CircuitBreaker();

async function retry<T>(fn: () => Promise<T>, retries = 2, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retry(fn, retries - 1, delay * 2);
  }
}

export async function getClaudeRecommendation(): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return '⚠️ Anthropic API 키가 설정되지 않았습니다.';
  }

  if (claudeBreaker.isOpen()) {
    console.warn('[Claude] Circuit breaker open');
    return '⚠️ Claude 서비스가 일시적으로 불안정합니다.';
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 600000,
      maxRetries: 2,
    });

    const result = await retry(async () => {
      const conversationMessages: Anthropic.MessageParam[] = [
        { role: 'user', content: STOCK_ANALYSIS_PROMPT },
      ];

      let finalResponse = '';
      let continueLoop = true;
      let iterationCount = 0;
      const maxIterations = 10;

      while (continueLoop && iterationCount < maxIterations) {
        iterationCount++;
        console.log(`[Claude] Iteration ${iterationCount}`);

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          temperature: 0.3,
          system: `${SYSTEM_MESSAGE} 프롬프트에 명시된 대로 실제 전일 종가 데이터를 수집하여 분석해야 합니다.`,
          messages: conversationMessages,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        });

        console.log(`[Claude] Stop reason: ${message.stop_reason}`);
        console.log(`[Claude] Content blocks: ${message.content.length}`);

        // 텍스트 콘텐츠 추출
        const textBlocks = message.content.filter((block) => block.type === 'text');
        if (textBlocks.length > 0) {
          const text = textBlocks
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('\n');
          console.log(`[Claude] Text length: ${text.length}`);
          finalResponse += text;
        }

        // tool_use 블록 확인
        const toolUseBlocks = message.content.filter((block) => block.type === 'tool_use');

        if (
          toolUseBlocks.length > 0 &&
          (message.stop_reason === 'tool_use' || message.stop_reason === 'pause_turn')
        ) {
          console.log(`[Claude] Tool use detected: ${toolUseBlocks.length} tools`);

          // Assistant 메시지 추가
          conversationMessages.push({
            role: 'assistant',
            content: message.content,
          });

          // 각 tool_use에 대한 더미 결과 반환
          const toolResults = toolUseBlocks.map((toolUse) => ({
            type: 'tool_result' as const,
            tool_use_id: toolUse.type === 'tool_use' ? toolUse.id : '',
            content: 'Search completed successfully.',
          }));

          conversationMessages.push({
            role: 'user',
            content: toolResults,
          });
        } else {
          continueLoop = false;
        }
      }

      console.log(`[Claude] Final response length: ${finalResponse.length}`);
      return finalResponse.trim() || null;
    });

    if (!result) throw new Error('Empty response from Claude');
    claudeBreaker.recordSuccess();
    return result;
  } catch (error) {
    claudeBreaker.recordFailure();
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Claude Error]', msg);

    if (msg.includes('timeout')) {
      return '⚠️ Claude 응답 시간 초과. 네트워크를 확인해주세요.';
    } else if (msg.includes('401')) {
      return '⚠️ Claude API 인증 오류. 관리자에게 문의하세요.';
    } else if (msg.includes('429')) {
      return '⚠️ Claude API 사용량 한도 초과.';
    }

    return `⚠️ Claude 오류: ${msg}`;
  }
}