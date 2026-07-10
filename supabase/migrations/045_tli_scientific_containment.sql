BEGIN;

ALTER TABLE public.model_registry
  ADD COLUMN IF NOT EXISTS scientific_claim_status TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (scientific_claim_status IN ('unvalidated','eligible','invalidated')),
  ADD COLUMN IF NOT EXISTS scientific_release_status TEXT NOT NULL DEFAULT 'blocked'
    CHECK (scientific_release_status IN ('blocked','internal','public')),
  ADD COLUMN IF NOT EXISTS scientific_claim_reason TEXT,
  ADD COLUMN IF NOT EXISTS invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS experiment_cycle_id UUID NULL;

UPDATE public.model_registry
SET
  scientific_claim_status = 'invalidated',
  scientific_release_status = 'blocked',
  scientific_claim_reason = 'legacy_non_pit_evidence',
  invalidated_at = COALESCE(invalidated_at, now()),
  status = CASE WHEN status = 'challenger' THEN 'archived' ELSE status END
WHERE (model_type = 'm1_logistic' OR model_version LIKE 'm1-%');

UPDATE public.model_registry
SET
  scientific_claim_status = 'unvalidated',
  scientific_release_status = 'blocked',
  scientific_claim_reason = 'descriptive_phase_only'
WHERE (model_type = 'b_abl' OR model_version LIKE 'b-abl-%');

ALTER TABLE public.theme_labels
  ADD COLUMN IF NOT EXISTS scientific_use_status TEXT NOT NULL DEFAULT 'exploratory_only'
    CHECK (scientific_use_status IN ('exploratory_only','confirmatory_eligible')),
  ADD COLUMN IF NOT EXISTS scientific_use_reason TEXT NOT NULL DEFAULT 'legacy_non_pit_evidence';

UPDATE public.theme_labels
SET
  scientific_use_status = 'exploratory_only',
  scientific_use_reason = 'legacy_non_pit_evidence'
WHERE labeler_version = 'gta-v1';

ALTER TABLE public.theme_labels
  ADD CONSTRAINT theme_labels_gta_v1_scientific_use_check
  CHECK (
    labeler_version <> 'gta-v1'
    OR (
      scientific_use_status = 'exploratory_only'
      AND scientific_use_reason = 'legacy_non_pit_evidence'
    )
  );

REVOKE EXECUTE ON FUNCTION public.promote_model_registry_version(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.rollback_model_registry_version(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.register_model_registry_challenger(TEXT, TEXT, JSONB, DATE, DATE, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_model_registry_mutation_before_scientific_cycles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'model_registry mutation is blocked until the Todo 12 cycle RPC is installed'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER guard_model_registry_before_scientific_cycles
  BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.model_registry
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.reject_model_registry_mutation_before_scientific_cycles();

COMMIT;
