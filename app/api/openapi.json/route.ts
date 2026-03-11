import { NextResponse } from 'next/server'

import { siteConfig } from '@/lib/constants/seo/config'

export function GET() {
  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'StockMatrix API',
      version: '1.0.0',
      description:
        'Korean stock market theme lifecycle intelligence API. Provides theme rankings, search, detail scores, and historical data for 250+ KOSPI/KOSDAQ themes updated daily.',
    },
    servers: [{ url: siteConfig.domain }],
    paths: {
      '/api/tli/scores/ranking': {
        get: {
          operationId: 'getThemeRanking',
          summary: 'Get theme ranking by lifecycle stage',
          description:
            'Returns all active themes grouped by lifecycle stage (emerging, growth, peak, decline, reigniting) with summary statistics including hottest and surging themes.',
          responses: {
            '200': {
              description: 'Theme ranking grouped by stage',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ThemeRankingResponse' },
                },
              },
            },
          },
        },
      },
      '/api/tli/themes': {
        get: {
          operationId: 'listThemes',
          summary: 'List or search active themes',
          description:
            'Returns active themes with current score, stage, 7-day change, and stock count. Use optional q parameter to filter by theme name. Sorted alphabetically.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: false,
              description:
                'Search query to filter themes by Korean or English name (case-insensitive substring match)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of themes',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ThemeListResponse' },
                },
              },
            },
          },
        },
      },
      '/api/tli/themes/{id}': {
        get: {
          operationId: 'getThemeDetail',
          summary: 'Get theme detail by ID',
          description:
            'Returns detailed information for a single theme including score breakdown, related stocks with prices, recent news articles, similar themes, and timeline data for lifecycle curve visualization.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Theme UUID',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Theme detail',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ThemeDetailResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid theme ID format',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '404': {
              description: 'Theme not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/ai/summary': {
        get: {
          operationId: 'getAiSummary',
          summary: 'AI agent optimized market summary',
          description:
            'Returns a structured summary optimized for LLM consumption. Includes top 5 themes, market overview, stage distribution, API endpoints, citation info, and legal disclaimer.',
          responses: {
            '200': {
              description: 'AI-optimized market summary',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AiSummary' },
                },
              },
            },
          },
        },
      },
      '/api/tli/stocks/{symbol}/theme': {
        get: {
          operationId: 'getStockThemes',
          summary: 'Get themes for a stock',
          description:
            'Returns all themes that a given stock belongs to, with current lifecycle scores and stages. Results sorted by score descending.',
          parameters: [
            {
              name: 'symbol',
              in: 'path',
              required: true,
              description:
                'Korean stock code (6 digits, e.g. "005930" for Samsung Electronics)',
              schema: { type: 'string', pattern: '^\\d{6}$' },
            },
          ],
          responses: {
            '200': {
              description: 'List of themes the stock belongs to',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StockThemesResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid stock symbol',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/tli/themes/{id}/history': {
        get: {
          operationId: 'getThemeHistory',
          summary: 'Get theme score history (30 days)',
          description:
            'Returns daily score and stage history for a theme over the last 30 days, ordered chronologically.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Theme UUID',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Score history array',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ThemeHistoryResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid theme ID format',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            '404': {
              description: 'Theme not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
              },
              required: ['message'],
            },
          },
          required: ['success', 'error'],
        },
        ThemeRankingResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: '#/components/schemas/ThemeRanking' },
          },
          required: ['success', 'data'],
        },
        ThemeListResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeListItemSimple' },
            },
          },
          required: ['success', 'data'],
        },
        ThemeDetailResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: '#/components/schemas/ThemeDetail' },
          },
          required: ['success', 'data'],
        },
        ThemeHistoryResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/HistoryEntry' },
            },
          },
          required: ['success', 'data'],
        },
        ThemeRanking: {
          type: 'object',
          properties: {
            emerging: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeListItem' },
            },
            growth: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeListItem' },
            },
            peak: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeListItem' },
            },
            decline: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeListItem' },
            },
            reigniting: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeListItem' },
            },
            summary: { $ref: '#/components/schemas/RankingSummary' },
          },
          required: [
            'emerging',
            'growth',
            'peak',
            'decline',
            'reigniting',
            'summary',
          ],
        },
        ThemeListItem: {
          type: 'object',
          description: 'Theme with full ranking data including sparkline and news',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', description: 'Theme name in Korean' },
            nameEn: {
              type: 'string',
              nullable: true,
              description: 'Theme name in English',
            },
            score: {
              type: 'number',
              description: 'Lifecycle score (0-100)',
            },
            stage: {
              type: 'string',
              enum: ['Emerging', 'Growth', 'Peak', 'Decline', 'Dormant'],
            },
            stageKo: {
              type: 'string',
              description: 'Stage label in Korean',
            },
            change7d: {
              type: 'number',
              description: 'Score change over last 7 days',
            },
            stockCount: {
              type: 'integer',
              description: 'Number of related stocks',
            },
            topStocks: {
              type: 'array',
              items: { type: 'string' },
              description: 'Top related stock names (max 5)',
            },
            isReigniting: { type: 'boolean' },
            updatedAt: { type: 'string', format: 'date-time' },
            sparkline: {
              type: 'array',
              items: { type: 'number' },
              description: 'Last 7 days score trend',
            },
            newsCount7d: {
              type: 'integer',
              description: 'News article count in last 7 days',
            },
            confidenceLevel: {
              type: 'string',
              enum: ['high', 'medium', 'low'],
              nullable: true,
            },
            avgStockChange: {
              type: 'number',
              nullable: true,
              description: 'Average stock price change percent',
            },
          },
          required: [
            'id',
            'name',
            'score',
            'stage',
            'stageKo',
            'change7d',
            'stockCount',
            'topStocks',
            'isReigniting',
            'updatedAt',
            'sparkline',
            'newsCount7d',
          ],
        },
        ThemeListItemSimple: {
          type: 'object',
          description: 'Simplified theme item from /themes list endpoint',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            nameEn: { type: 'string', nullable: true },
            score: { type: 'number' },
            stage: {
              type: 'string',
              enum: ['Emerging', 'Growth', 'Peak', 'Decline', 'Dormant'],
            },
            stageKo: { type: 'string' },
            change7d: { type: 'number' },
            stockCount: { type: 'integer' },
            isReigniting: { type: 'boolean' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: [
            'id',
            'name',
            'score',
            'stage',
            'stageKo',
            'change7d',
            'stockCount',
            'isReigniting',
            'updatedAt',
          ],
        },
        RankingSummary: {
          type: 'object',
          properties: {
            totalThemes: { type: 'integer' },
            byStage: {
              type: 'object',
              additionalProperties: { type: 'integer' },
            },
            hottestTheme: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                score: { type: 'number' },
                stage: { type: 'string' },
                stockCount: { type: 'integer' },
              },
            },
            surging: {
              type: 'object',
              nullable: true,
              description: 'Fastest rising theme in emerging/growth stage',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                score: { type: 'number' },
                change7d: { type: 'number' },
                stage: { type: 'string' },
              },
            },
            avgScore: { type: 'number' },
          },
          required: [
            'totalThemes',
            'byStage',
            'hottestTheme',
            'surging',
            'avgScore',
          ],
        },
        ThemeDetail: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            nameEn: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            firstSpikeDate: {
              type: 'string',
              nullable: true,
              description: 'Date of first interest spike',
            },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Related keywords for this theme',
            },
            score: { $ref: '#/components/schemas/ScoreDetail' },
            stockCount: { type: 'integer' },
            stocks: {
              type: 'array',
              items: { $ref: '#/components/schemas/Stock' },
            },
            newsCount: { type: 'integer' },
            recentNews: {
              type: 'array',
              items: { $ref: '#/components/schemas/NewsArticle' },
            },
            comparisons: {
              type: 'array',
              items: { $ref: '#/components/schemas/Comparison' },
              description: 'Similar themes by lifecycle pattern',
            },
            lifecycleCurve: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  score: { type: 'number' },
                },
              },
            },
            newsTimeline: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  count: { type: 'integer' },
                },
              },
            },
            interestTimeline: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  value: { type: 'number' },
                },
              },
            },
            comparisonSource: {
              type: 'string',
              enum: ['legacy', 'v4', 'v4-view'],
              description: 'Source of comparison data (legacy table or v4 pipeline)',
            },
          },
          required: [
            'id',
            'name',
            'score',
            'stockCount',
            'stocks',
            'newsCount',
            'recentNews',
            'comparisons',
            'lifecycleCurve',
            'newsTimeline',
            'interestTimeline',
          ],
        },
        ScoreDetail: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              description: 'Composite lifecycle score (0-100)',
            },
            stage: {
              type: 'string',
              enum: ['Emerging', 'Growth', 'Peak', 'Decline', 'Dormant'],
            },
            stageKo: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
            change24h: { type: 'number' },
            change7d: { type: 'number' },
            isReigniting: { type: 'boolean' },
            components: {
              type: 'object',
              description: 'Score component breakdown',
              properties: {
                interest: {
                  type: 'number',
                  description: 'Interest score (40% weight)',
                },
                newsMomentum: {
                  type: 'number',
                  description: 'News momentum score (35% weight)',
                },
                volatility: {
                  type: 'number',
                  description: 'Volatility score (10% weight)',
                },
                activity: {
                  type: 'number',
                  description: 'Activity score (15% weight)',
                },
              },
            },
            confidence: {
              type: 'object',
              nullable: true,
              properties: {
                level: {
                  type: 'string',
                  enum: ['high', 'medium', 'low'],
                },
                dataAge: { type: 'integer' },
                interestCoverage: { type: 'number' },
                newsCoverage: { type: 'number' },
                reason: { type: 'string' },
              },
            },
          },
          required: [
            'value',
            'stage',
            'stageKo',
            'updatedAt',
            'change24h',
            'change7d',
            'isReigniting',
            'components',
          ],
        },
        Stock: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Stock ticker symbol' },
            name: { type: 'string', description: 'Stock name in Korean' },
            market: {
              type: 'string',
              enum: ['KOSPI', 'KOSDAQ'],
            },
            currentPrice: {
              type: 'integer',
              nullable: true,
              description: 'Current price in KRW',
            },
            priceChangePct: {
              type: 'number',
              nullable: true,
              description: 'Price change percentage',
            },
            volume: {
              type: 'integer',
              nullable: true,
              description: 'Trading volume',
            },
          },
          required: ['symbol', 'name', 'market'],
        },
        NewsArticle: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            link: { type: 'string', format: 'uri' },
            source: { type: 'string' },
            pubDate: { type: 'string', format: 'date-time' },
          },
          required: ['title', 'link', 'source', 'pubDate'],
        },
        Comparison: {
          type: 'object',
          description: 'Similar theme comparison with lifecycle pattern matching',
          properties: {
            pastTheme: { type: 'string', description: 'Name of the compared past theme' },
            pastThemeId: { type: 'string', format: 'uuid' },
            similarity: {
              type: 'number',
              description: 'Composite similarity score (0-0.99)',
            },
            currentDay: {
              type: 'integer',
              description: 'Current theme active days',
            },
            pastPeakDay: {
              type: 'integer',
              description: 'Day the past theme peaked',
            },
            pastPeakScore: {
              type: 'number',
              nullable: true,
              description: 'Peak score of the past theme',
            },
            pastTotalDays: {
              type: 'integer',
              description: 'Total lifecycle days of the past theme',
            },
            pastDeclineDays: {
              type: 'integer',
              nullable: true,
              description: 'Days from peak to decline for the past theme',
            },
            pastFinalStage: {
              type: 'string',
              nullable: true,
              description: 'Final lifecycle stage of the past theme',
            },
            estimatedDaysToPeak: {
              type: 'integer',
              description: 'Estimated days until current theme peaks',
            },
            message: {
              type: 'string',
              description: 'Natural language comparison summary in Korean',
            },
            featureSim: {
              type: 'number',
              nullable: true,
              description: 'Feature vector similarity (0-1)',
            },
            curveSim: {
              type: 'number',
              nullable: true,
              description: 'Lifecycle curve shape similarity (0-1)',
            },
            keywordSim: {
              type: 'number',
              nullable: true,
              description: 'Keyword overlap similarity (0-1)',
            },
            lifecycleCurve: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { type: 'string' },
                  score: { type: 'number' },
                },
              },
              description: 'Past theme lifecycle curve data points',
            },
          },
          required: ['pastTheme', 'pastThemeId', 'similarity', 'currentDay', 'estimatedDaysToPeak', 'message'],
        },
        HistoryEntry: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
            score: { type: 'number' },
            stage: {
              type: 'string',
              enum: ['Emerging', 'Growth', 'Peak', 'Decline', 'Dormant'],
            },
          },
          required: ['date', 'score', 'stage'],
        },
        StockThemesResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/StockThemeItem' },
            },
          },
          required: ['success', 'data'],
        },
        StockThemeItem: {
          type: 'object',
          properties: {
            themeId: { type: 'string', format: 'uuid' },
            themeName: { type: 'string' },
            themeNameEn: { type: 'string', nullable: true },
            score: { type: 'number' },
            stage: {
              type: 'string',
              enum: ['Emerging', 'Growth', 'Peak', 'Decline', 'Dormant'],
            },
            stageKo: { type: 'string' },
            isReigniting: { type: 'boolean' },
            relevance: { type: 'string', nullable: true },
            source: { type: 'string', nullable: true },
            updatedAt: { type: 'string', nullable: true },
          },
          required: [
            'themeId',
            'themeName',
            'score',
            'stage',
            'stageKo',
            'isReigniting',
          ],
        },
        AiSummary: {
          type: 'object',
          description: 'LLM-optimized market summary with natural language descriptions',
          properties: {
            service: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                url: { type: 'string', format: 'uri' },
              },
            },
            generatedAt: { type: 'string', format: 'date' },
            marketOverview: {
              type: 'object',
              properties: {
                totalActiveThemes: { type: 'integer' },
                stageDistribution: {
                  type: 'object',
                  properties: {
                    peak: { type: 'integer' },
                    growth: { type: 'integer' },
                    emerging: { type: 'integer' },
                    decline: { type: 'integer' },
                    reigniting: { type: 'integer' },
                  },
                },
                averageScore: { type: 'number' },
                description: { type: 'string' },
              },
            },
            topThemes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  nameEn: { type: 'string', nullable: true },
                  score: { type: 'number' },
                  stage: { type: 'string' },
                  change7d: { type: 'number' },
                  topStocks: { type: 'array', items: { type: 'string' } },
                  newsCount7d: { type: 'integer' },
                  detailUrl: { type: 'string', format: 'uri' },
                  summary: { type: 'string' },
                },
              },
            },
            endpoints: {
              type: 'object',
              description: 'Available API endpoints for deeper queries',
              properties: {
                ranking: { type: 'string', format: 'uri' },
                themes: { type: 'string', format: 'uri' },
                themeDetail: { type: 'string', description: 'Template: replace {id} with theme UUID' },
                themeHistory: { type: 'string', description: 'Template: replace {id} with theme UUID' },
                stockThemes: { type: 'string', description: 'Template: replace {symbol} with 6-digit stock code' },
                openapi: { type: 'string', format: 'uri' },
              },
            },
            citation: {
              type: 'object',
              properties: {
                source: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                dataDate: { type: 'string', format: 'date' },
                license: { type: 'string' },
              },
            },
            disclaimer: { type: 'string' },
          },
        },
      },
    },
  }

  return NextResponse.json(spec, {
    headers: { 'Cache-Control': 'public, s-maxage=86400' },
  })
}
