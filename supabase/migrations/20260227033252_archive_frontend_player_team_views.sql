/*
  # Archive Frontend Player/Team Views

  ## Summary
  Creates archive_frontend schema and moves v_players and v_teams views
  into it, as these views supported the now-archived Players and Teams pages.

  ## Archived Objects
  - public.v_players  → archive_frontend.v_players
  - public.v_teams    → archive_frontend.v_teams

  ## Notes
  - No data is deleted — all objects are recoverable
  - The Rankings, AI Analysis, and Match Centre pages are unaffected
  - archive_frontend schema is created with IF NOT EXISTS for safety
*/

CREATE SCHEMA IF NOT EXISTS archive_frontend;

ALTER VIEW IF EXISTS public.v_players SET SCHEMA archive_frontend;
ALTER VIEW IF EXISTS public.v_teams   SET SCHEMA archive_frontend;
