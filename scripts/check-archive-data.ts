/**
 * 아카이브 데이터 확인 스크립트
 * DB에서 뉴스레터 데이터를 조회하고 검증
 */

import { supabase } from '../lib/supabase';

async function checkArchiveData() {
  console.log('🔍 Checking archive data...\n');

  // 모든 뉴스레터 데이터 조회
  const { data, error } = await supabase
    .from('newsletter_content')
    .select('newsletter_date, is_sent, sent_at, subscriber_count')
    .order('newsletter_date', { ascending: false });

  if (error) {
    console.error('❌ Failed to fetch data:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('📭 No newsletter data found in DB');
    return;
  }

  console.log(`📊 Found ${data.length} newsletter(s) in DB:\n`);

  for (const row of data) {
    console.log('📅 Date:', row.newsletter_date);
    console.log('   is_sent:', row.is_sent);
    console.log('   sent_at:', row.sent_at || 'null');
    console.log('   subscriber_count:', row.subscriber_count);
    console.log('');
  }

  // 특정 날짜 (2025-10-30) 상세 조회
  console.log('🔎 Checking 2025-10-30 specifically...\n');

  const { data: specificData, error: specificError } = await supabase
    .from('newsletter_content')
    .select('*')
    .eq('newsletter_date', '2025-10-30')
    .single();

  if (specificError) {
    console.error('❌ Error fetching 2025-10-30:', specificError.message);

    // 2024-10-30도 확인
    console.log('\n🔎 Checking 2024-10-30...\n');
    const { data: data2024, error: error2024 } = await supabase
      .from('newsletter_content')
      .select('*')
      .eq('newsletter_date', '2024-10-30')
      .single();

    if (error2024) {
      console.error('❌ Error fetching 2024-10-30:', error2024.message);
      return;
    }

    if (data2024) {
      console.log('✅ Found data for 2024-10-30');
      analyzeData(data2024);
    }
    return;
  }

  if (specificData) {
    console.log('✅ Found data for 2025-10-30');
    analyzeData(specificData);
  }
}

function analyzeData(data: any) {
  console.log('\n📋 Data details:');
  console.log('   newsletter_date:', data.newsletter_date);
  console.log('   is_sent:', data.is_sent);
  console.log('   sent_at:', data.sent_at);
  console.log('   subscriber_count:', data.subscriber_count);
  console.log('   gemini_analysis length:', data.gemini_analysis?.length || 0);

  // JSON 파싱 시도
  try {
    const stocks = JSON.parse(data.gemini_analysis);
    console.log('\n✅ JSON parsing successful');
    console.log('   Array length:', Array.isArray(stocks) ? stocks.length : 'NOT AN ARRAY');

    if (Array.isArray(stocks) && stocks.length > 0) {
      console.log('\n📊 First stock sample:');
      const firstStock = stocks[0];
      console.log('   ticker:', firstStock.ticker);
      console.log('   name:', firstStock.name);
      console.log('   close_price:', firstStock.close_price, '(type:', typeof firstStock.close_price, ')');
      console.log('   rationale length:', firstStock.rationale?.length || 0);

      if (firstStock.signals) {
        console.log('   signals:');
        console.log('     - trend_score:', firstStock.signals.trend_score, '(type:', typeof firstStock.signals.trend_score, ')');
        console.log('     - momentum_score:', firstStock.signals.momentum_score, '(type:', typeof firstStock.signals.momentum_score, ')');
        console.log('     - volume_score:', firstStock.signals.volume_score, '(type:', typeof firstStock.signals.volume_score, ')');
        console.log('     - volatility_score:', firstStock.signals.volatility_score, '(type:', typeof firstStock.signals.volatility_score, ')');
        console.log('     - pattern_score:', firstStock.signals.pattern_score, '(type:', typeof firstStock.signals.pattern_score, ')');
        console.log('     - sentiment_score:', firstStock.signals.sentiment_score, '(type:', typeof firstStock.signals.sentiment_score, ')');
        console.log('     - overall_score:', firstStock.signals.overall_score, '(type:', typeof firstStock.signals.overall_score, ')');
      } else {
        console.log('   ❌ signals: missing or invalid');
      }
    }
  } catch (err) {
    console.error('\n❌ JSON parsing failed:', err instanceof Error ? err.message : 'Unknown error');
    console.log('   First 200 chars:', data.gemini_analysis?.substring(0, 200));
  }
}

checkArchiveData()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Unexpected error:', err);
    process.exit(1);
  });
