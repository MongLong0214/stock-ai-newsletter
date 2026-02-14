/**
 * Groq Llama 4 Scout Provider
 */

import { MODELS } from '../constants';

export async function callGroq(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.groq,
      max_completion_tokens: 32768,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API 오류 (${response.status}): ${errorBody}`);
  }

  const data: unknown = await response.json();
  const body = data as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq: 응답에 content 없음');
  return content;
}
