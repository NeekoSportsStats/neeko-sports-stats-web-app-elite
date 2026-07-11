-- Swap squadId 140↔160 club mapping for Sydney Swans and Western Bulldogs only.
-- AFL Fantasy emits squadId 160 for Sydney players and 140 for Western Bulldogs players,
-- which is reversed vs the team_id×10 pattern used by every other club.
CREATE OR REPLACE FUNCTION public.resolve_fantasy_paste(p_json jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'afl'
AS $function$
DECLARE
v_elem        jsonb;
v_fantasy_id  bigint;
v_squad_id    integer;
v_first_name  text;
v_last_name   text;
v_full_name   text;
v_price       integer;
v_raw_status  text;
v_status      text;
v_player_id   integer;
v_match_method text;
v_club_abbrev text;
v_team_id     integer;
v_resolved    jsonb := '[]'::jsonb;
v_unresolved  jsonb := '[]'::jsonb;
v_new_maps    jsonb := '[]'::jsonb;
v_resolve_result jsonb;
v_total       integer := 0;
BEGIN
FOR v_elem IN SELECT * FROM jsonb_array_elements(p_json)
LOOP
v_total := v_total + 1;
v_fantasy_id := (v_elem->>'id')::bigint;
v_squad_id   := (v_elem->>'squadId')::integer;
v_first_name := v_elem->>'firstName';
v_last_name  := v_elem->>'lastName';
v_full_name  := trim(v_first_name || ' ' || v_last_name);
v_price      := (v_elem->>'price')::integer;
v_raw_status := lower(COALESCE(v_elem->>'status', ''));

-- Map status to canonical DB values
v_status := CASE
WHEN v_raw_status IN ('playing', 'available', 'active') THEN 'AVAILABLE'
WHEN v_raw_status IN ('not-playing', 'not playing', 'injured', 'out', 'suspended') THEN 'OUT'
WHEN v_raw_status IN ('test', 'dtd', 'questionable') THEN 'TEST'
ELSE 'AVAILABLE'
END;

-- Translate squadId → 3-letter club abbreviation
-- Explicit overrides for four-digit squadIds (GCS/GWS)
v_club_abbrev := CASE v_squad_id
WHEN 1000 THEN 'GCS'
WHEN 1010 THEN 'GWS'
ELSE NULL
END;

IF v_club_abbrev IS NULL THEN
v_team_id := v_squad_id / 10;
v_club_abbrev := CASE v_team_id
WHEN 1  THEN 'ADE'
WHEN 2  THEN 'BRL'
WHEN 3  THEN 'CAR'
WHEN 4  THEN 'COL'
WHEN 5  THEN 'ESS'
WHEN 6  THEN 'FRE'
WHEN 7  THEN 'GEE'
WHEN 8  THEN 'HAW'
WHEN 9  THEN 'MEL'
WHEN 10 THEN 'NTH'
WHEN 11 THEN 'PTA'
WHEN 12 THEN 'RIC'
WHEN 13 THEN 'STK'
WHEN 14 THEN 'WBD'  -- AFL Fantasy squadId 140 = Western Bulldogs (reversed vs team_id×10)
WHEN 15 THEN 'WCE'
WHEN 16 THEN 'SYD'  -- AFL Fantasy squadId 160 = Sydney Swans (reversed vs team_id×10)
WHEN 17 THEN 'GCS'
WHEN 18 THEN 'GWS'
ELSE NULL
END;
END IF;

v_player_id := NULL;
v_match_method := NULL;

-- Resolution path (a): fantasy_id_map exact lookup
SELECT fim.player_id INTO v_player_id
FROM afl.fantasy_id_map fim
WHERE fim.fantasy_id = v_fantasy_id;

IF v_player_id IS NOT NULL THEN
v_match_method := 'fantasy_id';
ELSE
-- Resolution path (b): name + club via resolve_price_names
IF v_club_abbrev IS NOT NULL THEN
v_resolve_result := public.resolve_price_names(
jsonb_build_array(
jsonb_build_object(
'source_name', v_full_name,
'club', v_club_abbrev,
'price', v_price,
'status', v_status
)
)
);

-- Extract player_id from resolved array
IF (v_resolve_result->'resolved') IS NOT NULL
AND jsonb_array_length(v_resolve_result->'resolved') > 0 THEN
v_player_id := (v_resolve_result->'resolved'->0->>'player_id')::integer;
v_match_method := 'name_' || COALESCE(v_resolve_result->'resolved'->0->>'matched_by', 'unknown');
END IF;
END IF;
END IF;

IF v_player_id IS NOT NULL THEN
v_resolved := v_resolved || jsonb_build_object(
'fantasy_id', v_fantasy_id,
'player_id', v_player_id,
'player_name', v_full_name,
'club', v_club_abbrev,
'price', v_price,
'status', v_status,
'matched_by', v_match_method
);

-- Track new mappings that could be learned
IF v_match_method != 'fantasy_id' THEN
v_new_maps := v_new_maps || jsonb_build_object(
'fantasy_id', v_fantasy_id,
'player_id', v_player_id,
'player_name', v_full_name,
'matched_by', v_match_method
);
END IF;
ELSE
v_unresolved := v_unresolved || jsonb_build_object(
'fantasy_id', v_fantasy_id,
'player_name', v_full_name,
'club', v_club_abbrev,
'squad_id', v_squad_id,
'price', v_price,
'status', v_status
);
END IF;
END LOOP;

RETURN jsonb_build_object(
'summary', jsonb_build_object(
'total', v_total,
'resolved_count', jsonb_array_length(v_resolved),
'unresolved_count', jsonb_array_length(v_unresolved),
'new_mapping_count', jsonb_array_length(v_new_maps)
),
'resolved', v_resolved,
'unresolved', v_unresolved,
'new_mappings', v_new_maps
);
END;
$function$;
