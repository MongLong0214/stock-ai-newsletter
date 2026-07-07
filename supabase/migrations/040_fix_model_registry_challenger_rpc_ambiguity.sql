BEGIN;

-- 039의 register_model_registry_challenger는 RETURNS TABLE 출력 컬럼(model_version 등)이
-- plpgsql 변수로 등록되어 ON CONFLICT (model_version) 절에서 "column reference is ambiguous"
-- 런타임 오류를 일으킨다. #variable_conflict use_column으로 비한정 이름을 컬럼 우선으로 해석시킨다
-- (본문 내 변수 참조는 전부 p_/v_ 접두사라 영향 없음).

CREATE OR REPLACE FUNCTION public.register_model_registry_challenger(
  p_model_version TEXT,
  p_model_type TEXT,
  p_coefficients JSONB,
  p_train_start DATE,
  p_train_end DATE,
  p_val_metrics JSONB,
  p_gate_result JSONB
)
RETURNS TABLE (
  model_version TEXT,
  status TEXT,
  promoted_at TIMESTAMPTZ,
  archived_model_version TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_archived_model_version TEXT;
BEGIN
  SELECT mr.model_version
  INTO v_archived_model_version
  FROM public.model_registry mr
  WHERE mr.status = 'challenger'
    AND mr.model_version <> p_model_version
  FOR UPDATE;

  IF v_archived_model_version IS NOT NULL THEN
    UPDATE public.model_registry
    SET status = 'archived'
    WHERE public.model_registry.model_version = v_archived_model_version;
  END IF;

  INSERT INTO public.model_registry (
    model_version, model_type, coefficients, train_range, val_metrics, gate_result, status
  )
  VALUES (
    p_model_version,
    p_model_type,
    p_coefficients,
    daterange(p_train_start, p_train_end, '[)'),
    p_val_metrics,
    p_gate_result,
    'challenger'
  )
  ON CONFLICT (model_version) DO UPDATE SET
    model_type = EXCLUDED.model_type,
    coefficients = EXCLUDED.coefficients,
    train_range = EXCLUDED.train_range,
    val_metrics = EXCLUDED.val_metrics,
    gate_result = EXCLUDED.gate_result,
    status = 'challenger';

  RETURN QUERY
  SELECT mr.model_version, mr.status, mr.promoted_at, v_archived_model_version
  FROM public.model_registry mr
  WHERE mr.model_version = p_model_version;
END;
$$;

COMMIT;
