/*
  # Fix orphan customer profile status

  One Stripe customer (cus_UChS1kubXIn4Za) exists in stripe_customers but has
  no corresponding subscription record. Their profile shows subscription_status
  = 'not_started' — this is an abandoned checkout attempt where the user
  initiated checkout but never completed payment.

  Fix: Reset their profile subscription_status to NULL (free tier) so the
  access state RPC correctly returns billing_state = 'free' and they are not
  confused for a premium user.
*/

UPDATE public.profiles p
SET subscription_status = NULL
FROM public.stripe_customers sc
LEFT JOIN public.subscriptions s
  ON (s.user_id = sc.user_id OR s.stripe_customer_id = sc.customer_id)
WHERE p.id = sc.user_id
  AND s.id IS NULL
  AND p.subscription_status = 'not_started'
  AND COALESCE(p.is_manual_premium, false) = false;
