-- Make afl.commit_price_round tolerant of both key shapes:
--   cleaned_price OR price  (resolver outputs 'price')
--   player_status OR status (resolver outputs 'status')
-- No other logic changed.
CREATE OR REPLACE FUNCTION afl.commit_price_round(p_rows jsonb, p_season integer, p_round integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'afl', 'public'
AS $function$
DECLARE
v_locked        BOOLEAN;
v_upserted      INTEGER;
v_input_total   INTEGER;
v_valid_rows    INTEGER;
v_status_synced INTEGER := 0;
BEGIN
SELECT count(*) INTO v_input_total
FROM jsonb_array_elements(p_rows) AS r;

SELECT is_locked INTO v_locked
FROM afl.price_rounds
WHERE season = p_season AND round = p_round;

IF v_locked IS TRUE THEN
RETURN jsonb_build_object(
'ok',    false,
'error', format('Round %s is locked. Unlock it before committing prices.', p_round)
);
END IF;

-- Accept 'cleaned_price' (legacy OpsConsole) OR 'price' (resolver native output)
SELECT count(*) INTO v_valid_rows
FROM jsonb_array_elements(p_rows) AS r
WHERE (r->>'player_id') IS NOT NULL
AND COALESCE(r->>'cleaned_price', r->>'price') IS NOT NULL
AND COALESCE(r->>'cleaned_price', r->>'price')::INTEGER > 0;

IF v_valid_rows = 0 THEN
RETURN jsonb_build_object(
'ok',    false,
'error', 'No valid rows to commit. Ensure all rows have a player_id and a price above 0.'
);
END IF;

INSERT INTO afl.price_rounds (season, round, label, is_locked)
VALUES (
p_season,
p_round,
CASE WHEN p_round = 0 THEN 'Opening Round' ELSE format('Round %s', p_round) END,
false
)
ON CONFLICT (season, round) DO NOTHING;

-- Accept 'cleaned_price' OR 'price'; 'player_status' OR 'status'
INSERT INTO afl.player_prices (player_id, price, season, round, status, updated_at, created_at)
SELECT
deduped.player_id,
deduped.cleaned_price,
p_season,
p_round,
afl.normalise_player_status(deduped.player_status),
now(),
now()
FROM (
SELECT DISTINCT ON ((r->>'player_id')::INTEGER)
(r->>'player_id')::INTEGER                                        AS player_id,
COALESCE(r->>'cleaned_price', r->>'price')::INTEGER               AS cleaned_price,
COALESCE(r->>'player_status', r->>'status')                       AS player_status
FROM jsonb_array_elements(p_rows) AS r
WHERE (r->>'player_id') IS NOT NULL
AND COALESCE(r->>'cleaned_price', r->>'price') IS NOT NULL
AND COALESCE(r->>'cleaned_price', r->>'price')::INTEGER > 0
ORDER BY (r->>'player_id')::INTEGER
) deduped
ON CONFLICT (player_id, season, round)
DO UPDATE SET
price      = EXCLUDED.price,
status     = EXCLUDED.status,
updated_at = now();

GET DIAGNOSTICS v_upserted = ROW_COUNT;

IF v_upserted > 0 THEN
BEGIN
SELECT afl.sync_cache_status_from_prices() INTO v_status_synced;
EXCEPTION WHEN OTHERS THEN
RAISE WARNING 'commit_price_round: sync_cache_status_from_prices failed: %', SQLERRM;
v_status_synced := 0;
END;
END IF;

RETURN jsonb_build_object(
'ok',            true,
'season',        p_season,
'round',         p_round,
'inserted',      v_upserted,
'status_synced', v_status_synced,
'skipped',       v_valid_rows - v_upserted,
'total',         v_input_total,
'matched',       v_valid_rows,
'pipeline',      'queued'
);
END;
$function$;
