-- Remove legacy Shopify database tables
-- The user_sessions table was only used for Shopify authentication
-- and is no longer needed since migrating to Stripe

DROP TABLE IF EXISTS user_sessions;