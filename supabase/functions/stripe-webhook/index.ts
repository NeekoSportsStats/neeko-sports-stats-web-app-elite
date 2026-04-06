import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: { name: 'NeekoSports', version: '1.0.0' },
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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

    // Idempotency check — query by event_id
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

    // Log the event — explicitly set event_id so idempotency works
    const { error: logError } = await supabase.from('stripe_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      received_at: new Date().toISOString(),
    });

    if (logError) {
      console.warn('stripe-webhook: failed to log event (non-fatal):', logError.message);
    } else {
      console.log(`stripe-webhook: event logged to DB: ${event.id}`);
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
        console.log(`stripe-webhook: checkout.session.completed — mode=${session.mode}`);

        if (session.mode === 'subscription' && session.customer && session.subscription) {
          await syncSubscriptionFromStripe(session.subscription as string);
        }
        break;
      }

      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.created — sub=${sub.id}, status=${sub.status}`);
        await syncSubscriptionFromStripe(sub.id);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.updated — sub=${sub.id}, status=${sub.status}, cancel_at_period_end=${sub.cancel_at_period_end}`);
        await syncSubscriptionFromStripe(sub.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.deleted — sub=${sub.id}`);
        await syncSubscriptionFromStripe(sub.id);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`stripe-webhook: invoice.paid — invoice=${invoice.id}`);
        if (invoice.subscription) {
          await syncSubscriptionFromStripe(invoice.subscription as string);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`stripe-webhook: invoice.payment_failed — invoice=${invoice.id}`);
        if (invoice.subscription) {
          await syncSubscriptionFromStripe(invoice.subscription as string);
        }
        break;
      }

      default:
        console.log(`stripe-webhook: unhandled event type: ${event.type}`);
    }

    // Mark event processed
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
  // Primary: stripe_customers table
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

  // Fallback: profiles.stripe_customer_id
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

async function syncSubscriptionFromStripe(subscriptionId: string) {
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

    // Write to stripe_subscriptions (raw Stripe mirror, unix timestamps)
    // The DB trigger on this table auto-syncs into public.subscriptions
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
      }, { onConflict: 'customer_id' });

    if (syncError) {
      console.error('stripe-webhook: stripe_subscriptions upsert error:', syncError.message);
    } else {
      console.log(`stripe-webhook: upserted stripe_subscriptions — status=${subscription.status}`);
    }

    // Also write directly to public.subscriptions (access control table)
    // This is the direct path that makes is_premium_user() return true immediately
    const periodStart = subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000).toISOString()
      : null;
    const periodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;

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
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' });

    if (subSyncError) {
      console.error('stripe-webhook: subscriptions upsert error:', subSyncError.message);
    } else {
      console.log(`stripe-webhook: upserted subscriptions — status=${subscription.status}, user=${userId}`);
    }
  } catch (err: any) {
    console.error(`stripe-webhook: error syncing subscription ${subscriptionId}:`, err?.message ?? err);
  }
}
