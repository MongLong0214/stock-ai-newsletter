# stockmatrix-mcp

MCP server for Korean stock market theme lifecycle analysis. Provides real-time theme scores, lifecycle stages, related stocks, and news for 250+ KOSPI/KOSDAQ investment themes.

## Installation

```bash
npx -y stockmatrix-mcp
```

## Configuration

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

### Cursor

Add to `.cursor/mcp.json`:

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

### VS Code

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

## Available Tools

### `get_theme_ranking`

한국 주식시장 테마 생명주기 랭킹을 조회합니다. Retrieves theme lifecycle rankings by stage.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stage` | string | No | Filter by stage: `emerging`, `growth`, `peak`, `decline`, `reigniting` |

### `get_theme_detail`

특정 테마의 상세 정보를 조회합니다. Gets detailed theme info including score, stage, related stocks, and news.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme_id` | string (UUID) | Yes | Theme UUID |

### `get_theme_history`

테마의 최근 30일 점수 이력을 조회합니다. Returns 30-day score history for a theme.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme_id` | string (UUID) | Yes | Theme UUID |

### `search_themes`

테마를 검색합니다. Searches themes by name in Korean or English.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query (e.g. `"AI"`, `"반도체"`, `"삼성전자"`) |

### `get_stock_theme`

특정 종목이 속한 테마를 조회합니다. Finds themes related to a specific stock code.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `symbol` | string | Yes | 6-digit Korean stock code (e.g. `"005930"` for Samsung) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCKMATRIX_API_URL` | `https://stockmatrix.co.kr` | API base URL |

## Examples

**"What are the hottest stock themes in Korea right now?"**
→ `get_theme_ranking` with `stage: "growth"`

**"Tell me about the semiconductor theme"**
→ `search_themes` with `query: "반도체"` → `get_theme_detail` with the returned theme ID

**"What themes is Samsung Electronics part of?"**
→ `get_stock_theme` with `symbol: "005930"`

## Data Sources

- Naver DataLab search interest trends
- Naver Finance theme stock data
- Naver News article collection
- KRX (Korea Exchange) market data

## License

MIT

## Links

- [Website](https://stockmatrix.co.kr)
- [Developer Guide](https://stockmatrix.co.kr/developers)
- [GitHub](https://github.com/MongLong0214/stock-ai-newsletter)
- [llms.txt](https://stockmatrix.co.kr/llms.txt)
