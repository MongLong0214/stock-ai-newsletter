#!/usr/bin/env tsx

import { config } from 'dotenv';
import { resolve } from 'path';
import { writeFileSync } from 'fs';

config({ path: resolve(process.cwd(), '.env.local') });

import {
  getGPTRecommendation,
  getClaudeRecommendation,
  getGeminiRecommendation,
} from '../lib/ai-recommendations';

function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

async function testAllLLMs() {
  const timestamp = getTimestamp();
  console.log('🚀 Testing All LLMs with Latest Models\n');
  console.log('Models:');
  console.log('  - GPT-5 (Responses API with reasoning)');
  console.log('  - Claude Sonnet 4.5 (with web search)');
  console.log('  - Gemini 2.5 Pro (with Google Search)\n');
  console.log(`📁 Results will be saved with timestamp: ${timestamp}\n`);
  console.log('⚠️  Each test may take up to 10 minutes\n');
  console.log('=' .repeat(80) + '\n');

  // Test GPT-5
  console.log('📝 Testing GPT-5 (Responses API)...');
  const gptStart = Date.now();
  try {
    const gptResult = await getGPTRecommendation();
    const gptDuration = Date.now() - gptStart;

    if (gptResult.startsWith('⚠️')) {
      console.log(`❌ GPT-5 failed (${(gptDuration / 1000).toFixed(1)}s): ${gptResult}`);
      writeFileSync(`test-results-gpt-${timestamp}.txt`, `ERROR: ${gptResult}`, 'utf-8');
    } else {
      console.log(`✅ GPT-5 succeeded (${(gptDuration / 1000).toFixed(1)}s)`);
      writeFileSync(`test-results-gpt-${timestamp}.txt`, gptResult, 'utf-8');
      console.log(`📄 Saved to: test-results-gpt-${timestamp}.txt`);
    }
  } catch (error) {
    const gptDuration = Date.now() - gptStart;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ GPT-5 exception (${(gptDuration / 1000).toFixed(1)}s): ${errorMsg}`);
    writeFileSync(`test-results-gpt-${timestamp}.txt`, `EXCEPTION: ${errorMsg}`, 'utf-8');
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Test Claude
  console.log('📝 Testing Claude Sonnet 4.5...');
  const claudeStart = Date.now();
  try {
    const claudeResult = await getClaudeRecommendation();
    const claudeDuration = Date.now() - claudeStart;

    if (claudeResult.startsWith('⚠️')) {
      console.log(
        `❌ Claude failed (${(claudeDuration / 1000).toFixed(1)}s): ${claudeResult}`
      );
      writeFileSync(
        `test-results-claude-${timestamp}.txt`,
        `ERROR: ${claudeResult}`,
        'utf-8'
      );
    } else {
      console.log(`✅ Claude succeeded (${(claudeDuration / 1000).toFixed(1)}s)`);
      writeFileSync(`test-results-claude-${timestamp}.txt`, claudeResult, 'utf-8');
      console.log(`📄 Saved to: test-results-claude-${timestamp}.txt`);
    }
  } catch (error) {
    const claudeDuration = Date.now() - claudeStart;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Claude exception (${(claudeDuration / 1000).toFixed(1)}s): ${errorMsg}`);
    writeFileSync(
      `test-results-claude-${timestamp}.txt`,
      `EXCEPTION: ${errorMsg}`,
      'utf-8'
    );
  }

  console.log('\n' + '='.repeat(80) + '\n');

  // Test Gemini
  console.log('📝 Testing Gemini 2.5 Pro...');
  const geminiStart = Date.now();
  try {
    const geminiResult = await getGeminiRecommendation();
    const geminiDuration = Date.now() - geminiStart;

    if (geminiResult.startsWith('⚠️')) {
      console.log(
        `❌ Gemini failed (${(geminiDuration / 1000).toFixed(1)}s): ${geminiResult}`
      );
      writeFileSync(
        `test-results-gemini-${timestamp}.txt`,
        `ERROR: ${geminiResult}`,
        'utf-8'
      );
    } else {
      console.log(`✅ Gemini succeeded (${(geminiDuration / 1000).toFixed(1)}s)`);
      writeFileSync(`test-results-gemini-${timestamp}.txt`, geminiResult, 'utf-8');
      console.log(`📄 Saved to: test-results-gemini-${timestamp}.txt`);
    }
  } catch (error) {
    const geminiDuration = Date.now() - geminiStart;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`❌ Gemini exception (${(geminiDuration / 1000).toFixed(1)}s): ${errorMsg}`);
    writeFileSync(
      `test-results-gemini-${timestamp}.txt`,
      `EXCEPTION: ${errorMsg}`,
      'utf-8'
    );
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Testing complete! Check the txt files for full results.\n');
  console.log(`📁 Files created:`);
  console.log(`   - test-results-gpt-${timestamp}.txt`);
  console.log(`   - test-results-claude-${timestamp}.txt`);
  console.log(`   - test-results-gemini-${timestamp}.txt\n`);
}

testAllLLMs().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});