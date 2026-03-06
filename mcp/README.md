# stockmatrix-mcp

MCP server for Korean stock market theme analysis. Track 250+ KOSPI/KOSDAQ investment themes with lifecycle scores, trend data, related stocks, and news — all through natural conversation with AI.

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
| "요즘 한국 주식시장에서 뜨는 테마 뭐야?" | Top trending themes with scores |
| "AI 관련 테마 찾아줘" | Search AI-related themes |
| "반도체 테마 최근 한달 추세 어때?" | 30-day score history |
| "삼성전자가 속한 테마 알려줘" | Themes linked to Samsung (005930) |
| "성장 단계인 테마만 보여줘" | Growth-stage themes only |
| "방산 테마 상세 정보" | Score, stocks, news for defense theme |
| "What are the hottest stock themes in Korea?" | Works in English too |
| "Which themes is SK Hynix (000660) part of?" | Stock-to-theme lookup |

## Available Tools

### `get_theme_ranking`

Get theme rankings by lifecycle stage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stage` | string | No | `emerging` / `growth` / `peak` / `decline` / `reigniting` |

### `search_themes`

Search themes by keyword (Korean or English).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | e.g. `"AI"`, `"반도체"`, `"2차전지"`, `"삼성전자"` |

### `get_theme_detail`

Get detailed info: score, stage, prediction, related stocks, news.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme_id` | string (UUID) | Yes | Theme UUID from ranking or search |

### `get_theme_history`

Get 30-day score history for trend analysis.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme_id` | string (UUID) | Yes | Theme UUID |

### `get_stock_theme`

Find themes a specific stock belongs to.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | 6-digit code, e.g. `"005930"` (Samsung), `"000660"` (SK Hynix) |

## Data Coverage

- **250+ themes** across KOSPI & KOSDAQ
- **Daily updates** — scores, news, stock mappings
- **Sources**: Naver DataLab, Naver Finance, Naver News, KRX

## License

MIT

## Links

- [Website](https://stockmatrix.co.kr)
- [Developer Guide](https://stockmatrix.co.kr/developers)
- [llms.txt](https://stockmatrix.co.kr/llms.txt)