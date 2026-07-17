# stockmatrix-mcp

Ask about Korean stock market themes in natural conversation with AI. Track 250+ KOSPI/KOSDAQ investment themes, get daily movers, look up which themes a stock belongs to, compare themes side-by-side, and see predictions — all through Claude, Cursor, or any MCP-compatible AI agent.

Powered by **TLI (Theme Lifecycle Index)** — a Bayesian-optimized scoring algorithm combining search interest, news momentum, market volatility, and stock activity into a 0-100 score with lifecycle stage classification.

**11 tools + 4 one-click workflow prompts + live resources.** Try the `market_briefing` slash command for an instant Korean market overview.

## Quick Start

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stockmatrix": {
      "command": "npx",
      "args": ["-y", "stockmatrix-mcp"]
    }
  }
}
```

### Cursor / Windsurf

Add to `.cursor/mcp.json` or `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "stockmatrix": {
      "command": "npx",
      "args": ["-y", "stockmatrix-mcp"]
    }
  }
}
```

### VS Code / Claude Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "stockmatrix": {
      "command": "npx",
      "args": ["-y", "stockmatrix-mcp"]
    }
  }
}
```

## Try Asking

After setup, just ask in natural language:

| Prompt | What happens |
|--------|-------------|
| "요즘 뜨는 테마 TOP 5" | Top 5 themes ranked by TLI score |
| "오늘 한국 테마 시장 요약해줘" | AI-optimized market overview |
| "어제 대비 가장 많이 오른 테마는?" | Daily score movers and stage transitions |
| "AI 관련 테마 찾아줘" | Search AI-related themes |
| "반도체 vs 2차전지 비교해줘" | Side-by-side theme comparison |
| "앞으로 오를 테마 알려줘" | Rising predictions with analog evidence |
| "삼성전자가 속한 테마" | Stock-to-theme lookup (auto-detects 6-digit codes) |
| "방산 테마 상세 정보" | Score breakdown, stocks, news, comparisons |
| "반도체 테마 최근 한달 추세" | 30-day score history |
| "TLI 점수는 어떻게 계산돼?" | Algorithm methodology (tip: use `section=scoring` to save tokens) |
| "What are the hottest stock themes in Korea?" | Works in English too |

## Available Tools

### `get_theme_ranking`
Get theme rankings by lifecycle stage with limit and sort options.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stage` | string | No | `emerging` / `growth` / `peak` / `decline` / `reigniting` |
| `limit` | number | No | Results per stage (1-50, default: 10) |
| `sort` | string | No | `score` / `change7d` / `newsCount7d` (default: score) |

### `get_market_summary`
Get an AI-optimized market overview with top themes (includes themeId for chaining).

### `get_theme_changes`
Get daily or weekly score movers, stage transitions, and newly emerging themes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `period` | string | No | `1d` (default) / `7d` |

### `compare_themes`
Compare 2-5 themes side-by-side with scores, stocks, sparklines, and similarity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme_ids` | string[] | Yes | Array of 2-5 theme UUIDs |

### `get_predictions`
Get themes predicted to rise, peak, or cool based on historical analog matching.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `phase` | string | No | `rising` / `hot` / `cooling` (default: all) |

### `search_themes`
Search themes by keyword, stock name, or stock code.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | e.g. `"AI"`, `"반도체"`, `"삼성전자"`, `"005930"` |

### `search_stocks`
Search stocks by company name or 6-digit code, with related theme preview. Automatically performs stock-to-theme lookup for 6-digit codes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | e.g. `"삼성전자"`, `"SK하이닉스"`, `"005930"` |

### `get_stock_themes`
Reverse lookup — every theme a stock belongs to, ranked by theme score, each with lifecycle stage and the stock's relevance. Answers "is my stock in a hot theme?"

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | 6-digit Korean stock code, e.g. `"005930"` (Samsung), `"000660"` (SK Hynix) |

### `get_theme_detail`
Get detailed analysis: score breakdown (4 components), stage, prediction, stocks, news, comparisons.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme_id` | string (UUID) | Yes | Theme UUID from ranking or search |

### `get_theme_history`
Get 30-day score history for trend analysis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme_id` | string (UUID) | Yes | Theme UUID |

### `get_methodology`
Get TLI algorithm documentation — scoring, stages, stabilization, comparison, prediction, data sources, and more.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section` | string | No | `scoring` / `stages` / `comparison` / `prediction` / `all` (default: all) |

> Tip: Use `section=scoring` to get just the scoring algorithm and save context tokens.

## Workflow Prompts

One-click slash commands (in Claude Desktop, Cursor, and other MCP clients) that run complete multi-tool analyses for you — the fastest way to get real value:

| Prompt | Argument | What it does |
|--------|----------|--------------|
| `market_briefing` | — | Today's Korean market theme briefing: mood, top themes, movers, takeaways |
| `theme_deep_dive` | `theme` | Full lifecycle analysis of one theme: score, 30-day trend, stocks, news, outlook |
| `find_investment_themes` | `interest` | Discover themes matching an interest, ranked by momentum and stage |
| `stock_theme_check` | `stock` | Check whether a stock (name or code) sits inside any hot or rising themes |

## Resources

Attachable read-only context (no tool call needed):

| URI | Description |
|-----|-------------|
| `stockmatrix://methodology` | How TLI scores and lifecycle stages are computed — weights and thresholds |
| `stockmatrix://rankings` | Live snapshot of today's theme rankings by score, grouped by stage |

## Scoring Algorithm

TLI scores (0-100) are a weighted sum of 4 components, optimized via Bayesian Optimization:

| Component | Weight | Source |
|-----------|--------|--------|
| Search Interest | 30.4% | Naver DataLab |
| News Momentum | 36.6% | Naver News |
| Volatility | 10.4% | Interest time-series |
| Stock Activity | 22.6% | Naver Finance |

Scores are stabilized through **Cautious Decay** (3-signal majority vote), **Bollinger Band Clamp** (limits daily change), and **Age-adaptive EMA** (newer themes react faster).

## Lifecycle Stages

```
Dormant -> Emerging -> Growth -> Peak -> Decline -> Dormant
                                          |
                                     Reigniting
```

Stage transitions require 2 consecutive days of the same candidate (hysteresis) and follow Markov transition constraints.

## Data Coverage

- **250+ themes** across KOSPI & KOSDAQ
- **Daily updates** — scores, news, stock mappings
- **Stock ↔ theme lookup** — by company name, 6-digit code, or reverse (stock → all its themes)
- **AI market summary** for first-call overview
- **Predictions** with historical analog matching
- **Workflow prompts** — one-click multi-tool analyses
- **Sources**: Naver DataLab, Naver Finance, Naver News

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCKMATRIX_API_URL` | `https://stockmatrix.co.kr` | Override API base URL |

## License

MIT

## Links

- [Website](https://stockmatrix.co.kr)
- [Developer Guide](https://stockmatrix.co.kr/developers)
- [llms.txt](https://stockmatrix.co.kr/llms.txt)
