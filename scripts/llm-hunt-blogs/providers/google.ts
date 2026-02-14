/**
 * Google Gemini 3 Pro Provider
 */

import { MODELS } from '../constants';

export async function callGoogle(prompt: string, apiKey: string): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const genAI = new GoogleGenAI({ apiKey });

  const response = await genAI.models.generateContent({
    model: MODELS.google,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 65536,
      temperature: 0.8,
      topP: 0.95,
      topK: 64,
      responseMimeType: 'text/plain',
    },
  });

  const text = response.text;
  if (!text) throw new Error('Google Gemini: 빈 응답 (safety filter 또는 빈 candidates)');
  return text;
}
