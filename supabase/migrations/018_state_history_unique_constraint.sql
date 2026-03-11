-- CMPV4-003: Add unique constraint on theme_state_history_v2 (theme_id, effective_from)
-- Prevents duplicate state rows for the same theme at the same effective date.
-- Backfill script uses upsert with onConflict on this constraint.

ALTER TABLE theme_state_history_v2
  ADD CONSTRAINT uq_theme_state_history_v2_theme_effective
    UNIQUE (theme_id, effective_from);
