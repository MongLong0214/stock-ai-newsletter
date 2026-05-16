import { NextResponse } from 'next/server'

import { siteConfig } from '@/lib/constants/seo/config'
import { withRateLimit } from '@/lib/rate-limit/with-rate-limit'

// Rate limit: uses checkRateLimit('standard') via withRateLimit wrapper
export const GET = withRateLimit('standard', async () => {
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
          parameters: [
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum number of themes per stage (1-50)',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
            {
              name: 'sort',
              in: 'query',
              required: false,
              description: 'Sort field for themes within each stage',
              schema: { type: 'string', enum: ['score', 'change7d', 'newsCount7d'], default: 'score' },
            },
          ],
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
      '/api/tli/stocks/search': {
        get: {
          operationId: 'searchStocks',
          summary: 'Search stocks by company name or symbol',
          description:
            'Returns matching Korean stocks with symbol, market, number of related themes, and top related themes ranked by current TLI score.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'Company name or stock code (e.g. "삼성전자", "SK하이닉스", "005930")',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'List of matching stocks',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [true] },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/StockSearchItem' },
                      },
                    },
                    required: ['success', 'data'],
                  },
                },
              },
            },
            '400': {
              description: 'Missing query',
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
      '/api/tli/changes': {
        get: {
          operationId: 'getThemeChanges',
          summary: 'Get daily/weekly theme score movers and stage transitions',
          description:
            'Returns top rising/falling themes by score change, stage transitions, and newly emerging themes for the given period.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              required: false,
              description: 'Time period for changes',
              schema: { type: 'string', enum: ['1d', '7d'], default: '1d' },
            },
          ],
          responses: {
            '200': {
              description: 'Theme changes summary',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ThemeChangesResponse' },
                },
              },
            },
          },
        },
      },
      '/api/tli/compare': {
        get: {
          operationId: 'compareThemes',
          summary: 'Side-by-side comparison of 2-5 themes',
          description:
            'Returns detailed comparison of selected themes including scores, stocks, sparklines, pairwise similarity, and overlapping stocks.',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              required: true,
              description: 'Comma-separated theme UUIDs (2-5 required)',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Theme comparison result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ThemeComparisonResponse' },
                },
              },
            },
            '400': {
              description: 'Invalid or insufficient theme IDs',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/tli/predictions': {
        get: {
          operationId: 'getPredictions',
          summary: 'Get theme predictions based on v4 forecast system',
          description:
            'Returns prediction themes with phase forecasts (rising/hot/cooling), confidence levels, historical analog matching, and expected peak timing.',
          parameters: [
            {
              name: 'phase',
              in: 'query',
              required: false,
              description: 'Filter by prediction phase',
              schema: { type: 'string', enum: ['rising', 'hot', 'cooling'] },
            },
          ],
          responses: {
            '200': {
              description: 'Prediction themes',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PredictionResponse' },
                },
              },
            },
          },
        },
      },
      '/api/tli/methodology': {
        get: {
          operationId: 'getMethodology',
          summary: 'Get TLI algorithm documentation',
          description:
            'Returns detailed methodology documentation for the TLI scoring system. Supports section-level filtering for focused queries.',
          parameters: [
            {
              name: 'section',
              in: 'query',
              required: false,
              description: 'Specific section to retrieve',
              schema: {
                type: 'string',
                enum: ['scoring', 'stabilization', 'stages', 'comparison', 'prediction', 'data_sources', 'update_schedule', 'runtime', 'data_flow', 'database_tables', 'limitations', 'all'],
                default: 'all',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Methodology documentation',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MethodologyResponse' },
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
            signals: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeSignalCard' },
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
            trackedThemes: { type: 'integer' },
            visibleThemes: { type: 'integer' },
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
            'trackedThemes',
            'visibleThemes',
            'byStage',
            'hottestTheme',
            'surging',
            'avgScore',
          ],
        },
        ThemeSignalCard: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              enum: ['movers', 'peak', 'emerging', 'reigniting'],
            },
            title: { type: 'string' },
            themes: {
              type: 'array',
              items: { $ref: '#/components/schemas/ThemeSignalItem' },
            },
          },
          required: ['key', 'title', 'themes'],
        },
        ThemeSignalItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            detail: { type: 'string' },
          },
          required: ['id', 'name', 'detail'],
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
            relevanceProbability: {
              type: 'number',
              nullable: true,
              description: 'Calibrated relevance probability from an approved level-4 artifact',
            },
            probabilityCiLower: {
              type: 'number',
              nullable: true,
              description: 'Lower bound of the relevance probability confidence interval',
            },
            probabilityCiUpper: {
              type: 'number',
              nullable: true,
              description: 'Upper bound of the relevance probability confidence interval',
            },
            supportCount: {
              type: 'integer',
              nullable: true,
              description: 'Effective support sample size used for calibration',
            },
            confidenceTier: {
              type: 'string',
              nullable: true,
              enum: ['high', 'medium', 'low'],
              description: 'Level-4 confidence tier derived from support count and CI width',
            },
            calibrationVersion: {
              type: 'string',
              nullable: true,
              description: 'Version identifier of the calibration artifact used for serving',
            },
            weightVersion: {
              type: 'string',
              nullable: true,
              description: 'Version identifier of the weight artifact used for serving',
            },
            sourceSurface: {
              type: 'string',
              nullable: true,
              enum: ['legacy_diagnostic', 'v2_certification', 'replay_equivalent'],
              description: 'Source surface that produced the serving artifact',
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
        StockSearchItem: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: '6-digit stock code' },
            name: { type: 'string', description: 'Company name' },
            market: { type: 'string', description: 'Exchange/market label' },
            themeCount: { type: 'integer', description: 'Number of related themes found' },
            topThemes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  themeId: { type: 'string', format: 'uuid' },
                  themeName: { type: 'string' },
                  themeNameEn: { type: 'string', nullable: true },
                  score: { type: 'number' },
                  stage: { type: 'string' },
                  stageKo: { type: 'string' },
                  isReigniting: { type: 'boolean' },
                  updatedAt: { type: 'string', nullable: true },
                },
                required: ['themeId', 'themeName', 'score', 'stage', 'stageKo', 'isReigniting'],
              },
            },
          },
          required: ['symbol', 'name', 'market', 'themeCount', 'topThemes'],
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
        ThemeChangesResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                period: { type: 'string', enum: ['1d', '7d'] },
                generatedAt: { type: 'string', format: 'date-time' },
                movers: {
                  type: 'object',
                  properties: {
                    rising: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          score: { type: 'number' },
                          change: { type: 'number' },
                          stage: { type: 'string' },
                        },
                        required: ['id', 'name', 'score', 'change', 'stage'],
                      },
                    },
                    falling: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          name: { type: 'string' },
                          score: { type: 'number' },
                          change: { type: 'number' },
                          stage: { type: 'string' },
                        },
                        required: ['id', 'name', 'score', 'change', 'stage'],
                      },
                    },
                  },
                  required: ['rising', 'falling'],
                },
                stageTransitions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string' },
                      fromStage: { type: 'string' },
                      toStage: { type: 'string' },
                      score: { type: 'number' },
                    },
                    required: ['id', 'name', 'fromStage', 'toStage', 'score'],
                  },
                },
                newlyEmerging: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string' },
                      score: { type: 'number' },
                      stage: { type: 'string' },
                    },
                    required: ['id', 'name', 'score', 'stage'],
                  },
                },
              },
              required: ['period', 'generatedAt', 'movers', 'stageTransitions', 'newlyEmerging'],
            },
          },
          required: ['success', 'data'],
        },
        ThemeComparisonResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                themes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string' },
                      nameEn: { type: 'string', nullable: true },
                      score: { type: 'number' },
                      stage: { type: 'string' },
                      stageKo: { type: 'string' },
                      change7d: { type: 'number' },
                      stockCount: { type: 'integer' },
                      topStocks: { type: 'array', items: { type: 'string' } },
                      sparkline: { type: 'array', items: { type: 'number' } },
                      newsCount7d: { type: 'integer' },
                    },
                    required: ['id', 'name', 'score', 'stage', 'stageKo', 'change7d', 'stockCount'],
                  },
                },
                pairwiseSimilarity: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      themeA: { type: 'string', format: 'uuid' },
                      themeB: { type: 'string', format: 'uuid' },
                      similarity: { type: 'number' },
                    },
                    required: ['themeA', 'themeB', 'similarity'],
                  },
                },
                overlappingStocks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      symbol: { type: 'string' },
                      name: { type: 'string' },
                      themes: { type: 'array', items: { type: 'string', format: 'uuid' } },
                    },
                    required: ['symbol', 'name', 'themes'],
                  },
                },
                warnings: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['themes', 'pairwiseSimilarity', 'overlappingStocks', 'warnings'],
            },
          },
          required: ['success', 'data'],
        },
        PredictionResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                phase: { type: 'string', nullable: true, description: 'Filtered phase or null for all' },
                dataSource: { type: 'string', description: 'Prediction model version' },
                themes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string' },
                      score: { type: 'number' },
                      stage: { type: 'string' },
                      prediction: {
                        type: 'object',
                        properties: {
                          phase: { type: 'string', enum: ['rising', 'hot', 'cooling'] },
                          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                          daysSinceEpisodeStart: { type: 'integer' },
                          expectedPeakDay: { type: 'integer', nullable: true },
                          topAnalog: {
                            type: 'object',
                            nullable: true,
                            properties: {
                              name: { type: 'string' },
                              similarity: { type: 'number' },
                            },
                          },
                          evidenceQuality: { type: 'string', enum: ['strong', 'moderate', 'weak'] },
                        },
                        required: ['phase', 'confidence', 'daysSinceEpisodeStart', 'evidenceQuality'],
                      },
                    },
                    required: ['id', 'name', 'score', 'stage', 'prediction'],
                  },
                },
              },
              required: ['phase', 'dataSource', 'themes'],
            },
          },
          required: ['success', 'data'],
        },
        MethodologyResponse: {
          type: 'object',
          description: 'TLI algorithm methodology documentation. Returns full or section-specific content.',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                section: { type: 'string', description: 'Requested section name or "all"' },
                content: {
                  type: 'object',
                  description: 'Methodology content keyed by section name',
                  additionalProperties: true,
                },
              },
              required: ['section', 'content'],
            },
          },
          required: ['success', 'data'],
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
                trackedThemes: { type: 'integer' },
                visibleThemes: { type: 'integer' },
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
})
