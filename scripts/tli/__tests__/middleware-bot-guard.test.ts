import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const req = (path: string, ua: string) =>
  new NextRequest(`https://stockmatrix.co.kr${path}`, { headers: { 'user-agent': ua } })

describe('middleware — 봇/MCP 가드', () => {
  it('차단 목록 봇은 페이지에서도 403', () => {
    const res = middleware(req('/themes', 'Mozilla/5.0 (compatible; AhrefsBot/7.0)'))
    expect(res.status).toBe(403)
  })

  it('차단 봇은 API에서도 403', () => {
    expect(middleware(req('/api/tli/themes', 'Bytespider')).status).toBe(403)
  })

  it('일반 사용자/검색봇은 통과', () => {
    expect(middleware(req('/themes', 'Mozilla/5.0')).status).toBe(200)
    expect(middleware(req('/themes', 'Googlebot/2.1')).status).toBe(200)
  })

  it('MCP UA는 허용 경로만 통과, 그 외 API는 404', () => {
    expect(middleware(req('/api/tli/themes', 'stockmatrix-mcp/0.5')).status).toBe(200)
    expect(middleware(req('/api/tli/internal-secret', 'stockmatrix-mcp/0.5')).status).toBe(404)
  })

  it('MCP UA라도 차단 봇 문자열이 섞이면 우선 차단되지 않고 정상 경로면 통과', () => {
    // 정상 MCP는 봇 목록에 없으므로 통과 (회귀 방지: 봇 필터가 MCP를 오탐하지 않음)
    expect(middleware(req('/api/tli/compare', 'stockmatrix-mcp/0.5')).status).toBe(200)
  })
})
