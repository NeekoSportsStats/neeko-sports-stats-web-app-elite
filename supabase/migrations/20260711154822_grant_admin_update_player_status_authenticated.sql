
-- Grant authenticated users execute on admin_update_player_status
-- The function already has is_admin_user() guard internally, so this is safe
GRANT EXECUTE ON FUNCTION public.admin_update_player_status(integer, text) TO authenticated;
