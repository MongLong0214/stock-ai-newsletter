'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Terminal,
  Package,
  Code,
  ExternalLink,
  Copy,
  Check,
  Search,
  BarChart3,
  GitBranch,
  BookOpen,
  MessageSquare,
} from 'lucide-react'
import Link from 'next/link'

const TOOLS = [
  {
    name: 'get_market_summary',
    description: '시장 요약 브리핑',
    descEn: 'AI-optimized market overview with top themes and stage distribution',
    params: [],
  },
  {
    name: 'get_theme_ranking',
    description: '테마 생명주기 랭킹 조회',
    descEn: 'Theme lifecycle rankings filtered by stage, with sort and limit control',
    params: [
      { name: 'stage', type: 'string?', desc: 'emerging | growth | peak | decline | reigniting' },
      { name: 'limit', type: 'number?', desc: '1-50 (default 10)' },
      { name: 'sort', type: 'string?', desc: 'score | change7d | newsCount7d' },
    ],
  },
  {
    name: 'search_themes',
    description: '테마 검색 (이름/종목명/종목코드)',
    descEn: 'Search themes by keyword, stock name, or stock code',
    params: [
      { name: 'query', type: 'string', desc: '"AI", "반도체", "삼성전자", "005930"' },
    ],
  },
  {
    name: 'search_stocks',
    description: '종목 검색 + 6자리 코드 자동 테마 조회',
    descEn: 'Search stocks by name or code — 6-digit codes auto-resolve to theme detail (integrates get_stock_theme)',
    params: [
      { name: 'query', type: 'string', desc: '"삼성전자", "SK하이닉스", "005930"' },
    ],
  },
  {
    name: 'get_theme_detail',
    description: '테마 상세 분석',
    descEn: 'Score breakdown, prediction, stocks, news, comparisons',
    params: [
      { name: 'theme_id', type: 'string (UUID)', desc: '랭킹/검색 결과에서 획득' },
    ],
  },
  {
    name: 'get_theme_history',
    description: '테마 30일 점수 이력',
    descEn: '30-day score history for trend analysis',
    params: [
      { name: 'theme_id', type: 'string (UUID)', desc: '랭킹/검색 결과에서 획득' },
    ],
  },
  {
    name: 'get_theme_changes',
    description: '일간/주간 테마 변동 리포트',
    descEn: 'Score changes, stage transitions, newly emerging themes by period',
    params: [
      { name: 'period', type: 'string?', desc: '1d | 7d (default 1d)' },
    ],
  },
  {
    name: 'compare_themes',
    description: '테마 병렬 비교',
    descEn: '2-5 themes side-by-side — scores, stocks, sparkline, mutual similarity',
    params: [
      { name: 'theme_ids', type: 'string[] (UUID)', desc: '2~5개 테마 ID 배열' },
    ],
  },
  {
    name: 'get_predictions',
    description: '테마 예측 조회',
    descEn: 'Predicted themes based on historical pattern matching — rising/hot/cooling outlook',
    params: [
      { name: 'phase', type: 'string?', desc: 'rising | hot | cooling' },
    ],
  },
  {
    name: 'get_methodology',
    description: 'TLI 알고리즘/파이프라인 문서 조회',
    descEn: 'Scoring, stages, runtime pipeline, data sources, and methodology (fetched from API)',
    params: [
      { name: 'section', type: 'string?', desc: 'scoring | stabilization | stages | comparison | prediction | data_sources | update_schedule | runtime | data_flow | database_tables | limitations | all' },
    ],
  },
] as const

const CONFIG_TABS = [
  {
    label: 'Claude Desktop',
    file: '~/Library/Application Support/Claude/claude_desktop_config.json',
    code: `{
  "mcpServers": {
    "stockmatrix": {
      "command": "npx",
      "args": ["-y", "stockmatrix-mcp"]
    }
  }
}`,
  },
  {
    label: 'Cursor',
    file: '.cursor/mcp.json',
    code: `{
  "mcpServers": {
    "stockmatrix": {
      "command": "npx",
      "args": ["-y", "stockmatrix-mcp"]
    }
  }
}`,
  },
  {
    label: 'VS Code',
    file: '.vscode/mcp.json',
    code: `{
  "servers": {
    "stockmatrix": {
      "command": "npx",
      "args": ["-y", "stockmatrix-mcp"]
    }
  }
}`,
  },
  {
    label: 'Claude Code',
    file: '.claude/settings.json',
    code: `{
  "mcpServers": {
    "stockmatrix": {
      "command": "npx",
      "args": ["-y", "stockmatrix-mcp"]
    }
  }
}`,
  },
] as const

const EXAMPLE_PROMPTS = [
  { prompt: '오늘 한국 테마 시장 요약해줘', result: '시장 개요 + 상위 테마 + 단계 분포' },
  { prompt: '요즘 한국 주식시장에서 뜨는 테마 뭐야?', result: '점수 기준 상위 테마 랭킹' },
  { prompt: 'AI 관련 테마 찾아줘', result: 'AI 키워드 매칭 테마 목록' },
  { prompt: '반도체 테마 최근 한달 추세 어때?', result: '30일 점수 이력 + 추세 분석' },
  { prompt: '삼성전자가 속한 테마 알려줘', result: '005930 관련 테마 + 점수/단계' },
  { prompt: '삼성전자 종목 코드부터 찾아줘', result: '회사명으로 종목 검색 + 관련 테마 미리보기' },
  { prompt: '어제 대비 가장 많이 오른 테마는?', result: '일간 점수 변동 상위 테마' },
  { prompt: '반도체 vs 2차전지 비교해줘', result: '테마 병렬 비교 — 점수, 종목, 유사도' },
  { prompt: '앞으로 오를 테마 알려줘', result: '과거 패턴 기반 상승 전망 테마' },
  { prompt: '이번 주 스테이지 전환된 테마', result: '주간 단계 전환 + 신규 이머징 리포트' },
  { prompt: 'TLI 점수는 어떻게 계산돼?', result: '알고리즘 전체 문서' },
  { prompt: 'What are the hottest themes in Korea?', result: 'English supported' },
] as const

const SCORE_COMPONENTS = [
  { name: '검색 관심', weight: '30.4%', color: 'text-emerald-400', source: 'Naver DataLab' },
  { name: '뉴스 모멘텀', weight: '36.6%', color: 'text-sky-400', source: 'Naver News' },
  { name: '변동성', weight: '10.4%', color: 'text-purple-400', source: '관심도 시계열' },
  { name: '활동성', weight: '22.6%', color: 'text-amber-400', source: 'Naver Finance' },
] as const

const LIFECYCLE_STAGES = [
  { name: 'Emerging', nameKo: '초기', color: 'bg-blue-400' },
  { name: 'Growth', nameKo: '성장', color: 'bg-emerald-400' },
  { name: 'Peak', nameKo: '정점', color: 'bg-red-400' },
  { name: 'Decline', nameKo: '하락', color: 'bg-amber-400' },
  { name: 'Reigniting', nameKo: '재점화', color: 'bg-orange-400' },
] as const

const fadeIn = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
}

const easing = [0.25, 0.46, 0.45, 0.94] as const

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-3 right-3 p-1.5 rounded-md bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/30 transition-colors"
      aria-label="코드 복사"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-slate-400" />
      )}
    </button>
  )
}

function DevelopersContent() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <section
      className="relative py-8 lg:py-20 px-6 lg:px-8"
      aria-labelledby="developers-heading"
    >
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Hero */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0, ease: easing }}
          className="text-center mb-16"
        >
          <p className="text-sm text-emerald-500 uppercase tracking-wider mb-4 font-medium">
            Developers
          </p>
          <h1
            id="developers-heading"
            className="text-3xl md:text-4xl font-extralight text-emerald-500/80 tracking-tight mb-4"
          >
            MCP 서버
          </h1>
          <p className="text-lg text-slate-300 font-light tracking-wide leading-relaxed max-w-2xl mx-auto">
            10개 도구로 250+ 한국 주식 테마의 생명주기 점수, 예측, 비교, 변동을 자연어로 조회하세요
          </p>
        </motion.div>

        {/* Algorithm Overview */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.05, ease: easing }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <h2 className="text-xl font-light text-white">TLI 알고리즘</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Score Components */}
            <div className="bg-slate-800/50 border border-slate-700/30 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">점수 산출 (0-100)</h3>
              <div className="space-y-2.5">
                {SCORE_COMPONENTS.map((comp) => (
                  <div key={comp.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-mono font-bold ${comp.color}`}>
                        {comp.weight}
                      </span>
                      <span className="text-sm text-slate-300">{comp.name}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">{comp.source}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-700/30">
                가중치는 Bayesian Optimization으로 도출
              </p>
            </div>

            {/* Lifecycle Stages */}
            <div className="bg-slate-800/50 border border-slate-700/30 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-white mb-3">생명주기 단계</h3>
              <div className="space-y-2.5">
                {LIFECYCLE_STAGES.map((stage) => (
                  <div key={stage.name} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${stage.color} shrink-0`} />
                    <span className="text-sm text-slate-300">{stage.nameKo}</span>
                    <span className="text-xs text-slate-500 font-mono">{stage.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-700/30">
                2일 연속 확인 후 단계 전환 (Hysteresis)
              </p>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-700/20 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 text-center">
              점수 안정화: Cautious Decay (3-signal 다수결) → Bollinger Clamp → 적응형 EMA ·{' '}
              <Link href="/themes/methodology" className="text-emerald-400/80 hover:text-emerald-400 transition-colors">
                상세 알고리즘 →
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Installation */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.1, ease: easing }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <Terminal className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <h2 className="text-xl font-light text-white">설치 방법</h2>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {CONFIG_TABS.map((tab, i) => (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
                  activeTab === i
                    ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-slate-800/30 text-slate-400 border border-slate-700/30 hover:border-slate-600/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Code Block */}
          <div className="bg-slate-900/60 border border-slate-700/30 rounded-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-700/30 flex items-center gap-2">
              <Code className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span className="text-xs text-slate-500 font-mono">
                {CONFIG_TABS[activeTab].file}
              </span>
            </div>
            <div className="relative p-4">
              <pre className="text-sm text-slate-300 font-mono overflow-x-auto leading-relaxed">
                {CONFIG_TABS[activeTab].code}
              </pre>
              <CopyButton text={CONFIG_TABS[activeTab].code} />
            </div>
          </div>
        </motion.div>

        {/* Try Asking */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.15, ease: easing }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <h2 className="text-xl font-light text-white">이렇게 물어보세요</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {EXAMPLE_PROMPTS.map((example) => (
              <div
                key={example.prompt}
                className="bg-slate-800/30 border border-slate-700/20 rounded-xl px-4 py-3"
              >
                <p className="text-sm text-slate-200 mb-1">{example.prompt}</p>
                <p className="text-[11px] text-slate-500">→ {example.result}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Available Tools */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.2, ease: easing }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <Package className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <h2 className="text-xl font-light text-white">사용 가능한 도구</h2>
            <span className="text-xs text-slate-500 font-mono ml-auto">{TOOLS.length} tools</span>
          </div>

          <div className="space-y-3">
            {TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="bg-slate-800/50 border border-emerald-500/10 rounded-2xl p-5 hover:border-emerald-500/30 transition-all duration-300"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <code className="text-emerald-400 text-sm font-mono font-medium">
                    {tool.name}
                  </code>
                </div>
                <p className="text-slate-300 text-sm mb-1">{tool.description}</p>
                <p className="text-slate-500 text-xs mb-3">{tool.descEn}</p>
                <div className="space-y-1">
                  {tool.params.map((param) => (
                    <div key={param.name} className="flex items-baseline gap-2 text-xs">
                      <code className="text-sky-400/80 font-mono">{param.name}</code>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-500 font-mono">{param.type}</span>
                      <span className="text-slate-600">—</span>
                      <span className="text-slate-400">{param.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Response Context */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.25, ease: easing }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <BookOpen className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <h2 className="text-xl font-light text-white">AI 컨텍스트 주입</h2>
          </div>

          <div className="bg-slate-900/60 border border-slate-700/30 rounded-2xl p-5">
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              모든 응답에 알고리즘 컨텍스트 헤더가 자동으로 포함됩니다.
              AI 에이전트가 점수, 단계, 가중치의 의미를 이해하고 정확하게 해석할 수 있습니다.
            </p>
            <div className="bg-slate-950/50 border border-slate-700/20 rounded-xl p-4">
              <pre className="text-xs text-slate-400 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">{`[StockMatrix TLI v0.4.0]
Scores: 0-100 (Bayesian-optimized weighted sum of 4 components:
  interest 30%, news momentum 37%, volatility 10%, activity 23%).
Stages: Emerging → Growth → Peak → Decline → Dormant
  (with possible Reigniting).
Stage transitions require 2 consecutive days (hysteresis).

signals: { surging: [...], hottestTheme: {...} }
themeId: "uuid" — chain with get_theme_detail, compare_themes

{ "emerging": [...], "growth": [...], ... }`}</pre>
            </div>
          </div>
        </motion.div>

        {/* npm Package */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.3, ease: easing }}
          className="mb-16"
        >
          <h2 className="text-xl font-light text-white mb-4">npm 패키지</h2>
          <div className="bg-slate-900/60 border border-slate-700/30 rounded-2xl p-5">
            <div className="relative">
              <pre className="text-sm text-slate-300 font-mono">
                npx -y stockmatrix-mcp
              </pre>
              <CopyButton text="npx -y stockmatrix-mcp" />
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Node.js 18+ 필요 · 환경변수 없이 바로 실행 가능 · MIT 라이선스
            </p>
          </div>
        </motion.div>

        {/* Resources */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.35, ease: easing }}
        >
          <h2 className="text-xl font-light text-white mb-4">리소스</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href="https://www.npmjs.com/package/stockmatrix-mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 bg-slate-800/50 border border-slate-700/30 rounded-xl px-4 py-3 hover:border-emerald-500/30 transition-all duration-300"
            >
              <Package className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" aria-hidden="true" />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">npm</span>
              <ExternalLink className="w-3 h-3 text-slate-600 ml-auto" aria-hidden="true" />
            </a>
            <a
              href="https://github.com/MongLong0214/stock-ai-newsletter/tree/main/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 bg-slate-800/50 border border-slate-700/30 rounded-xl px-4 py-3 hover:border-emerald-500/30 transition-all duration-300"
            >
              <GitBranch className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" aria-hidden="true" />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">GitHub</span>
              <ExternalLink className="w-3 h-3 text-slate-600 ml-auto" aria-hidden="true" />
            </a>
            <a
              href="/llms.txt"
              className="group flex items-center gap-3 bg-slate-800/50 border border-slate-700/30 rounded-xl px-4 py-3 hover:border-emerald-500/30 transition-all duration-300"
            >
              <Search className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" aria-hidden="true" />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">llms.txt</span>
              <ExternalLink className="w-3 h-3 text-slate-600 ml-auto" aria-hidden="true" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default DevelopersContent
