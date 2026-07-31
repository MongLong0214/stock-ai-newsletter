/**
 * Canonical newsletter delivery service.
 *
 * Used by both `scripts/send-newsletter.ts` and `app/api/cron/send-newsletter/route.ts`.
 * Implements an idempotent, database-backed delivery state machine with:
 * - Atomic run creation/resume via RPC (never resets terminal state)
 * - Immutable transactional snapshot via server-side RPC (no client pagination race)
 * - Stale claims → ambiguous (never auto-reclaimed; explicit recovery step)
 * - Claim only pending + retryable (within max_attempts)
 * - Per-recipient outcome tracking with worker ID verification
 * - Retryable vs permanent failure classification, skipped for inactive
 * - Bounded retry with max attempts; ambiguous never auto-retried
 * - Conditional sent update: re-reads row to verify is_sent=true after update
 * - Composed AbortSignal: internal timeout + external signal
 * - No raw PII in logs or DB failure_detail
 * - normalizeErrorCode returns only a fixed allowlist of codes
 * - Bounded worker pool via Promise.allSettled (no unhandled promises)
 * - Idempotent no-op for already-sent newsletters (loads existing run)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { sendSingleRecipient, type SingleSendResult } from '@/lib/sendgrid';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeliveryOptions {
  /** Supabase client with service_role key */
  supabase: SupabaseClient;
  /** Newsletter date in YYYY-MM-DD format */
  newsletterDate: string;
  /** Worker identifier for lease tracking */
  workerId?: string;
  /** Batch size for claiming recipients (1-200) */
  batchSize?: number;
  /** Max concurrent sends within a batch */
  concurrency?: number;
  /** Stale lease timeout in seconds for recovery step */
  staleLeaseSeconds?: number;
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
  /** Process timeout in ms (default: 10 minutes) */
  timeoutMs?: number;
}

export interface DeliveryResult {
  success: boolean;
  runId: string;
  total: number;
  accepted: number;
  failed: number;
  ambiguous: number;
  retryable: number;
  skipped: number;
  error?: string;
  /** Set when an already-sent newsletter is handled as a no-op */
  alreadySent?: boolean;
}

interface NewsletterContentRow {
  id: string;
  newsletter_date: string;
  gemini_analysis: string;
  is_sent: boolean;
  sent_at: string | null;
}

interface SubscriberRow {
  id: string;
  email: string;
  name: string | null;
  is_active: boolean;
}

interface RunCreationResult {
  id: string;
  status: string;
  snapshot_completed: boolean;
  is_terminal: boolean;
}

interface ReconciliationResult {
  status: string;
  total: number;
  accepted: number;
  failed: number;
  ambiguous: number;
  retryable: number;
  skipped: number;
  pending: number;
  claimed: number;
}

// ─── Fixed allowlist of error codes ──────────────────────────────────────────

type ErrorCode = 'timeout' | 'network_error' | 'rate_limited' | 'provider_5xx' | 'provider_4xx' | 'recipient_rejected' | 'unknown_error';

/** Runtime set of valid error codes for assertion in tests */
export const ALLOWED_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  'timeout',
  'network_error',
  'rate_limited',
  'provider_5xx',
  'provider_4xx',
  'recipient_rejected',
  'unknown_error',
]);

// ─── Option Validation ───────────────────────────────────────────────────────

function validateOptions(options: DeliveryOptions): void {
  const { batchSize = 50, concurrency = 10, timeoutMs = 10 * 60 * 1000, newsletterDate, staleLeaseSeconds = 300, workerId } = options;
  if (batchSize < 1 || batchSize > 200) {
    throw new Error('batchSize must be between 1 and 200');
  }
  if (concurrency < 1 || concurrency > 100) {
    throw new Error('concurrency must be between 1 and 100');
  }
  if (timeoutMs < 1000 || timeoutMs > 60 * 60 * 1000) {
    throw new Error('timeoutMs must be between 1000 and 3600000');
  }
  // Validate newsletterDate format: YYYY-MM-DD
  if (!newsletterDate || !/^\d{4}-\d{2}-\d{2}$/.test(newsletterDate)) {
    throw new Error('newsletterDate must be a valid YYYY-MM-DD string');
  }
  // Validate staleLeaseSeconds
  if (staleLeaseSeconds !== undefined && (staleLeaseSeconds < 1 || staleLeaseSeconds > 86400)) {
    throw new Error('staleLeaseSeconds must be between 1 and 86400');
  }
  // Validate workerId if provided
  if (workerId !== undefined && (typeof workerId !== 'string' || workerId.trim() === '')) {
    throw new Error('workerId must be a non-empty string');
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Execute newsletter delivery for a given date.
 *
 * Requires an already-prepared newsletter in `newsletter_content`.
 * Idempotent:
 *  - Rerunning with the same date resumes an existing run.
 *  - If already sent (is_sent=true), returns a successful no-op with existing run data
 *    or explicit no-op result if no ledger exists (legacy row).
 */
export async function executeDelivery(options: DeliveryOptions): Promise<DeliveryResult> {
  validateOptions(options);

  const {
    supabase,
    newsletterDate,
    workerId = `worker-${process.pid}-${Date.now()}`,
    batchSize = 50,
    concurrency = 10,
    staleLeaseSeconds = 300,
    signal: externalSignal,
    timeoutMs = 10 * 60 * 1000,
  } = options;

  // Compose AbortSignal: internal timeout MUST still abort when external signal is supplied
  const internalController = new AbortController();
  const timeout = setTimeout(() => internalController.abort(), timeoutMs);

  // Effective signal: aborts when EITHER internal timeout OR external signal fires
  const effectiveSignal = composeAbortSignals(internalController.signal, externalSignal);

  try {
    // 1. Load newsletter content
    const content = await loadUnsentNewsletter(supabase, newsletterDate);

    // 1b. Idempotent no-op: if already sent, load existing run or return explicit no-op
    if (content.is_sent) {
      return await handleAlreadySent(supabase, content);
    }

    // 2. Create or resume delivery run (atomic RPC, never resets terminal)
    const idempotencyKey = `delivery-${newsletterDate}`;
    const run = await getOrCreateRun(supabase, content.id, idempotencyKey);

    if (run.is_terminal) {
      // Run already completed/failed — return its current state
      const reconciliation = await reconcileRun(supabase, run.id);
      return {
        success: reconciliation.status === 'completed',
        runId: run.id,
        total: reconciliation.total,
        accepted: reconciliation.accepted,
        failed: reconciliation.failed,
        ambiguous: reconciliation.ambiguous,
        retryable: reconciliation.retryable,
        skipped: reconciliation.skipped,
      };
    }

    // 3. Snapshot all active subscribers (atomic server-side RPC, immutable once done)
    await snapshotRecipients(supabase, run.id);

    // 4. Recover stale claims → ambiguous (explicit step, never auto-reclaim)
    await recoverStaleClaims(supabase, run.id, staleLeaseSeconds);

    // 5. Process batches until done
    let hasMore = true;
    while (hasMore) {
      if (effectiveSignal.aborted) {
        throw new Error('Delivery aborted by signal/timeout');
      }

      const batch = await claimBatch(supabase, run.id, workerId, batchSize);
      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      // Send with bounded worker pool (Promise.allSettled)
      await sendBatchBounded(supabase, batch, content, workerId, concurrency, effectiveSignal);
    }

    // 6. Reconcile run status
    const reconciliation = await reconcileRun(supabase, run.id);

    // 7. Update newsletter_content.is_sent based on reconciliation
    await updateContentSentFlag(supabase, content.id, reconciliation);

    return {
      success: reconciliation.status === 'completed',
      runId: run.id,
      total: reconciliation.total,
      accepted: reconciliation.accepted,
      failed: reconciliation.failed,
      ambiguous: reconciliation.ambiguous,
      retryable: reconciliation.retryable,
      skipped: reconciliation.skipped,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Already-Sent Idempotent No-Op ──────────────────────────────────────────

/**
 * Handle the case where newsletter is already marked as sent.
 * - If a delivery run exists, load its reconciliation and return success.
 * - If no run exists (legacy sent row), return explicit no-op result.
 * Never creates a new run or sends anything.
 */
async function handleAlreadySent(
  supabase: SupabaseClient,
  content: NewsletterContentRow,
): Promise<DeliveryResult> {
  const idempotencyKey = `delivery-${content.newsletter_date}`;

  // Try loading existing run (do NOT create one)
  const { data: existingRun } = await supabase
    .from('newsletter_delivery_runs')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingRun) {
    // Load reconciliation from existing run
    const reconciliation = await reconcileRun(supabase, existingRun.id);
    return {
      success: true,
      runId: existingRun.id,
      total: reconciliation.total,
      accepted: reconciliation.accepted,
      failed: reconciliation.failed,
      ambiguous: reconciliation.ambiguous,
      retryable: reconciliation.retryable,
      skipped: reconciliation.skipped,
      alreadySent: true,
    };
  }

  // Legacy: is_sent=true but no delivery ledger exists.
  // Return explicit successful no-op with stable non-PII identifier.
  return {
    success: true,
    runId: `legacy-no-ledger-${content.id}`,
    total: 0,
    accepted: 0,
    failed: 0,
    ambiguous: 0,
    retryable: 0,
    skipped: 0,
    alreadySent: true,
  };
}

// ─── AbortSignal Composition ─────────────────────────────────────────────────

/**
 * Compose two AbortSignals: the result aborts when EITHER fires.
 * Internal timeout must still work when an external signal is supplied.
 */
export function composeAbortSignals(
  internal: AbortSignal,
  external?: AbortSignal,
): AbortSignal {
  if (!external) return internal;

  // If either is already aborted, return it
  if (external.aborted) return external;
  if (internal.aborted) return internal;

  const controller = new AbortController();

  const abort = () => controller.abort();
  internal.addEventListener('abort', abort, { once: true });
  external.addEventListener('abort', abort, { once: true });

  return controller.signal;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Load newsletter content by date.
 * Unlike previous implementation, does NOT throw on is_sent=true;
 * instead returns the row so the caller can handle the idempotent no-op.
 */
async function loadUnsentNewsletter(
  supabase: SupabaseClient,
  newsletterDate: string,
): Promise<NewsletterContentRow> {
  const { data, error } = await supabase
    .from('newsletter_content')
    .select('id, newsletter_date, gemini_analysis, is_sent, sent_at')
    .eq('newsletter_date', newsletterDate)
    .single();

  if (error || !data) {
    throw new Error(
      `Newsletter content for ${newsletterDate} not found. Run prepare-newsletter first.`,
    );
  }

  return data as NewsletterContentRow;
}

/**
 * Atomic run creation/resume via service-role RPC.
 * Never resets a terminal (completed/failed) run.
 */
async function getOrCreateRun(
  supabase: SupabaseClient,
  contentId: string,
  idempotencyKey: string,
): Promise<RunCreationResult> {
  const { data, error } = await supabase.rpc('get_or_create_delivery_run', {
    p_content_id: contentId,
    p_idempotency_key: idempotencyKey,
  });

  if (error || !data) {
    throw new Error(`get_or_create_delivery_run failed: ${error?.message ?? 'no data returned'}`);
  }

  return data as RunCreationResult;
}

/**
 * Immutable, transactional snapshot via server-side RPC.
 * INSERT...SELECTs all currently active subscribers in one statement.
 * ON CONFLICT safe. Records total and completion atomically.
 * Refuses to expand a completed snapshot (idempotent).
 */
async function snapshotRecipients(
  supabase: SupabaseClient,
  runId: string,
): Promise<{ total: number; alreadyCompleted: boolean }> {
  const { data, error } = await supabase.rpc('snapshot_delivery_recipients', {
    p_run_id: runId,
  });

  if (error || !data) {
    throw new Error(`snapshot_delivery_recipients failed: ${error?.message ?? 'no data returned'}`);
  }

  const result = data as { total: number; already_completed: boolean };
  console.log(
    `[delivery] Snapshot: ${result.total} recipients (${result.already_completed ? 'existing, immutable' : 'newly created'})`,
  );

  return { total: result.total, alreadyCompleted: result.already_completed };
}

/**
 * Explicitly mark stale claimed rows as ambiguous.
 * Never auto-reclaims: a crashed worker may have received provider acceptance.
 */
async function recoverStaleClaims(
  supabase: SupabaseClient,
  runId: string,
  staleSeconds: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('recover_stale_claims', {
    p_run_id: runId,
    p_stale_seconds: staleSeconds,
  });

  if (error) {
    throw new Error(`recover_stale_claims failed: ${error.message}`);
  }

  const count = data as number;
  if (count > 0) {
    console.log(`[delivery] Recovered ${count} stale claims → ambiguous`);
  }
  return count;
}

interface ClaimedRecipient {
  delivery_id: string;
  subscriber_id: string;
}

/**
 * Claim a batch of pending/retryable recipients.
 * Does NOT claim stale rows (that's recover_stale_claims).
 */
async function claimBatch(
  supabase: SupabaseClient,
  runId: string,
  workerId: string,
  batchSize: number,
): Promise<ClaimedRecipient[]> {
  const { data, error } = await supabase.rpc('claim_delivery_batch', {
    p_run_id: runId,
    p_worker_id: workerId,
    p_batch_size: batchSize,
    p_stale_seconds: 0, // ignored by new RPC but kept for signature compat
  });

  if (error) throw new Error(`claim_delivery_batch failed: ${error.message}`);
  return (data || []) as ClaimedRecipient[];
}

/**
 * Send a batch of claimed recipients with a bounded worker pool.
 * Uses Promise.allSettled so all in-flight sends settle cleanly.
 * Fetches only active subscribers; marks inactive/missing as skipped.
 * Propagates the first DB state error encountered.
 */
async function sendBatchBounded(
  supabase: SupabaseClient,
  batch: ClaimedRecipient[],
  content: NewsletterContentRow,
  workerId: string,
  concurrency: number,
  signal: AbortSignal,
): Promise<void> {
  // Fetch subscriber details — only active ones
  const subscriberIds = batch.map((b) => b.subscriber_id);
  const { data: subscribers, error } = await supabase
    .from('subscribers')
    .select('id, email, name, is_active')
    .in('id', subscriberIds);

  if (error || !subscribers) {
    throw new Error(`Failed to fetch subscriber details for batch: ${error?.message}`);
  }

  const subscriberMap = new Map<string, SubscriberRow>(
    subscribers.map((s) => [s.id, s as SubscriberRow]),
  );

  const newsletterData = {
    geminiAnalysis: content.gemini_analysis,
    date: new Date(content.newsletter_date).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    }),
  };

  // Bounded worker pool using Promise.allSettled
  // Process items in chunks of `concurrency` size
  let firstDbError: Error | null = null;

  // Build tasks for each item
  const tasks: Array<() => Promise<void>> = [];
  for (const item of batch) {
    const subscriber = subscriberMap.get(item.subscriber_id);

    // Missing or inactive subscriber → skip (terminal exclusion)
    if (!subscriber || !subscriber.is_active) {
      const detail = !subscriber ? 'subscriber_not_found' : 'subscriber_inactive';
      tasks.push(() => markOutcome(supabase, item.delivery_id, 'skipped', workerId, null, null, detail));
      continue;
    }

    tasks.push(() => sendAndMark(supabase, item, subscriber, newsletterData, workerId));
  }

  // Execute in bounded pool windows
  for (let i = 0; i < tasks.length; i += concurrency) {
    if (signal.aborted) throw new Error('Aborted during batch send');

    const chunk = tasks.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map((fn) => fn()));

    // Propagate first DB state error
    for (const result of results) {
      if (result.status === 'rejected') {
        const err = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        if (!firstDbError) {
          firstDbError = err;
        }
      }
    }
  }

  // Propagate the first DB state error after all in-flight sends have settled
  if (firstDbError) {
    throw firstDbError;
  }
}

async function sendAndMark(
  supabase: SupabaseClient,
  item: ClaimedRecipient,
  subscriber: SubscriberRow,
  newsletterData: { geminiAnalysis: string; date: string },
  workerId: string,
): Promise<void> {
  let result: SingleSendResult;

  try {
    result = await sendSingleRecipient(
      { email: subscriber.email, name: subscriber.name || undefined },
      newsletterData,
    );
  } catch (err) {
    // Network/unknown error — classify as ambiguous (might have been sent)
    // Do NOT store raw error message (may contain PII like email in URL)
    const normalizedCode = err instanceof Error
      ? normalizeErrorCode(err.message)
      : 'unknown_error';
    await markOutcome(
      supabase,
      item.delivery_id,
      'ambiguous',
      workerId,
      null,
      'ambiguous',
      normalizedCode,
    );
    return;
  }

  if (result.accepted) {
    await markOutcome(supabase, item.delivery_id, 'provider_accepted', workerId, result.messageId);
  } else if (result.retryable) {
    // 429/5xx → retryable (will be re-claimed up to max_attempts)
    const normalizedError = result.error ? normalizeErrorCode(result.error) : 'provider_5xx';
    await markOutcome(supabase, item.delivery_id, 'retryable', workerId, null, 'retryable', normalizedError);
  } else {
    // 4xx permanent rejection
    const normalizedError = result.error ? normalizeErrorCode(result.error) : 'provider_4xx';
    await markOutcome(supabase, item.delivery_id, 'failed', workerId, null, 'permanent', normalizedError);
  }
}

/**
 * Normalize error messages to safe codes — never store raw provider messages
 * that may contain PII (email addresses in bounce messages, etc).
 *
 * Returns ONLY a fixed allowlisted code, never sanitized portions of raw provider text.
 */
export function normalizeErrorCode(message: string): ErrorCode {
  if (/timeout/i.test(message)) return 'timeout';
  if (/ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(message)) return 'network_error';
  if (/\b429\b/i.test(message)) return 'rate_limited';
  if (/\b5\d{2}\b/i.test(message)) return 'provider_5xx';
  if (/\b4\d{2}\b/i.test(message)) return 'provider_4xx';
  if (/suppression|bounce|invalid/i.test(message)) return 'recipient_rejected';
  // Default: never leak raw provider text
  return 'unknown_error';
}

async function markOutcome(
  supabase: SupabaseClient,
  deliveryId: string,
  status: 'provider_accepted' | 'failed' | 'ambiguous' | 'skipped' | 'retryable',
  workerId: string,
  messageId?: string | null,
  failureCategory?: string | null,
  failureDetail?: string | null,
): Promise<void> {
  const { data, error } = await supabase.rpc('mark_delivery_outcome', {
    p_delivery_id: deliveryId,
    p_status: status,
    p_provider_message_id: messageId || null,
    p_failure_category: failureCategory || null,
    p_failure_detail: failureDetail || null,
    p_claimed_by: workerId,
  });

  if (error) {
    // DB write failure is serious — throw to halt processing
    console.error(`[delivery] mark_delivery_outcome failed for delivery ${deliveryId}: ${error.message}`);
    throw new Error(`DB state write failed: ${error.message}`);
  }

  // Check RPC boolean: false means the row was not in 'claimed' state for this worker
  if (data === false) {
    throw new Error(
      `mark_delivery_outcome returned false for ${deliveryId} — row not in expected claimed state for worker`,
    );
  }
}

async function reconcileRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<ReconciliationResult> {
  const { data, error } = await supabase.rpc('reconcile_delivery_run', {
    p_run_id: runId,
  });

  if (error || !data) {
    throw new Error(`reconcile_delivery_run failed: ${error?.message}`);
  }

  return data as ReconciliationResult;
}

/**
 * Update newsletter_content.is_sent ONLY when fully terminal:
 * - No pending, claimed, retryable, or ambiguous rows remain
 * - accepted + permanent failures + skips are all terminal
 *
 * After the update, re-reads the row to verify is_sent=true.
 * If the re-read shows is_sent=false, throws (never accepts blindly).
 * PGRST116/zero-row from the update triggers a re-read:
 *   - is_sent=true → another worker beat us (acceptable idempotent case)
 *   - is_sent=false → inconsistent state, throw
 */
export async function updateContentSentFlag(
  supabase: SupabaseClient,
  contentId: string,
  reconciliation: ReconciliationResult,
): Promise<void> {
  // is_sent = true ONLY when:
  // - No pending/claimed/retryable/ambiguous remain
  // - status is 'completed' (all terminal: accepted + failed + skipped)
  const shouldMarkSent =
    reconciliation.status === 'completed' &&
    reconciliation.pending === 0 &&
    reconciliation.claimed === 0 &&
    reconciliation.retryable === 0 &&
    reconciliation.ambiguous === 0;

  if (!shouldMarkSent) {
    // Non-terminal: do NOT mark as sent
    return;
  }

  const { data, error } = await supabase
    .from('newsletter_content')
    .update({
      is_sent: true,
      sent_at: new Date().toISOString(),
      subscriber_count: reconciliation.accepted,
    })
    .eq('id', contentId)
    .eq('is_sent', false)
    .select('id')
    .single();

  if (error && error.code !== 'PGRST116') {
    // Real DB error (not a "no rows" condition)
    throw new Error(`Failed to update newsletter_content.is_sent: ${error.message}`);
  }

  if (!data) {
    // PGRST116 or zero rows: re-read to verify actual state
    const { data: reread, error: rereadErr } = await supabase
      .from('newsletter_content')
      .select('id, is_sent')
      .eq('id', contentId)
      .single();

    if (rereadErr || !reread) {
      throw new Error(`Failed to re-read newsletter_content after sent update: ${rereadErr?.message}`);
    }

    if (reread.is_sent === true) {
      // Another worker already set it — idempotent, acceptable
      console.log('[delivery] newsletter_content already marked sent (concurrent update or idempotent)');
      return;
    }

    // is_sent is still false after the update returned zero rows — inconsistent
    throw new Error(
      'Failed to update newsletter_content.is_sent: zero-row update but re-read shows is_sent=false',
    );
  }
}
