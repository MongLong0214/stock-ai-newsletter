'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Terminal, Package, Code, ExternalLink, Copy, Check } from 'lucide-react'

const TOOLS = [
  {
    name: 'get_theme_ranking',
    description: '테마 생명주기 랭킹 조회',
    descEn: 'Theme lifecycle rankings by stage',
    params: [{ name: 'stage', type: 'string?', desc: 'emerging | growth | peak | decline | reigniting' }],
  },
  {
    name: 'get_theme_detail',
    description: '테마 상세 정보 조회',
    descEn: 'Theme details: score, stage, stocks, news',
    params: [{ name: 'theme_id', type: 'string (UUID)', desc: '테마 UUID' }],
  },
  {
    name: 'get_theme_history',
    description: '테마 30일 점수 이력',
    descEn: '30-day score history for trend analysis',
    params: [{ name: 'theme_id', type: 'string (UUID)', desc: '테마 UUID' }],
  },
  {
    name: 'search_themes',
    description: '테마 검색 (이름/종목명)',
    descEn: 'Search themes by Korean or English name',
    params: [{ name: 'query', type: 'string', desc: '"AI", "반도체", "삼성전자"' }],
  },
  {
    name: 'get_stock_theme',
    description: '종목 코드로 관련 테마 조회',
    descEn: 'Find themes by 6-digit stock code',
    params: [{ name: 'symbol', type: 'string', desc: '"005930" (삼성전자)' }],
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
] as const

const fadeIn = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
}

const easing = [0.25, 0.46, 0.45, 0.94] as const

const CopyButton = ({ text }: { text: string }) => {
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

const DevelopersContent = () => {
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
          <p className="text-lg text-slate-300 font-light tracking-wide leading-relaxed">
            AI 에이전트에서 한국 주식 테마 생명주기 데이터를 직접 조회하세요
          </p>
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
          <div className="flex gap-2 mb-4">
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

        {/* Available Tools */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.2, ease: easing }}
          className="mb-16"
        >
          <div className="flex items-center gap-3 mb-6">
            <Package className="w-5 h-5 text-emerald-400" aria-hidden="true" />
            <h2 className="text-xl font-light text-white">사용 가능한 도구</h2>
          </div>

          <div className="space-y-4">
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
              Node.js 18+ 필요 · 환경변수 없이 바로 실행 가능
            </p>
          </div>
        </motion.div>

        {/* Resources */}
        <motion.div
          {...fadeIn}
          transition={{ duration: 0.4, delay: 0.4, ease: easing }}
        >
          <h2 className="text-xl font-light text-white mb-4">리소스</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              href="/llms.txt"
              className="group flex items-center gap-3 bg-slate-800/50 border border-slate-700/30 rounded-xl px-4 py-3 hover:border-emerald-500/30 transition-all duration-300"
            >
              <Terminal className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" aria-hidden="true" />
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
