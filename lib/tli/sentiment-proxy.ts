/**
 * Multi-Signal Sentiment Proxy (Gu 2024)
 * Combines price direction + news acceleration + volume-price divergence
 * WITHOUT NLP — proxy ceiling is B+ (documented limitation)
 */

import { sigmoid_normalize } from './normalize';

interface SentimentInput {
  /** Average price change % across theme stocks */
  avgPriceChangePct: number;
  /** News count this week */
  newsThisWeek: number;
  /** News count last week */
  newsLastWeek: number;
  /** Average trading volume */
  avgVolume: number;
  /** Previous week's average volume (for acceleration) */
  prevAvgVolume?: number;
}

/**
 * Compute multi-signal sentiment proxy [0, 1].
 * 0.5 = neutral, >0.5 = bullish, <0.5 = bearish
 *
 * Signal weights: price(0.50) + newsAcceleration(0.30) + volumeBreadth(0.20)
 */
export function computeSentimentProxy(input: SentimentInput): number {
  // Signal 1: Price direction (sigmoid, center=0, scale=5)
  const priceSignal = sigmoid_normalize(input.avgPriceChangePct, 0, 5);

  // Signal 2: News acceleration (week-over-week change rate)
  let newsAcceleration: number;
  if (input.newsLastWeek >= 3) {
    const changeRate = (input.newsThisWeek - input.newsLastWeek) / Math.max(input.newsLastWeek, 1);
    newsAcceleration = sigmoid_normalize(changeRate, 0, 1.5);
  } else {
    // Insufficient baseline → neutral
    newsAcceleration = 0.5;
  }

  // Signal 3: Volume-price divergence (breadth)
  // High volume + negative price = bearish divergence (lower sentiment)
  // High volume + positive price = bullish confirmation (higher sentiment)
  let volumeBreadth = 0.5;
  if (input.avgVolume > 0 && input.prevAvgVolume && input.prevAvgVolume > 0) {
    const volumeChange = (input.avgVolume - input.prevAvgVolume) / input.prevAvgVolume;
    const priceDir = input.avgPriceChangePct > 0 ? 1 : input.avgPriceChangePct < 0 ? -1 : 0;
    // Aligned (both up or both down) → boost, divergent → penalize
    const alignment = volumeChange * priceDir;
    volumeBreadth = sigmoid_normalize(alignment, 0, 0.5);
  }

  // Weighted combination
  const proxy = priceSignal * 0.50 + newsAcceleration * 0.30 + volumeBreadth * 0.20;

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, proxy));
}
