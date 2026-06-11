import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: { name: 'NeekoSports', version: '2.0.0' },
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Season pass duration: 23 rounds x 7 days = ~161 days
const SEASON_ACCESS_DAYS = 161;
const ROUND_PASS_7D_DAYS = 7;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      console.error('stripe-webhook: missing stripe-signature header');
      return new Response('Missing stripe-signature header', { status: 400 });
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('stripe-webhook: signature verification failed:', err.message);
      return new Response(`Signature verification failed: ${err.message}`, { status: 400 });
    }

    console.log(`stripe-webhook: received event ${event.type} [${event.id}]`);

    // Idempotency check
    const { data: existing, error: existingErr } = await supabase
      .from('stripe_webhook_events')
      .select('id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existingErr) {
      console.warn('stripe-webhook: idempotency check error (non-fatal):', existingErr.message);
    }

    if (existing) {
      console.log(`stripe-webhook: skipping duplicate event ${event.id}`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    const { error: logError } = await supabase.from('stripe_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      received_at: new Date().toISOString(),
    });

    if (logError) {
      console.warn('stripe-webhook: failed to log event (non-fatal):', logError.message);
    }

    EdgeRuntime.waitUntil(handleEvent(event));

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err: any) {
    console.error('stripe-webhook: unhandled top-level error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: 'Request failed' }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});

async function handleEvent(event: Stripe.Event) {
  try {
    console.log(`stripe-webhook: processing event ${event.type} [${event.id}]`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const planType = (session.metadata?.plan_type ?? session.metadata?.plan ?? 'round_pass_7d') as 'weekly' | 'season' | 'round_pass_7d';
        console.log(`stripe-webhook: checkout.session.completed — mode=${session.mode}, plan_type=${planType}`);

        if (session.mode === 'subscription' && session.customer && session.subscription) {
          await syncSubscriptionFromStripe(session.subscription as string, planType === 'weekly' ? 'weekly' : 'weekly');
        } else if (session.mode === 'payment' && session.customer) {
          await grantOneTimeAccess(session.customer as string, session, planType as 'season' | 'round_pass_7d');
        }
        break;
      }

      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.created — sub=${sub.id}, status=${sub.status}`);
        await syncSubscriptionFromStripe(sub.id, 'weekly');
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.updated — sub=${sub.id}, status=${sub.status}, cancel_at_period_end=${sub.cancel_at_period_end}`);
        await syncSubscriptionFromStripe(sub.id, 'weekly');
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.deleted — sub=${sub.id}`);
        await syncSubscriptionFromStripe(sub.id, 'weekly');
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`stripe-webhook: invoice.paid — invoice=${invoice.id}`);
        if (invoice.subscription) {
          await syncSubscriptionFromStripe(invoice.subscription as string, 'weekly');
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`stripe-webhook: invoice.payment_succeeded — invoice=${invoice.id}`);
        if (invoice.subscription) {
          await syncSubscriptionFromStripe(invoice.subscription as string, 'weekly');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`stripe-webhook: invoice.payment_failed — invoice=${invoice.id}`);
        if (invoice.subscription) {
          await syncSubscriptionFromStripe(invoice.subscription as string, 'weekly');
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        console.log(`stripe-webhook: charge.refunded — charge=${charge.id}, payment_intent=${charge.payment_intent}`);
        if (charge.payment_intent) {
          await revokeSeasonAccessForRefund(charge.payment_intent as string);
        }
        break;
      }

      default:
        console.log(`stripe-webhook: unhandled event type: ${event.type}`);
    }

    await supabase
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', event.id);

    console.log(`stripe-webhook: finished processing ${event.type} [${event.id}]`);
  } catch (err: any) {
    console.error(`stripe-webhook: error handling event ${event.type} [${event.id}]:`, err?.message ?? err);
  }
}

async function resolveUserId(customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('stripe_customers')
    .select('user_id')
    .or(`customer_id.eq.${customerId},stripe_id.eq.${customerId}`)
    .maybeSingle();

  if (error) {
    console.error('stripe-webhook: resolveUserId query error:', error.message);
  }

  if (data?.user_id) {
    return data.user_id;
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (profileError) {
    console.error('stripe-webhook: resolveUserId profiles fallback error:', profileError.message);
  }

  if (profileData?.id) {
    return profileData.id;
  }

  console.warn('stripe-webhook: could not resolve user for customer', customerId);
  return null;
}

async function isManualPremium(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_manual_premium, manual_premium_expires_at')
    .eq('id', userId)
    .maybeSingle();

  if (!data?.is_manual_premium) return false;
  if (!data.manual_premium_expires_at) return true;
  return new Date(data.manual_premium_expires_at) > new Date();
}

async function grantOneTimeAccess(customerId: string, session: Stripe.Checkout.Session, planType: 'season' | 'round_pass_7d') {
  console.log(`stripe-webhook: grantOneTimeAccess — customer=${customerId}, plan=${planType}`);

  const userId = await resolveUserId(customerId);
  if (!userId) {
    console.warn('stripe-webhook: grantOneTimeAccess — no user found for customer', customerId);
    return;
  }

  const accessDays = planType === 'round_pass_7d' ? ROUND_PASS_7D_DAYS : SEASON_ACCESS_DAYS;
  const now = new Date();

  // Access stacking: start from max(now, existing active period_end)
  let accessStart = now;
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('current_period_end, status')
    .eq('user_id', userId)
    .in('status', ['active'])
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.current_period_end) {
    const existingEnd = new Date(existing.current_period_end);
    if (existingEnd > now) {
      accessStart = existingEnd;
      console.log(`stripe-webhook: stacking access from ${existingEnd.toISOString()}`);
    }
  }

  const expiresAt = new Date(accessStart.getTime() + accessDays * 24 * 60 * 60 * 1000);
  const subId = `${planType}_${session.id}`;

  const { error: upsertError } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      profile_id: userId,
      stripe_subscription_id: subId,
      stripe_customer_id: customerId,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: expiresAt.toISOString(),
      cancel_at_period_end: false,
      plan_type: planType,
      updated_at: now.toISOString(),
    }, { onConflict: 'stripe_subscription_id' });

  if (upsertError) {
    console.error('stripe-webhook: grantOneTimeAccess subscriptions upsert error:', upsertError.message);
  } else {
    console.log(`stripe-webhook: ${planType} access granted to user=${userId}, expires=${expiresAt.toISOString()}`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      premium_expires_at: expiresAt.toISOString(),
      subscription_status: 'active',
    })
    .eq('id', userId);

  if (profileError) {
    console.warn('stripe-webhook: grantOneTimeAccess profile update error (non-fatal):', profileError.message);
  }
}

async function revokeSeasonAccessForRefund(paymentIntentId: string) {
  console.log(`stripe-webhook: revokeSeasonAccessForRefund — payment_intent=${paymentIntentId}`);

  try {
    // Season pass records use stripe_subscription_id = 'season_{session_id}'
    // We need to find the checkout session that matches this payment intent
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });

    const session = sessions.data[0];
    if (!session) {
      console.warn(`stripe-webhook: no checkout session found for payment_intent=${paymentIntentId}`);
      return;
    }

    const planType = session.metadata?.plan_type ?? session.metadata?.plan ?? 'season';
    const fakeSubId = `${planType}_${session.id}`;
    console.log(`stripe-webhook: revoking season access for subscription record=${fakeSubId}`);

    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'refunded',
        current_period_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', fakeSubId);

    if (error) {
      console.error('stripe-webhook: revokeSeasonAccessForRefund update error:', error.message);
    } else {
      console.log(`stripe-webhook: season access revoked for session=${session.id}`);
    }
  } catch (err: any) {
    console.error('stripe-webhook: revokeSeasonAccessForRefund error:', err?.message ?? err);
  }
}

async function syncSubscriptionFromStripe(subscriptionId: string, planType: 'weekly' | 'season' = 'weekly') {
  console.log(`stripe-webhook: syncSubscriptionFromStripe — subscription=${subscriptionId}`);

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['customer'],
    });

    console.log(`stripe-webhook: retrieved subscription — id=${subscription.id}, status=${subscription.status}, cancel_at_period_end=${subscription.cancel_at_period_end}`);

    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (!customerId) {
      console.error(`stripe-webhook: no customer found for subscription ${subscriptionId}`);
      return;
    }

    const userId = await resolveUserId(customerId);

    if (!userId) {
      console.warn('stripe-webhook: no user found for customer — skipping sync');
      return;
    }

    const manualOverride = await isManualPremium(userId);
    if (manualOverride && subscription.status !== 'active' && subscription.status !== 'trialing') {
      console.log('stripe-webhook: skipping profile downgrade — user has manual premium');
      return;
    }

    const priceId = subscription.items?.data?.[0]?.price?.id ?? null;

    // Write to stripe_subscriptions (raw Stripe mirror, bigint timestamps)
    const { error: syncError } = await supabase
      .from('stripe_subscriptions')
      .upsert({
        customer_id: customerId,
        subscription_id: subscription.id,
        price_id: priceId,
        status: subscription.status,
        current_period_start: subscription.current_period_start ?? null,
        current_period_end: subscription.current_period_end ?? null,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      }, { onConflict: 'subscription_id' });

    if (syncError) {
      console.warn('stripe-webhook: stripe_subscriptions upsert error (non-fatal):', syncError.message);
    }

    // Convert Unix timestamps to ISO for the subscriptions table
    const periodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null;
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

    // Write to subscriptions (source of truth for is_premium_user, timestamptz)
    const { error: subSyncError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: userId,
        profile_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        status: subscription.status,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        plan_type: planType,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });

    if (subSyncError) {
      console.error('stripe-webhook: subscriptions upsert error:', subSyncError.message);
    } else {
      console.log(`stripe-webhook: subscriptions synced — status=${subscription.status}, user=${userId}, plan_type=${planType}`);
    }

    // Sync profiles mirror so v_user_access and is_active remain consistent
    // even before the next scheduled health check runs.
    const isActiveNow =
      ['active', 'trialing', 'canceled', 'cancelled'].includes(subscription.status) &&
      periodEnd !== null &&
      new Date(periodEnd) > new Date();

    const { error: profileSyncError } = await supabase
      .from('profiles')
      .update({
        subscription_status: subscription.status,
        billing_period_end: periodEnd,
        billing_period_start: periodStart,
        is_active: isActiveNow,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileSyncError) {
      console.warn('stripe-webhook: profile sync error (non-fatal):', profileSyncError.message);
    } else {
      console.log(`stripe-webhook: profile synced — status=${subscription.status}, is_active=${isActiveNow}, user=${userId}`);
    }
  } catch (err: any) {
    console.error(`stripe-webhook: error syncing subscription ${subscriptionId}:`, err?.message ?? err);
  }
}
