/*
  # Add exec_sql RPC function

  1. Function
    - `exec_sql(query text)` - Execute raw SQL and return results as JSON
    - Allows querying afl schema from client
    - Restricted to SELECT statements only for security

  2. Security
    - Public access (anyone can execute SELECT queries)
    - Only SELECT queries allowed
*/

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only allow SELECT statements for security
  IF query !~* '^\s*SELECT' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', query) INTO result;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Grant execute to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO authenticated, anon;