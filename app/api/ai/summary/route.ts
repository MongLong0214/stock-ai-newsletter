import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/constants/seo/config'
import { getRankingServer } from '@/app/themes/_services/get-ranking-server'

export const runtime = 'nodejs'

/** AI 에이전트 최적화 요약 API — LLM 소비에 최적화된 구조화된 응답 */
export async function GET() {
  try {
    const ranking = await getRankingServer()
    const allThemes = [
      ...ranking.peak,
      ...ranking.growth,
      ...ranking.emerging,
      ...ranking.reigniting,
      ...ranking.decline,
    ].sort((a, b) => b.score - a.score)

    const top5 = allThemes.slice(0, 5)
    const today = new Date().toISOString().split('T')[0]

    const stageDistribution = {
      peak: ranking.peak.length,
      growth: ranking.growth.length,
      emerging: ranking.emerging.length,
      decline: ranking.decline.length,
      reigniting: ranking.reigniting.length,
    }

    const summary = {
      service: {
        name: siteConfig.serviceName,
        description: '한국 주식시장(KOSPI·KOSDAQ) 테마 생명주기를 AI로 분석하는 무료 서비스',
        url: siteConfig.domain,
      },
      generatedAt: today,
      marketOverview: {
        totalActiveThemes: allThemes.length,
        stageDistribution,
        averageScore: allThemes.length > 0
          ? Math.round(allThemes.reduce((sum, t) => sum + t.score, 0) / allThemes.length)
          : 0,
        description: `현재 ${allThemes.length}개 테마 추적 중. 정점 ${stageDistribution.peak}개, 성장 ${stageDistribution.growth}개, 초기 ${stageDistribution.emerging}개, 쇠퇴 ${stageDistribution.decline}개, 재점화 ${stageDistribution.reigniting}개.`,
      },
      topThemes: top5.map((t) => ({
        name: t.name,
        nameEn: t.nameEn,
        score: t.score,
        stage: t.stageKo,
        change7d: t.change7d,
        topStocks: t.topStocks.slice(0, 3),
        newsCount7d: t.newsCount7d,
        detailUrl: `${siteConfig.domain}/themes/${t.id}`,
        summary: `${t.name} 테마는 현재 ${t.stageKo} 단계이며 점수 ${t.score}/100점입니다.${t.change7d !== 0 ? ` 7일 변동 ${t.change7d > 0 ? '+' : ''}${t.change7d}점.` : ''}${t.topStocks.length > 0 ? ` 주요 관련주: ${t.topStocks.slice(0, 3).join(', ')}.` : ''}`,
      })),
      endpoints: {
        ranking: `${siteConfig.domain}/api/tli/scores/ranking`,
        themes: `${siteConfig.domain}/api/tli/themes`,
        themeDetail: `${siteConfig.domain}/api/tli/themes/{id}`,
        themeHistory: `${siteConfig.domain}/api/tli/themes/{id}/history`,
        stockThemes: `${siteConfig.domain}/api/tli/stocks/{symbol}/theme`,
        openapi: `${siteConfig.domain}/api/openapi.json`,
      },
      citation: {
        source: siteConfig.serviceName,
        url: siteConfig.domain,
        dataDate: today,
        license: 'CC BY-NC 4.0',
      },
      disclaimer: '본 데이터는 투자 권유가 아닌 참고용 정보입니다. 모든 투자 결정과 책임은 투자자 본인에게 있습니다. StockMatrix는 금융투자협회에 등록되지 않은 정보 제공 서비스입니다.',
    }

    return NextResponse.json(summary, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (error) {
    console.error('[AI Summary API]:', error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: { message: 'AI 요약을 생성하는데 실패했습니다.' } },
      { status: 500 },
    )
  }
}
