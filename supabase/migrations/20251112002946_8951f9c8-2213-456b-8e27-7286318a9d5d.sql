-- Remove duplicate premium status tracking from profiles table
-- Premium status is now tracked exclusively in user_roles table

-- Drop the is_premium column as it's redundant with user_roles
ALTER TABLE profiles DROP COLUMN IF EXISTS is_premium;

-- Add comment explaining the change
COMMENT ON TABLE profiles IS 'User profile data. Premium status is tracked in user_roles table.';