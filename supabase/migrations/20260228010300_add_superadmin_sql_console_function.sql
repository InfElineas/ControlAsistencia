-- Superadmin SQL console function for in-platform advanced administration.
CREATE OR REPLACE FUNCTION public.execute_superadmin_sql(_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rows JSONB := '[]'::JSONB;
  v_row_count BIGINT := 0;
  v_trimmed TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = v_uid
      AND role = 'superadmin'
  ) THEN
    RAISE EXCEPTION 'Solo superadmin puede ejecutar consultas SQL';
  END IF;

  v_trimmed := btrim(COALESCE(_query, ''));

  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'La consulta SQL está vacía';
  END IF;

  IF lower(split_part(v_trimmed, ' ', 1)) = 'select' OR lower(split_part(v_trimmed, ' ', 1)) = 'with' THEN
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) FROM (%s) AS q',
      v_trimmed
    ) INTO v_rows;

    v_row_count := COALESCE(jsonb_array_length(v_rows), 0);

    RETURN jsonb_build_object(
      'type', 'select',
      'row_count', v_row_count,
      'rows', COALESCE(v_rows, '[]'::jsonb)
    );
  END IF;

  EXECUTE v_trimmed;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'type', 'command',
    'row_count', v_row_count,
    'rows', '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.execute_superadmin_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_superadmin_sql(TEXT) TO authenticated;
