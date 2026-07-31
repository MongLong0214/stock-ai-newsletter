# PR #111 deployment runbook

This change introduces fail-closed API dependencies and eight database migrations. Treat the database and application rollout as one controlled change window; do not merge and auto-deploy without completing the gates below.

## 1. Required configuration

Provision these values in every target Vercel environment and in the newsletter GitHub Actions environment before database rollout:

- `RATE_LIMIT_HMAC_SECRET`: independent random secret, at least 32 characters.
- `UNSUBSCRIBE_TOKEN_SECRET`: current AEAD token secret, at least 32 characters.
- `UNSUBSCRIBE_TOKEN_SECRET_PREV`: optional previous token secret during a rotation window; remove only after all old links have expired.
- Existing required values: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SENDGRID_API_KEY`, and the configured SendGrid sender identity.

Never reuse `CRON_SECRET`, a Supabase key, or a SendGrid key as either new secret. Record ownership and rotation dates in the production secret manager, not in Git.

## 2. Pre-deploy gates

1. Confirm a restorable database backup and record its recovery point.
2. Run the repository test, type-check, lint, and production build commands from a clean checkout.
3. Run the Supabase CLI migration dry-run against the intended linked project and inspect the generated statements.
4. Confirm migration versions are unique. The expected order around this release is:
   - `056_drop_unused_indexes.sql` (already present on `main`)
   - `056b_lockdown_stock_price_cache_writes.sql`
   - `057_rate_limit_and_double_optin.sql`
   - `058_newsletter_delivery_state_machine.sql`
   - `059_delivery_hardening.sql`
   - `060_generation_provenance.sql`
   - `061_model_type_and_prediction_freshness.sql`
   - `062_atomic_membership_history.sql`
   - `063_latest_per_theme_and_search_indexes.sql`
5. Schedule outside KRX market hours. Migration `056b` truncates the recoverable `stock_price_cache`, so the first subsequent reads must refill it from KIS.
6. Pause newsletter preparation/sending jobs for the change window and ensure no delivery run is active.

## 3. Rollout order

1. Provision and verify secrets without exposing their values in logs.
2. Apply migrations in the order above. Stop immediately on the first error; do not continue manually with later files.
3. Deploy the exact verified PR commit to Vercel.
4. Resume scheduled jobs only after all smoke checks pass.

The old application may rely on anonymous cache writes, while the new application fails closed when the rate-limit RPC is absent. Keep the interval between database apply and application promotion as short as possible and use a maintenance window rather than reversing the security grants.

## 4. Smoke checks

- Vercel deployment and GitHub status checks are successful.
- `/subscribe` renders both the normal form and `?confirm=<valid-test-token>` flow; confirmation remains an explicit POST action.
- `/unsubscribe?token=<valid-test-token>` renders and only mutates after explicit confirmation.
- Missing/invalid tokens return generic errors without email addresses or token material in URLs/logs.
- Rate-limited requests return `429`; unavailable rate-limit storage/configuration returns `503`.
- Stock price and daily-close routes work after cache refill.
- Theme ranking/comparison endpoints no longer log missing `load_theme_score_windows` or `load_latest_published_comparison_runs` RPCs.
- A controlled newsletter run reaches a terminal reconciled state without duplicate recipient sends.
- Generated Open Graph images include the pinned background and return `image/png`.

## 5. Rollback and incident handling

- Stop cron/newsletter jobs first.
- Roll back the application to the previously verified deployment if application smoke checks fail.
- Do **not** restore anonymous cache writes as a quick rollback. Keep the security boundary and diagnose service-role configuration instead.
- New additive tables/functions may remain during an application rollback. For destructive-data or schema failures, restore the recorded database recovery point rather than attempting ad-hoc reverse SQL.
- Treat any delivery with an uncertain provider acknowledgement as `ambiguous`; never automatically resend it.
- Preserve deployment, migration, delivery-run, and reconciliation logs for incident review, while excluding raw email addresses and token values.
