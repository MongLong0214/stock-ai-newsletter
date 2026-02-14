/**
 * OpenAI GPT-5.2 (Thinking) Provider
 */

import { MODELS } from '../constants';

export async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.openai,
      reasoning_effort: 'high',
      max_completion_tokens: 32768,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API 오류 (${response.status}): ${errorBody}`);
  }

  const data: unknown = await response.json();
  const body = data as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI: 응답에 content 없음');
  return content;
}
