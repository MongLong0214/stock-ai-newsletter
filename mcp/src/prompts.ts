import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/** GetPromptResult with a single user-role text message. */
const userPrompt = (text: string) => ({
  messages: [
    {
      role: 'user' as const,
      content: { type: 'text' as const, text },
    },
  ],
});

/**
 * Curated workflow prompts. These surface as one-click slash commands in MCP clients
 * (Claude Desktop, Cursor, …) and steer the agent through multi-tool workflows —
 * the fastest path from "installed" to "getting real value".
 */
export const registerPrompts = (server: McpServer): void => {
  server.registerPrompt(
    'market_briefing',
    {
      title: 'Korean Market Briefing',
      description:
        "Today's Korean stock market theme briefing — what's hot, what's moving, and where the momentum is.",
    },
    () =>
      userPrompt(
        `Give me a concise Korean stock market theme briefing for today using StockMatrix TLI data.

Steps:
1. Call get_market_summary for the overall market mood and headline signals.
2. Call get_theme_ranking (no stage filter, limit 8) to see the top themes by lifecycle score.
3. Call get_theme_changes to see today's biggest movers (rising and falling themes).

Then synthesize into a short briefing:
- Overall market mood in one line.
- Top 3-5 themes right now with their score, lifecycle stage, and why they matter.
- Notable movers (surging or fading) vs. yesterday.
- One or two actionable observations.

Keep it tight and skimmable. Use the theme scores and stages to justify each point, and note that scores are 0-100 TLI (Theme Lifecycle Index) values.`
      )
  );

  server.registerPrompt(
    'theme_deep_dive',
    {
      title: 'Theme Deep Dive',
      description:
        'Full lifecycle analysis of one Korean investment theme — score history, related stocks, news, and where it is headed.',
      argsSchema: {
        theme: z
          .string()
          .describe('Theme name or keyword (Korean or English), e.g. "AI", "반도체", "2차전지", "로봇"'),
      },
    },
    ({ theme }) =>
      userPrompt(
        `Do a full deep-dive on the Korean market theme "${theme}" using StockMatrix TLI data.

Steps:
1. Call search_themes with query "${theme}" to find the matching theme and its ID.
2. Call get_theme_detail with that theme ID for the current score, lifecycle stage, related stocks (with prices), and recent news.
3. Call get_theme_history for that theme ID to see the 30-day score trajectory.
4. Call get_predictions for a forward-looking lifecycle view of that theme.

Then produce an analysis covering:
- Current lifecycle stage and score, and what that means (emerging / growth / peak / decline / reigniting).
- The 30-day trend: rising, cooling, or turning?
- Key related stocks and their recent price action.
- What's driving it (news/interest) and the forward outlook from the prediction.
- A clear one-line takeaway.

If search_themes returns multiple candidates, pick the closest match and say which one you analyzed. Remind the reader this is analytical signal, not investment advice.`
      )
  );

  server.registerPrompt(
    'find_investment_themes',
    {
      title: 'Find Themes by Interest',
      description:
        'Discover Korean market themes matching an interest or trend, ranked by lifecycle momentum.',
      argsSchema: {
        interest: z
          .string()
          .describe('An interest, trend, or sector to explore, e.g. "AI", "defense", "bio", "전력/원전", "우주"'),
      },
    },
    ({ interest }) =>
      userPrompt(
        `Help me discover Korean investment themes related to "${interest}" using StockMatrix TLI data.

Steps:
1. Call search_themes with query "${interest}" to find matching themes.
2. For the strongest 2-3 matches, note their score and lifecycle stage. If useful, call get_theme_detail on the single best match for related stocks.
3. Optionally call get_theme_ranking to check how these themes rank against the broader market.

Then present:
- The matching themes ranked by score, each with lifecycle stage (emerging / growth / peak / decline / reigniting).
- Which are early/rising vs. already peaked or fading — momentum matters more than raw score.
- For the top pick, a few representative related stocks.
- A short "where to look" summary.

Frame stages in terms of momentum (is interest building or fading), and note this is analytical signal, not investment advice.`
      )
  );

  server.registerPrompt(
    'stock_theme_check',
    {
      title: 'Stock Theme Check',
      description:
        'Check whether a Korean stock sits inside any hot or rising themes right now.',
      argsSchema: {
        stock: z
          .string()
          .describe('Korean stock — a 6-digit code (e.g. "005930") or a company name (e.g. "삼성전자", "SK하이닉스")'),
      },
    },
    ({ stock }) =>
      userPrompt(
        `Check whether the Korean stock "${stock}" is part of any hot or rising themes using StockMatrix TLI data.

Steps:
1. If "${stock}" is not already a 6-digit code, call search_stocks with query "${stock}" to resolve it to a code.
2. Call get_stock_themes with the 6-digit code to list every theme the stock belongs to, with each theme's score and lifecycle stage.
3. If any theme looks hot (high score / growth or peak / reigniting), optionally call get_theme_detail on it for more context.

Then report:
- Which themes the stock belongs to, ranked by theme score.
- Whether any of those themes are currently hot or rising (growth / peak / reigniting) vs. cooling.
- The stock's relevance within its strongest theme.
- A one-line verdict on whether the stock is riding a themed momentum wave right now.

Note this is analytical signal about theme membership and momentum, not investment advice.`
      )
  );
};
