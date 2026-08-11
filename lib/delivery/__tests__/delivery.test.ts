/**
 * Newsletter delivery service — behavioral tests.
 *
 * Tests that EXECUTE the service with mocks, verifying actual behavior:
 * - Atomic run creation/resume without reset
 * - Immutable snapshot via RPC (no client pagination race)
 * - Stale claim recovery → ambiguous (never auto-reclaim)
 * - Active-only subscriber fetch; inactive → skipped
 * - Retryable resume with max-attempt bound
 * - Ambiguous never retried
 * - Conditional sent update: zero rows → no crash
 * - Composed timeout (internal + external)
 * - DB mutation false/error → thrown
 * - Terminal exclusions (completed run returns immediately)
 * - Option validation
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

// executeDelivery runs a send-configuration preflight before claiming anyone.
// These tests exercise the state machine, so give it a valid configuration.
const originalEnv = process.env;

beforeEach(() => {
  process.env = {
    ...originalEnv,
    SENDGRID_API_KEY: 'SG.test-key',
    SENDGRID_FROM_EMAIL: 'test@stockmatrix.co.kr',
    SENDGRID_FROM_NAME: 'Stock Matrix Test',
    UNSUBSCRIBE_TOKEN_SECRET: 'u'.repeat(32),
  };
});

afterAll(() => {
  process.env = originalEnv;
});

// ─── Mock Factory ────────────────────────────────────────────────────────────

vi.mock('@/lib/sendgrid', () => ({
  sendSingleRecipient: vi.fn(),
}));

import { sendSingleRecipient } from '@/lib/sendgrid';
const mockSendSingle = vi.mocked(sendSingleRecipient);

interface RpcHandler {
  (fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

interface FromHandler {
  (table: string): Record<string, unknown>;
}

function buildMockSupabase(opts: {
  rpcHandler: RpcHandler;
  fromHandler: FromHandler;
}): SupabaseClient {
  return {
    rpc: vi.fn((fn: string, params: Record<string, unknown>) => opts.rpcHandler(fn, params)),
    from: vi.fn((table: string) => opts.fromHandler(table)),
  } as unknown as SupabaseClient;
}

function chainResolving(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.upsert = vi.fn().mockReturnValue(chain);
  return chain;
}

// ─── 1. Atomic run creation/resume without reset ─────────────────────────────

describe('getOrCreateRun atomic semantics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendSingle.mockResolvedValue({ accepted: true, messageId: 'msg-1' });
  });

  it('resumes existing run without resetting terminal state', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'completed', snapshot_completed: true, is_terminal: true }, error: null };
        }
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 5, accepted: 5, failed: 0, ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });
    // Should NOT call snapshot or claim — just return existing terminal state
    expect(result.success).toBe(true);
    expect(result.accepted).toBe(5);
    expect((supabase.rpc as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'snapshot_delivery_recipients'
    )).toHaveLength(0);
  });

  it('throws when get_or_create_delivery_run RPC fails', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: null, error: { message: 'connection refused' } };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31' }))
      .rejects.toThrow(/get_or_create_delivery_run failed/);
  });
});

// ─── 2. Immutable snapshot via RPC ───────────────────────────────────────────

describe('immutable snapshot via RPC', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendSingle.mockResolvedValue({ accepted: true, messageId: 'msg-1' });
  });

  it('calls snapshot_delivery_recipients RPC (not client-side pagination)', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const rpcCalls: string[] = [];
    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        rpcCalls.push(fn);
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') {
          return { data: { total: 100, already_completed: false }, error: null };
        }
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') return { data: [], error: null };
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 100, accepted: 100, failed: 0, ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: { id: 'x' }, error: null });
      },
    });

    await executeDelivery({ supabase, newsletterDate: '2026-07-31' });
    expect(rpcCalls).toContain('snapshot_delivery_recipients');
    // No from('subscribers') pagination calls
    expect((supabase.from as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'subscribers'
    )).toHaveLength(0);
  });

  it('handles >1000 subscribers in single RPC call (set-based, no pagination)', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    let snapshotCallCount = 0;
    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') {
          snapshotCallCount++;
          // Simulate >1000 subscribers returned in one atomic call
          return { data: { total: 5200, already_completed: false }, error: null };
        }
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') return { data: [], error: null };
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 5200, accepted: 5200, failed: 0, ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: { id: 'x' }, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });
    // Only ONE snapshot call — set-based INSERT...SELECT handles any count
    expect(snapshotCallCount).toBe(1);
    expect(result.total).toBe(5200);
    expect(result.success).toBe(true);
  });

  it('snapshot RPC failure throws (not silently ignored)', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') {
          return { data: null, error: { message: 'deadlock detected' } };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31' }))
      .rejects.toThrow(/snapshot_delivery_recipients failed/);
  });
});

// ─── 3. Stale claim recovery → ambiguous ─────────────────────────────────────

describe('stale claim recovery to ambiguous', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendSingle.mockResolvedValue({ accepted: true, messageId: 'msg-1' });
  });

  it('calls recover_stale_claims before claiming new batches', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const rpcOrder: string[] = [];

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        rpcOrder.push(fn);
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 2, error: null };
        if (fn === 'claim_delivery_batch') return { data: [], error: null };
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'partial', total: 3, accepted: 1, failed: 0, ambiguous: 2, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });

    // recover_stale_claims must come before claim_delivery_batch
    const recoverIdx = rpcOrder.indexOf('recover_stale_claims');
    const claimIdx = rpcOrder.indexOf('claim_delivery_batch');
    expect(recoverIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(recoverIdx);

    // Ambiguous remains → not success
    expect(result.success).toBe(false);
    expect(result.ambiguous).toBe(2);
  });
});

// ─── 4. Active-only subscriber fetch; inactive → skipped ─────────────────────

describe('active-only fetch and skipped status', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendSingle.mockResolvedValue({ accepted: true, messageId: 'msg-1' });
  });

  it('marks inactive subscribers as skipped, not failed', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const markCalls: Array<{ status: string }> = [];

    const supabase = buildMockSupabase({
      rpcHandler: async (fn, params) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 2, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          // Return batch once, then empty
          if (markCalls.length === 0) {
            return { data: [
              { delivery_id: 'd1', subscriber_id: 'sub-active' },
              { delivery_id: 'd2', subscriber_id: 'sub-inactive' },
            ], error: null };
          }
          return { data: [], error: null };
        }
        if (fn === 'mark_delivery_outcome') {
          markCalls.push({ status: (params as { p_status: string }).p_status });
          return { data: true, error: null };
        }
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 2, accepted: 1, failed: 0, ambiguous: 0, retryable: 0, skipped: 1, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        if (table === 'subscribers') {
          // Return one active, one inactive
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockResolvedValue({
            data: [
              { id: 'sub-active', email: 'a@x.com', name: null, is_active: true },
              { id: 'sub-inactive', email: 'b@x.com', name: null, is_active: false },
            ],
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: { id: 'x' }, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });

    expect(result.skipped).toBe(1);
    expect(result.accepted).toBe(1);
    // Verify mark calls include skipped
    expect(markCalls.some(c => c.status === 'skipped')).toBe(true);
    expect(markCalls.some(c => c.status === 'provider_accepted')).toBe(true);
  });
});

// ─── 5. Retryable resume with max-attempt bound ──────────────────────────────

describe('retryable resume and max-attempt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('marks 429/5xx as retryable (not permanent failure)', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const markStatuses: string[] = [];

    mockSendSingle.mockResolvedValue({ accepted: false, retryable: true, error: 'Provider error: 503' });

    const supabase = buildMockSupabase({
      rpcHandler: async (fn, params) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          if (markStatuses.length === 0) {
            return { data: [{ delivery_id: 'd1', subscriber_id: 'sub-1' }], error: null };
          }
          return { data: [], error: null };
        }
        if (fn === 'mark_delivery_outcome') {
          markStatuses.push((params as { p_status: string }).p_status);
          return { data: true, error: null };
        }
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'in_progress', total: 1, accepted: 0, failed: 0, ambiguous: 0, retryable: 1, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        if (table === 'subscribers') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockResolvedValue({
            data: [{ id: 'sub-1', email: 'a@x.com', name: null, is_active: true }],
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });

    expect(markStatuses).toContain('retryable');
    expect(markStatuses).not.toContain('failed');
    expect(result.retryable).toBe(1);
    expect(result.success).toBe(false); // retryable blocks completion
  });
});

// ─── 6. Ambiguous never retried ──────────────────────────────────────────────

describe('ambiguous no retry', () => {
  it('claim_delivery_batch SQL does not include ambiguous status', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../supabase/migrations/059_delivery_hardening.sql'),
      'utf-8',
    );
    // The new claim function only picks pending and retryable
    const claimFn = sql.substring(
      sql.indexOf('REPLACE FUNCTION public.claim_delivery_batch'),
      sql.indexOf('-- ================================================\n-- Replace mark_delivery_outcome'),
    );
    expect(claimFn).toContain("nrd.status = 'pending'");
    expect(claimFn).toContain("nrd.status = 'retryable'");
    expect(claimFn).not.toContain("'ambiguous'");
  });
});

// ─── 7. Conditional sent update: zero rows ───────────────────────────────────

describe('conditional sent update zero rows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendSingle.mockResolvedValue({ accepted: true, messageId: 'msg-1' });
  });

  it('does not throw when newsletter_content already marked sent (idempotent re-read confirms true)', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    let fromCallCount = 0;
    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 0, already_completed: true }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') return { data: [], error: null };
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 1, accepted: 1, failed: 0, ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          fromCallCount++;
          if (fromCallCount === 1) {
            // First call: initial load — unsent
            return chainResolving({
              data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null },
              error: null,
            });
          }
          if (fromCallCount === 2) {
            // Second call: update attempt (returns PGRST116)
            const updateChain: Record<string, unknown> = {};
            updateChain.update = vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
                  }),
                }),
              }),
            });
            updateChain.select = vi.fn().mockReturnValue(updateChain);
            updateChain.eq = vi.fn().mockReturnValue(updateChain);
            // Re-read single call: returns is_sent=true (another worker beat us)
            updateChain.single = vi.fn().mockResolvedValue({
              data: { id: 'c1', is_sent: true },
              error: null,
            });
            return updateChain;
          }
          // Third call (re-read): is_sent=true
          return chainResolving({
            data: { id: 'c1', is_sent: true },
            error: null,
          });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    // Should NOT throw — re-read confirms is_sent=true
    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });
    expect(result.success).toBe(true);
  });

  it('throws when zero-row update re-reads and finds is_sent=false', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    let fromCallCount = 0;
    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 0, already_completed: true }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') return { data: [], error: null };
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 1, accepted: 1, failed: 0, ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          fromCallCount++;
          if (fromCallCount === 1) {
            // First call: initial load — unsent
            return chainResolving({
              data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null },
              error: null,
            });
          }
          if (fromCallCount === 2) {
            // Second call: update attempt (returns PGRST116)
            const updateChain: Record<string, unknown> = {};
            updateChain.update = vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
                  }),
                }),
              }),
            });
            return updateChain;
          }
          // Third call (re-read): is_sent still false! Inconsistent state.
          return chainResolving({
            data: { id: 'c1', is_sent: false },
            error: null,
          });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31' }))
      .rejects.toThrow(/is_sent=false/);
  });

  it('throws when conditional sent update has a real DB error (non-PGRST116)', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: true }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') return { data: [], error: null };
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 1, accepted: 1, failed: 0, ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.single = vi.fn().mockResolvedValue({
            data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null },
            error: null,
          });
          // Simulate a real DB error (not PGRST116)
          chain.update = vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'deadlock detected' } }),
                }),
              }),
            }),
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31' }))
      .rejects.toThrow(/Failed to update newsletter_content\.is_sent/);
  });

  it('does NOT mark sent when ambiguous > 0', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    let updateCalled = false;

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 2, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') return { data: [], error: null };
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'partial', total: 2, accepted: 1, failed: 0, ambiguous: 1, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.single = vi.fn().mockResolvedValue({
            data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null },
            error: null,
          });
          chain.update = vi.fn().mockImplementation(() => {
            updateCalled = true;
            return chain;
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });
    expect(result.success).toBe(false);
    expect(updateCalled).toBe(false); // Never attempted update
  });
});

// ─── 8. Composed timeout ─────────────────────────────────────────────────────

describe('composed timeout (internal + external)', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('aborts when external signal fires even with long internal timeout', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const externalController = new AbortController();
    // Abort immediately
    externalController.abort();

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 100, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          // Would return items but signal is already aborted
          return { data: [{ delivery_id: 'd1', subscriber_id: 's1' }], error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await expect(executeDelivery({
      supabase,
      newsletterDate: '2026-07-31',
      signal: externalController.signal,
      timeoutMs: 600_000, // 10 min internal — should still abort from external
    })).rejects.toThrow(/aborted/i);
  });
});

// ─── 9. DB mutation false/error → thrown ─────────────────────────────────────

describe('DB mutation boolean check', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSendSingle.mockResolvedValue({ accepted: true, messageId: 'msg-1' });
  });

  it('throws when mark_delivery_outcome returns false (row not in expected state)', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          return { data: [{ delivery_id: 'd1', subscriber_id: 'sub-1' }], error: null };
        }
        if (fn === 'mark_delivery_outcome') {
          // Return false — row was not in 'claimed' state for this worker
          return { data: false, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        if (table === 'subscribers') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockResolvedValue({
            data: [{ id: 'sub-1', email: 'a@x.com', name: null, is_active: true }],
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31' }))
      .rejects.toThrow(/mark_delivery_outcome returned false/);
  });

  it('throws when mark_delivery_outcome has DB error', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          return { data: [{ delivery_id: 'd1', subscriber_id: 'sub-1' }], error: null };
        }
        if (fn === 'mark_delivery_outcome') {
          return { data: null, error: { message: 'connection reset' } };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        if (table === 'subscribers') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockResolvedValue({
            data: [{ id: 'sub-1', email: 'a@x.com', name: null, is_active: true }],
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31' }))
      .rejects.toThrow(/DB state write failed/);
  });
});

// ─── 10. Option validation ───────────────────────────────────────────────────

describe('option validation', () => {
  it('rejects invalid batchSize', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chainResolving({ data: null, error: null }),
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', batchSize: 0 }))
      .rejects.toThrow(/batchSize/);
    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', batchSize: 201 }))
      .rejects.toThrow(/batchSize/);
  });

  it('rejects invalid concurrency', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chainResolving({ data: null, error: null }),
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', concurrency: 0 }))
      .rejects.toThrow(/concurrency/);
  });

  it('rejects invalid timeoutMs', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chainResolving({ data: null, error: null }),
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', timeoutMs: 500 }))
      .rejects.toThrow(/timeoutMs/);
  });
});

// ─── 11. SQL contract tests ──────────────────────────────────────────────────

describe('SQL migration 059 contracts', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../supabase/migrations/059_delivery_hardening.sql'),
    'utf-8',
  );

  it('adds snapshot_completed_at column', () => {
    expect(sql).toContain('snapshot_completed_at TIMESTAMP WITH TIME ZONE');
  });

  it('adds skipped and retryable to status CHECK', () => {
    expect(sql).toContain("'skipped'");
    expect(sql).toContain("'retryable'");
  });

  it('get_or_create_delivery_run never mutates terminal state', () => {
    expect(sql).toContain("v_run.status IN ('completed', 'failed')");
    expect(sql).toContain("'is_terminal', true");
  });

  it('get_or_create_delivery_run uses IF NOT FOUND (not record-null)', () => {
    expect(sql).toContain('IF NOT FOUND THEN');
    expect(sql).not.toContain('v_run IS NULL');
  });

  it('snapshot_delivery_recipients uses INSERT...SELECT (not client pagination)', () => {
    expect(sql).toContain('INSERT INTO public.newsletter_recipient_deliveries');
    expect(sql).toContain('SELECT p_run_id, s.id');
    expect(sql).toContain('FROM public.subscribers s');
    expect(sql).toContain('ON CONFLICT (run_id, subscriber_id) DO NOTHING');
  });

  it('snapshot refuses to expand a completed snapshot', () => {
    expect(sql).toContain('v_already_completed IS NOT NULL');
    expect(sql).toContain("'already_completed', true");
  });

  it('recover_stale_claims marks ambiguous (not re-pending)', () => {
    expect(sql).toContain("SET status = 'ambiguous'");
    expect(sql).toContain("failure_detail = 'stale_claim_recovery'");
  });

  it('recover_stale_claims validates stale_seconds parameter', () => {
    expect(sql).toContain('p_stale_seconds < 1 OR p_stale_seconds > 86400');
  });

  it('mark_delivery_outcome uses integer ROW_COUNT (not BOOLEAN)', () => {
    // Must declare v_updated as INTEGER, not BOOLEAN
    expect(sql).toContain('v_updated INTEGER');
    expect(sql).not.toContain('v_updated BOOLEAN');
    expect(sql).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT');
    expect(sql).toContain('RETURN v_updated > 0');
  });

  it('mark_delivery_outcome requires nonempty p_claimed_by (no NULL bypass)', () => {
    expect(sql).toContain('p_claimed_by TEXT');
    expect(sql).toContain('claimed_by = p_claimed_by');
    // Must reject NULL/empty — exact match only
    expect(sql).toContain("p_claimed_by IS NULL OR p_claimed_by = ''");
    // No OR clause that would allow NULL bypass in WHERE
    expect(sql).not.toContain('p_claimed_by IS NULL OR claimed_by = p_claimed_by');
  });

  it('drops obsolete 5-argument mark_delivery_outcome overload from 058', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.mark_delivery_outcome(UUID, TEXT, TEXT, TEXT, TEXT)');
  });

  it('reconcile counts retryable and skipped separately', () => {
    expect(sql).toContain("COUNT(*) FILTER (WHERE status = 'retryable')");
    expect(sql).toContain("COUNT(*) FILTER (WHERE status = 'skipped')");
  });

  it('reconcile: terminal requires no pending/claimed/retryable/ambiguous', () => {
    expect(sql).toContain('v_pending = 0 AND v_claimed = 0 AND v_retryable = 0 AND v_ambiguous = 0');
  });

  it('reconcile converts exhausted retries to terminal failed at start', () => {
    expect(sql).toContain("SET status = 'failed'");
    expect(sql).toContain("failure_detail = 'retry_exhausted'");
    expect(sql).toContain("failure_category = 'permanent'");
    expect(sql).toContain('attempt_count >= max_attempts');
  });

  it('all new RPCs revoke anon/authenticated access', () => {
    const revokeAnon = (sql.match(/REVOKE ALL ON FUNCTION.*FROM anon/g) || []).length;
    expect(revokeAnon).toBeGreaterThanOrEqual(4);
  });

  it('snapshot uses FOR UPDATE lock on run row', () => {
    expect(sql).toContain('FOR UPDATE');
  });

  it('adds max_attempts column with default 3', () => {
    expect(sql).toContain('max_attempts INTEGER NOT NULL DEFAULT 3');
  });
});

describe('SQL migration 060 contracts', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../supabase/migrations/060_delivery_retry_and_pre_provider_release.sql'),
    'utf-8',
  );

  it('returns normalized prior failure detail with each claimed recipient', () => {
    expect(sql).toContain('failure_detail TEXT');
    expect(sql).toContain('d.failure_detail AS failure_detail');
  });

  it('releases only the owning worker claim and refunds its attempt', () => {
    expect(sql).toContain("AND status = 'claimed'");
    expect(sql).toContain('AND claimed_by = p_worker_id');
    expect(sql).toContain('attempt_count = GREATEST(attempt_count - 1, 0)');
    expect(sql).toContain("CASE WHEN failure_category = 'retryable' THEN 'retryable' ELSE 'pending' END");
  });

  it('keeps release RPC inaccessible outside service_role', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.release_delivery_claim_batch(UUID[], TEXT) FROM anon');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.release_delivery_claim_batch(UUID[], TEXT) FROM authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.release_delivery_claim_batch(UUID[], TEXT) TO service_role');
  });
});

// ─── 12. Workflow YAML invariants ────────────────────────────────────────────

describe('workflow invariants (hardened)', () => {
  const sendWf = readFileSync(
    resolve(__dirname, '../../../.github/workflows/daily-newsletter.yml'),
    'utf-8',
  );
  const prepWf = readFileSync(
    resolve(__dirname, '../../../.github/workflows/prepare-newsletter.yml'),
    'utf-8',
  );

  it('daily-newsletter does NOT have Google Cloud credentials setup', () => {
    expect(sendWf).not.toContain('GOOGLE_CLOUD_CREDENTIALS');
    expect(sendWf).not.toContain('GOOGLE_APPLICATION_CREDENTIALS');
    expect(sendWf).not.toContain('GOOGLE_CLOUD_PROJECT');
  });

  it('daily-newsletter does NOT have anon key', () => {
    expect(sendWf).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('daily-newsletter has UNSUBSCRIBE_TOKEN_SECRET', () => {
    expect(sendWf).toContain('UNSUBSCRIBE_TOKEN_SECRET');
  });

  it('2026 holiday lists are identical between workflows', () => {
    // Extract 2026 holidays from both
    const extract2026 = (yml: string) => {
      const lines = yml.split('\n');
      const holidays: string[] = [];
      let in2026 = false;
      for (const line of lines) {
        if (line.includes('# — 2026 —')) in2026 = true;
        if (in2026 && /"\d{4}-\d{2}-\d{2}"/.test(line)) {
          const match = line.match(/"(\d{4}-\d{2}-\d{2})"/);
          if (match && match[1].startsWith('2026')) holidays.push(match[1]);
        }
        if (in2026 && line.includes('for holiday')) break;
      }
      return holidays.sort();
    };

    const sendHolidays = extract2026(sendWf);
    const prepHolidays = extract2026(prepWf);
    expect(sendHolidays).toEqual(prepHolidays);
    expect(sendHolidays.length).toBeGreaterThan(10);
  });

  it('both workflows have concurrency groups with cancel-in-progress: false', () => {
    expect(sendWf).toContain('cancel-in-progress: false');
    expect(prepWf).toContain('cancel-in-progress: false');
  });

  it('prepare-newsletter does NOT have anon key', () => {
    expect(prepWf).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});

// ─── 13. Service source invariants ───────────────────────────────────────────

describe('service source invariants', () => {
  const serviceSource = readFileSync(resolve(__dirname, '../service.ts'), 'utf-8');

  it('does not use client-side pagination for snapshot (no keyset pagination loop)', () => {
    // The old pagination pattern is gone — snapshot is via RPC
    expect(serviceSource).not.toContain('PAGE_SIZE');
    expect(serviceSource).not.toContain('lastCreatedAt');
    expect(serviceSource).not.toContain('lastId');
    // from('subscribers') is still used for fetching emails in sendBatchBounded (correct)
    expect(serviceSource).toContain('snapshot_delivery_recipients');
  });

  it('composes abort signals (internal timeout + external)', () => {
    expect(serviceSource).toContain('composeAbortSignals');
    expect(serviceSource).toContain("internal.addEventListener('abort'");
    expect(serviceSource).toContain("external.addEventListener('abort'");
  });

  it('normalizeErrorCode returns only fixed allowlisted codes', () => {
    expect(serviceSource).toContain('normalizeErrorCode');
    expect(serviceSource).toContain('ALLOWED_ERROR_CODES');
    // Must return type ErrorCode — never raw text
    expect(serviceSource).toContain("): ErrorCode");
    // Must NOT slice/sanitize raw text — all paths return a constant
    expect(serviceSource).not.toContain('.slice(0,');
    expect(serviceSource).not.toContain('message.replace(');
  });

  it('checks mark_delivery_outcome boolean return', () => {
    expect(serviceSource).toContain('data === false');
    expect(serviceSource).toContain('mark_delivery_outcome returned false');
  });

  it('validates options before executing', () => {
    expect(serviceSource).toContain('validateOptions');
    expect(serviceSource).toContain('batchSize must be between');
  });

  it('validates newsletterDate format', () => {
    expect(serviceSource).toContain('newsletterDate must be a valid YYYY-MM-DD string');
  });

  it('validates staleLeaseSeconds', () => {
    expect(serviceSource).toContain('staleLeaseSeconds must be between 1 and 86400');
  });

  it('validates workerId is non-empty string', () => {
    expect(serviceSource).toContain('workerId must be a non-empty string');
  });

  it('uses Promise.allSettled for worker pool (not Set/Promise.race)', () => {
    expect(serviceSource).toContain('Promise.allSettled');
    expect(serviceSource).not.toContain('Promise.race');
    expect(serviceSource).not.toContain('new Set<Promise');
  });

  it('re-reads newsletter_content after zero-row sent update to verify is_sent', () => {
    // Never blindly accepts PGRST116/zero-row
    expect(serviceSource).toContain('reread.is_sent === true');
    expect(serviceSource).toContain('is_sent=false');
  });

  it('handles already-sent newsletters as idempotent no-op', () => {
    expect(serviceSource).toContain('handleAlreadySent');
    expect(serviceSource).toContain('alreadySent: true');
    expect(serviceSource).toContain('legacy-no-ledger-');
  });
});

// ─── 14. Script source invariants ────────────────────────────────────────────

describe('script source invariants', () => {
  const sendSource = readFileSync(
    resolve(__dirname, '../../../scripts/send-newsletter.ts'),
    'utf-8',
  );

  it('send-newsletter requires service role (no anon fallback)', () => {
    expect(sendSource).toContain('SUPABASE_SERVICE_ROLE_KEY is required');
    expect(sendSource).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('send-newsletter uses process.exitCode (not process.exit)', () => {
    expect(sendSource).toContain('process.exitCode');
    expect(sendSource).not.toContain('process.exit(');
  });

  // prepare-newsletter.ts의 service-role 강제, process.exitCode 전환, provenance RPC
  // 단언은 LLM/AI 파이프라인 PR과 함께 돌아온다. 해당 스크립트는 이 PR 범위 밖이다.
});

// ─── 14b. Send-configuration preflight ───────────────────────────────────────

describe('재시도 백오프', () => {
  // claim 루프는 retryable 행을 즉시 다시 집어온다. 대기가 없으면 429/5xx로 밀린
  // 수신자의 max_attempts가 수 밀리초 만에 소진돼, 짧은 provider 스로틀 하나로
  // 그날 발송 전체가 permanent failure로 확정된다.
  it('첫 시도에는 대기하지 않는다', async () => {
    const { retryBackoffMs } = await import('../service')
    expect(retryBackoffMs(1)).toBe(0)
  })

  it('시도 횟수에 따라 지수적으로 늘어난다', async () => {
    const { retryBackoffMs } = await import('../service')
    expect(retryBackoffMs(2)).toBe(2_000)
    expect(retryBackoffMs(3)).toBe(4_000)
    expect(retryBackoffMs(4)).toBe(8_000)
  })

  it('429 재시도는 3회차 전에 30초 스로틀 창을 넘긴다', async () => {
    const { retryBackoffMs } = await import('../service')
    const secondAttemptDelay = retryBackoffMs(2, true)
    const thirdAttemptDelay = retryBackoffMs(3, true)

    expect(secondAttemptDelay).toBe(12_000)
    expect(thirdAttemptDelay).toBe(24_000)
    expect(secondAttemptDelay + thirdAttemptDelay).toBeGreaterThan(30_000)
  })

  it('상한을 넘지 않는다', async () => {
    const { retryBackoffMs } = await import('../service')
    expect(retryBackoffMs(20)).toBe(30_000)
    expect(retryBackoffMs(20, true)).toBe(30_000)
  })
})

describe('provider 호출 전 claim 해제', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('수신자 상세 조회가 실패하면 provider 호출 없이 claim을 되돌리고 원래 오류를 던진다', async () => {
    const releaseCalls: Record<string, unknown>[] = [];
    const supabase = buildMockSupabase({
      rpcHandler: async (fn, params) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 2, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          return {
            data: [
              { delivery_id: 'd1', subscriber_id: 'sub-1', attempt_count: 1, failure_detail: null },
              { delivery_id: 'd2', subscriber_id: 'sub-2', attempt_count: 1, failure_detail: null },
            ],
            error: null,
          };
        }
        if (fn === 'release_delivery_claim_batch') {
          releaseCalls.push(params);
          return { data: 2, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        if (table === 'subscribers') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockResolvedValue({ data: null, error: { message: 'subscriber read unavailable' } });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const { executeDelivery } = await import('../service');
    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', workerId: 'worker-1' }))
      .rejects.toThrow('Failed to fetch subscriber details for batch: subscriber read unavailable');

    expect(mockSendSingle).not.toHaveBeenCalled();
    expect(releaseCalls).toEqual([{
      p_delivery_ids: ['d1', 'd2'],
      p_worker_id: 'worker-1',
    }]);
  });

  it('claim 해제가 실패해도 수신자 상세 조회의 원래 오류를 보존한다', async () => {
    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          return { data: [{ delivery_id: 'd1', subscriber_id: 'sub-1', attempt_count: 1, failure_detail: null }], error: null };
        }
        if (fn === 'release_delivery_claim_batch') {
          return { data: null, error: { message: 'release connection reset' } };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        if (table === 'subscribers') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockResolvedValue({ data: null, error: { message: 'subscriber read unavailable' } });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const { executeDelivery } = await import('../service');
    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31' }))
      .rejects.toThrow('Failed to fetch subscriber details for batch: subscriber read unavailable; additionally failed to release claimed batch: release_delivery_claim_batch failed: release connection reset');

    expect(mockSendSingle).not.toHaveBeenCalled();
  });

  it('claim 직후 취소돼도 provider 호출 전에 claim을 되돌린다', async () => {
    const controller = new AbortController();
    const releaseCalls: Record<string, unknown>[] = [];
    const supabase = buildMockSupabase({
      rpcHandler: async (fn, params) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          controller.abort();
          return { data: [{ delivery_id: 'd1', subscriber_id: 'sub-1', attempt_count: 1, failure_detail: null }], error: null };
        }
        if (fn === 'release_delivery_claim_batch') {
          releaseCalls.push(params);
          return { data: 1, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const { executeDelivery } = await import('../service');
    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', signal: controller.signal }))
      .rejects.toThrow('Aborted during batch send');

    expect(mockSendSingle).not.toHaveBeenCalled();
    expect(releaseCalls).toHaveLength(1);
  });

  it('재시도 대기가 남은 전체 timeout 예산을 넘으면 provider 호출 전에 claim을 되돌린다', async () => {
    const releaseCalls: Record<string, unknown>[] = [];
    const supabase = buildMockSupabase({
      rpcHandler: async (fn, params) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 1, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          return { data: [{ delivery_id: 'd1', subscriber_id: 'sub-1', attempt_count: 2, failure_detail: 'rate_limited' }], error: null };
        }
        if (fn === 'release_delivery_claim_batch') {
          releaseCalls.push(params);
          return { data: 1, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const { executeDelivery } = await import('../service');
    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', timeoutMs: 3_000 }))
      .rejects.toThrow('Delivery timeout budget cannot accommodate retry backoff');

    expect(mockSendSingle).not.toHaveBeenCalled();
    expect(releaseCalls).toHaveLength(1);
  });
});

describe('전면 실패 보고', () => {
  // 전 수신자가 permanent failure로 끝나도 상태머신은 'completed'다.
  // 그것만 보고 성공으로 보고하면 SendGrid 키 폐기 같은 전면 장애가 조용히 지나가고,
  // 호출부는 exit 0 / HTTP 200을 내며 Twitter 공지까지 나간다.
  it('수신자가 있는데 한 명도 수락되지 않으면 success=false', async () => {
    let updateCalled = false
    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null }
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 3, already_completed: false }, error: null }
        if (fn === 'recover_stale_claims') return { data: 0, error: null }
        if (fn === 'claim_delivery_batch') return { data: [], error: null }
        if (fn === 'reconcile_delivery_run') {
          return {
            data: {
              status: 'completed', total: 3, accepted: 0, failed: 3,
              ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0,
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      fromHandler: () => {
        const chain = chainResolving({
          data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null },
          error: null,
        })
        chain.update = vi.fn().mockImplementation(() => {
          updateCalled = true
          return chain
        })
        return chain
      },
    })

    const { executeDelivery } = await import('../service')
    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' })

    expect(result.total).toBe(3)
    expect(result.accepted).toBe(0)
    expect(result.success).toBe(false)
    expect(updateCalled).toBe(false)
  })

  it('일부 수신자가 수락되면 발송 완료로 표시한다', async () => {
    const { updateContentSentFlag } = await import('../service')
    let updateCalled = false
    const chain = chainResolving({ data: { id: 'c1' }, error: null })
    chain.update = vi.fn().mockImplementation(() => {
      updateCalled = true
      return chain
    })
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chain,
    })

    await updateContentSentFlag(supabase, 'c1', {
      status: 'completed', total: 3, accepted: 1, failed: 2,
      ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0,
    })

    expect(updateCalled).toBe(true)
  })

  it('수신자가 없으면 발송 완료로 표시한다', async () => {
    const { updateContentSentFlag } = await import('../service')
    let updateCalled = false
    const chain = chainResolving({ data: { id: 'c1' }, error: null })
    chain.update = vi.fn().mockImplementation(() => {
      updateCalled = true
      return chain
    })
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chain,
    })

    await updateContentSentFlag(supabase, 'c1', {
      status: 'completed', total: 0, accepted: 0, failed: 0,
      ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0,
    })

    expect(updateCalled).toBe(true)
  })

  it('수신자가 0명이면 success=true (보낼 대상이 없는 정상 상황)', async () => {
    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null }
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 0, already_completed: false }, error: null }
        if (fn === 'recover_stale_claims') return { data: 0, error: null }
        if (fn === 'claim_delivery_batch') return { data: [], error: null }
        if (fn === 'reconcile_delivery_run') {
          return {
            data: {
              status: 'completed', total: 0, accepted: 0, failed: 0,
              ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0,
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      fromHandler: () => chainResolving({
        data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null },
        error: null,
      }),
    })

    const { executeDelivery } = await import('../service')
    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' })

    expect(result.success).toBe(true)
  })
})

describe('send configuration preflight', () => {
  // A missing send secret throws before the provider is contacted. Inside the
  // send loop that throw would be recorded as `ambiguous`, which is never
  // auto-retried — every recipient would be stuck until someone edited the DB.
  // The preflight must reject the run instead, leaving all rows claimable.
  it.each([
    'SENDGRID_API_KEY',
    'SENDGRID_FROM_EMAIL',
    'SENDGRID_FROM_NAME',
  ])('rejects the run when %s is missing', async (missingKey) => {
    delete process.env[missingKey];
    const { assertSendConfigured } = await import('../service');

    expect(() => assertSendConfigured()).toThrow(/Delivery preflight failed: missing/);
  });

  it('rejects the run when the unsubscribe token secret is unusable', async () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    const { assertSendConfigured } = await import('../service');

    expect(() => assertSendConfigured()).toThrow(
      /unsubscribe token generation unavailable/,
    );
  });

  it('rejects a token secret shorter than the 32-char minimum', async () => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'too-short';
    const { assertSendConfigured } = await import('../service');

    expect(() => assertSendConfigured()).toThrow(
      /unsubscribe token generation unavailable/,
    );
  });

  it('passes with a complete configuration', async () => {
    const { assertSendConfigured } = await import('../service');

    expect(() => assertSendConfigured()).not.toThrow();
  });

  it('aborts executeDelivery before any recipient is claimed', async () => {
    delete process.env.SENDGRID_API_KEY;
    const rpc = vi.fn();
    const supabase = buildMockSupabase({
      rpcHandler: rpc,
      fromHandler: () => chainResolving({ data: null, error: null }),
    });
    const { executeDelivery } = await import('../service');

    await expect(
      executeDelivery({ supabase, newsletterDate: '2026-07-31' }),
    ).rejects.toThrow(/Delivery preflight failed/);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ─── 15. Required workerId validation ────────────────────────────────────────

describe('workerId validation', () => {
  it('rejects empty string workerId', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chainResolving({ data: null, error: null }),
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', workerId: '' }))
      .rejects.toThrow(/workerId/);
  });

  it('rejects whitespace-only workerId', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chainResolving({ data: null, error: null }),
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', workerId: '   ' }))
      .rejects.toThrow(/workerId/);
  });
});

// ─── 16. Retry exhaustion ────────────────────────────────────────────────────

describe('retry exhaustion in reconciliation', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../supabase/migrations/059_delivery_hardening.sql'),
    'utf-8',
  );

  it('reconcile converts exhausted retries before counting', () => {
    // The UPDATE for retry_exhausted must come BEFORE the aggregate SELECT
    const exhaustedPos = sql.indexOf("failure_detail = 'retry_exhausted'");
    const selectPos = sql.indexOf("COUNT(*) FILTER (WHERE status = 'retryable')");
    expect(exhaustedPos).toBeGreaterThan(-1);
    expect(selectPos).toBeGreaterThan(exhaustedPos);
  });

  it('retry_exhausted uses safe code (no raw text)', () => {
    expect(sql).toContain("failure_detail = 'retry_exhausted'");
    expect(sql).toContain("failure_category = 'permanent'");
  });
});

// ─── 17. Fixed error codes (normalizeErrorCode allowlist) ────────────────────

describe('normalizeErrorCode fixed allowlist', () => {
  it('returns only allowlisted codes for known patterns', async () => {
    const { normalizeErrorCode } = await import('@/lib/delivery/service');

    expect(normalizeErrorCode('Connection timeout after 30s')).toBe('timeout');
    expect(normalizeErrorCode('ECONNREFUSED 127.0.0.1')).toBe('network_error');
    expect(normalizeErrorCode('ECONNRESET by peer')).toBe('network_error');
    expect(normalizeErrorCode('ENOTFOUND smtp.example.com')).toBe('network_error');
    expect(normalizeErrorCode('HTTP 429 Too Many Requests')).toBe('rate_limited');
    expect(normalizeErrorCode('Server returned 503')).toBe('provider_5xx');
    expect(normalizeErrorCode('HTTP 500 Internal Server Error')).toBe('provider_5xx');
    expect(normalizeErrorCode('HTTP 400 Bad Request')).toBe('provider_4xx');
    expect(normalizeErrorCode('Recipient email bounce detected')).toBe('recipient_rejected');
    expect(normalizeErrorCode('Email suppression list')).toBe('recipient_rejected');
  });

  it('returns unknown_error for unrecognized messages and embedded numeric identifiers', async () => {
    const { normalizeErrorCode } = await import('@/lib/delivery/service');

    const cases = [
      {
        message: 'Mailbox user@example.com does not exist - rejected by relay',
        sensitiveFragments: ['user@', 'example.com', 'relay'],
      },
      {
        message: 'Connection to database port 5432 failed',
        sensitiveFragments: ['5432'],
      },
      {
        message: 'Operation elapsed 4040ms',
        sensitiveFragments: ['4040ms'],
      },
      {
        message: 'Provider request id 503991 was not found',
        sensitiveFragments: ['503991'],
      },
    ];

    for (const { message, sensitiveFragments } of cases) {
      const result = normalizeErrorCode(message);
      expect(result).toBe('unknown_error');
      for (const fragment of sensitiveFragments) {
        expect(result).not.toContain(fragment);
      }
    }
  });

  it('never returns a sanitized substring of raw provider text', async () => {
    const { normalizeErrorCode } = await import('@/lib/delivery/service');

    const codes = [
      normalizeErrorCode('Some weird XYZ error with PII inside'),
      normalizeErrorCode(''),
      normalizeErrorCode('null pointer exception in provider stack'),
    ];

    const allowlist = ['timeout', 'network_error', 'rate_limited', 'provider_5xx', 'provider_4xx', 'recipient_rejected', 'unknown_error'];
    for (const code of codes) {
      expect(allowlist).toContain(code);
    }
  });
});

// ─── 18. Worker pool rejection propagation ───────────────────────────────────

describe('worker pool (Promise.allSettled) rejection propagation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('propagates first DB error after all sends settle', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    let markCallCount = 0;
    mockSendSingle.mockResolvedValue({ accepted: true, messageId: 'msg-1' });

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'get_or_create_delivery_run') {
          return { data: { id: 'run-1', status: 'in_progress', snapshot_completed: false, is_terminal: false }, error: null };
        }
        if (fn === 'snapshot_delivery_recipients') return { data: { total: 3, already_completed: false }, error: null };
        if (fn === 'recover_stale_claims') return { data: 0, error: null };
        if (fn === 'claim_delivery_batch') {
          if (markCallCount === 0) {
            return { data: [
              { delivery_id: 'd1', subscriber_id: 'sub-1' },
              { delivery_id: 'd2', subscriber_id: 'sub-2' },
              { delivery_id: 'd3', subscriber_id: 'sub-3' },
            ], error: null };
          }
          return { data: [], error: null };
        }
        if (fn === 'mark_delivery_outcome') {
          markCallCount++;
          // Second call fails with DB error
          if (markCallCount === 2) {
            return { data: null, error: { message: 'connection reset during mark' } };
          }
          return { data: true, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({ data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: false, sent_at: null }, error: null });
        }
        if (table === 'subscribers') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.in = vi.fn().mockResolvedValue({
            data: [
              { id: 'sub-1', email: 'a@x.com', name: null, is_active: true },
              { id: 'sub-2', email: 'b@x.com', name: null, is_active: true },
              { id: 'sub-3', email: 'c@x.com', name: null, is_active: true },
            ],
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    // Should throw with DB error but all promises settled (no unhandled)
    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', concurrency: 3 }))
      .rejects.toThrow(/DB state write failed/);
  });
});

// ─── 19. Already-sent idempotent no-op ───────────────────────────────────────

describe('already-sent newsletter idempotent no-op', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns success with alreadySent=true when run exists', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 50, accepted: 48, failed: 1, ambiguous: 0, retryable: 0, skipped: 1, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          // is_sent=true
          return chainResolving({
            data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: true, sent_at: '2026-07-31T10:00:00Z' },
            error: null,
          });
        }
        if (table === 'newsletter_delivery_runs') {
          // Existing run found
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'run-existing' },
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });

    expect(result.success).toBe(true);
    expect(result.alreadySent).toBe(true);
    expect(result.runId).toBe('run-existing');
    expect(result.accepted).toBe(48);
    // Must NOT have called get_or_create_delivery_run (no new run)
    expect((supabase.rpc as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'get_or_create_delivery_run'
    )).toHaveLength(0);
  });

  it('returns success=false with alreadySent=true when the existing run accepted nobody', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async (fn) => {
        if (fn === 'reconcile_delivery_run') {
          return { data: { status: 'completed', total: 3, accepted: 0, failed: 3, ambiguous: 0, retryable: 0, skipped: 0, pending: 0, claimed: 0 }, error: null };
        }
        return { data: null, error: null };
      },
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({
            data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: true, sent_at: '2026-07-31T10:00:00Z' },
            error: null,
          });
        }
        if (table === 'newsletter_delivery_runs') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'run-existing' },
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });

    expect(result.success).toBe(false);
    expect(result.alreadySent).toBe(true);
    expect(result.accepted).toBe(0);
  });

  it('returns legacy no-op with stable ID when no ledger exists', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({
            data: { id: 'content-abc-123', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: true, sent_at: '2026-07-31T10:00:00Z' },
            error: null,
          });
        }
        if (table === 'newsletter_delivery_runs') {
          // No existing run
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.maybeSingle = vi.fn().mockResolvedValue({
            data: null,
            error: null,
          });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    const result = await executeDelivery({ supabase, newsletterDate: '2026-07-31' });

    expect(result.success).toBe(true);
    expect(result.alreadySent).toBe(true);
    // Stable non-PII identifier
    expect(result.runId).toBe('legacy-no-ledger-content-abc-123');
    expect(result.total).toBe(0);
    expect(result.accepted).toBe(0);
    // No email, no PII in runId
    expect(result.runId).not.toContain('@');
  });

  it('never creates a new delivery run when content is_sent=true', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');

    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: (table) => {
        if (table === 'newsletter_content') {
          return chainResolving({
            data: { id: 'c1', newsletter_date: '2026-07-31', gemini_analysis: '[]', is_sent: true, sent_at: '2026-07-31T10:00:00Z' },
            error: null,
          });
        }
        if (table === 'newsletter_delivery_runs') {
          const chain: Record<string, unknown> = {};
          chain.select = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
          return chain;
        }
        return chainResolving({ data: null, error: null });
      },
    });

    await executeDelivery({ supabase, newsletterDate: '2026-07-31' });

    // Verify no run creation RPC was called
    const rpcCalls = (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls;
    expect(rpcCalls.filter((c: unknown[]) => c[0] === 'get_or_create_delivery_run')).toHaveLength(0);
    expect(rpcCalls.filter((c: unknown[]) => c[0] === 'snapshot_delivery_recipients')).toHaveLength(0);
  });
});

// ─── 20. newsletterDate / staleLeaseSeconds validation ───────────────────────

describe('additional input validation', () => {
  it('rejects invalid newsletterDate format', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chainResolving({ data: null, error: null }),
    });

    await expect(executeDelivery({ supabase, newsletterDate: '07-31-2026' }))
      .rejects.toThrow(/newsletterDate/);
    await expect(executeDelivery({ supabase, newsletterDate: '' }))
      .rejects.toThrow(/newsletterDate/);
    await expect(executeDelivery({ supabase, newsletterDate: '2026/07/31' }))
      .rejects.toThrow(/newsletterDate/);
  });

  it('rejects staleLeaseSeconds out of range', async () => {
    const { executeDelivery } = await import('@/lib/delivery/service');
    const supabase = buildMockSupabase({
      rpcHandler: async () => ({ data: null, error: null }),
      fromHandler: () => chainResolving({ data: null, error: null }),
    });

    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', staleLeaseSeconds: 0 }))
      .rejects.toThrow(/staleLeaseSeconds/);
    await expect(executeDelivery({ supabase, newsletterDate: '2026-07-31', staleLeaseSeconds: 100000 }))
      .rejects.toThrow(/staleLeaseSeconds/);
  });
});
