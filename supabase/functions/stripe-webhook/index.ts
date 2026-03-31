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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      console.error('stripe-webhook: missing stripe-signature header');
      return new Response('Missing stripe-signature header', { status: 400, headers: corsHeaders });
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('stripe-webhook: signature verification failed:', err.message);
      return new Response(`Signature verification failed: ${err.message}`, { status: 400, headers: corsHeaders });
    }

    console.log(`stripe-webhook: received event ${event.type} [${event.id}]`);

    // Idempotency: skip if we've already processed this exact event
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log event to DB for audit trail
    await supabase.from('stripe_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    }).then(({ error }) => {
      if (error) console.warn('stripe-webhook: failed to log event (non-fatal):', error.message);
      else console.log(`stripe-webhook: event logged to DB: ${event.id}`);
    });

    EdgeRuntime.waitUntil(handleEvent(event));

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('stripe-webhook: unhandled top-level error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: 'Request failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleEvent(event: Stripe.Event) {
  try {
    console.log(`stripe-webhook: processing event ${event.type} [${event.id}]`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`stripe-webhook: checkout.session.completed — mode=${session.mode}, customer=${session.customer}`);
        if (session.mode === 'subscription' && session.customer) {
          await syncCustomerFromStripe(session.customer as string);
        }
        break;
      }

      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.created — sub=${sub.id}, customer=${sub.customer}, status=${sub.status}`);
        if (sub.customer) {
          await syncCustomerFromStripe(sub.customer as string);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.updated — sub=${sub.id}, customer=${sub.customer}, status=${sub.status}`);
        if (sub.customer) {
          await syncCustomerFromStripe(sub.customer as string);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`stripe-webhook: invoice.paid — invoice=${invoice.id}, customer=${invoice.customer}`);
        if (invoice.customer) {
          await syncCustomerFromStripe(invoice.customer as string);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`stripe-webhook: subscription.deleted — sub=${sub.id}, customer=${sub.customer}`);
        if (sub.customer) {
          await deactivateCustomer(sub.customer as string);
        }
        break;
      }

      default:
        console.log(`stripe-webhook: unhandled event type: ${event.type}`);
    }

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
    .eq('customer_id', customerId)
    .maybeSingle();

  if (error) {
    console.error(`stripe-webhook: resolveUserId query error for customer ${customerId}:`, error.message);
  }

  if (data?.user_id) {
    console.log(`stripe-webhook: resolved user_id=${data.user_id} for customer=${customerId}`);
    return data.user_id;
  }

  // Fallback: profiles.stripe_customer_id
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (profileError) {
    console.error(`stripe-webhook: resolveUserId profiles fallback error for customer ${customerId}:`, profileError.message);
  }

  if (profileData?.id) {
    console.log(`stripe-webhook: resolved user_id=${profileData.id} via profiles.stripe_customer_id fallback`);
    return profileData.id;
  }

  console.warn(`stripe-webhook: could not resolve user_id for customer ${customerId}`);
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

async function syncCustomerFromStripe(customerId: string) {
  console.log(`stripe-webhook: syncCustomerFromStripe — customer=${customerId}`);

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 1,
    status: 'all',
    expand: ['data.default_payment_method'],
  });

  const userId = await resolveUserId(customerId);

  if (subscriptions.data.length === 0) {
    console.log(`stripe-webhook: no subscriptions found for customer ${customerId}`);
    if (userId) {
      const manualOverride = await isManualPremium(userId);
      if (!manualOverride) {
        await deactivateProfile(userId);
      } else {
        console.log(`stripe-webhook: skipping deactivation — user ${userId} has manual premium`);
      }
    }
    return;
  }

  const subscription = subscriptions.data[0];
  const isActive = subscription.status === 'active' || subscription.status === 'trialing';

  console.log(`stripe-webhook: subscription found — id=${subscription.id}, status=${subscription.status}, isActive=${isActive}`);

  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  if (!userId) {
    console.warn(`stripe-webhook: no user found for customer ${customerId} — profile NOT updated`);
    return;
  }

  // Guard: never downgrade a manual premium user via Stripe cancellation
  const manualOverride = await isManualPremium(userId);
  if (manualOverride && !isActive) {
    console.log(`stripe-webhook: skipping profile downgrade — user ${userId} has manual premium`);
    return;
  }

  // Profiles is the single source of truth for access decisions
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        // premium_expires_at always mirrors billing_period_end — access runs until period end
        // even after cancellation (Condition 3 fallback, aligned with get_access_state logic)
        premium_expires_at: periodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (profileError) {
    console.error(`stripe-webhook: profiles upsert error for user ${userId}:`, profileError.message);
  } else {
    console.log(`stripe-webhook: profiles updated — user=${userId}, status=${subscription.status}, periodEnd=${periodEnd}`);
  }
}

async function deactivateCustomer(customerId: string) {
  console.log(`stripe-webhook: deactivateCustomer — customer=${customerId}`);
  const userId = await resolveUserId(customerId);
  if (userId) {
    const manualOverride = await isManualPremium(userId);
    if (!manualOverride) {
      await deactivateProfile(userId);
    } else {
      console.log(`stripe-webhook: skipping cancellation — user ${userId} has manual premium`);
    }
  }
}

async function deactivateProfile(userId: string) {
  console.log(`stripe-webhook: deactivateProfile — user=${userId}`);

  // NOTE: billing_period_end and premium_expires_at are intentionally preserved.
  // Cancelled users retain access until billing_period_end passes.
  // get_access_state() and v_user_access both enforce the date check.
  const { error } = await supabase
    .from('profiles')
    .update({
      subscription_status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('is_manual_premium', false);

  if (error) {
    console.error(`stripe-webhook: deactivateProfile error for user ${userId}:`, error.message);
  } else {
    console.log(`stripe-webhook: profile deactivated — user=${userId}`);
  }
}
