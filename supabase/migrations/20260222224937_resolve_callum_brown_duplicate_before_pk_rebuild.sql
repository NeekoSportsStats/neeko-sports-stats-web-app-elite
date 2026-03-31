
/*
  # Resolve Callum Brown duplicate before PK rebuild

  ## Summary
  The stale pre-season row "Callum M. Brown / Greater Western Sydney Giants / round 0"
  has no ai_summary and no updated_at. The canonical row "Callum Brown / Greater
  Western Sydney / round 0" has the real summary. The stale row is deleted (it holds
  no user data — ai_summary IS NULL) to allow the new (player_id, season, round_number)
  primary key to be created without a uniqueness violation.

  ## Changes
  - DELETE one null-summary stale row for player_id=705, round_number=0
    (player='Callum M. Brown', team='Greater Western Sydney Giants')

  ## Notes
  - The canonical summary row is preserved
  - No summary data is lost
*/

DELETE FROM afl.ai_player_summaries
WHERE player = 'Callum M. Brown'
  AND team = 'Greater Western Sydney Giants'
  AND season = 2026
  AND round_number = 0
  AND ai_summary IS NULL;
