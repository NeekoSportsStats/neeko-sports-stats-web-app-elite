import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'Neeko Sports Stats', version: '2.0.0' },
});

const ALLOWED_ORIGINS = new Set([
  'https://www.neekostats.com.au',
  'https://neekostats.com.au',
  'http://localhost:5173',
  'http://localhost:3000',
]);

const ALLOWED_REDIRECT_HOSTS = new Set([
  'www.neekostats.com.au',
  'neekostats.com.au',
  'localhost',
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.neekostats.com.au';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Vary': 'Origin',
  };
}

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_REDIRECT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function isPlaceholderId(id: string): boolean {
  if (!id) return true;
  if (id.includes('placeholder')) return true;
  if (!id.startsWith('price_') && !id.startsWith('prod_')) return true;
  return false;
}

interface PlanConfig {
  price_id: string;
  interval: string;
  plan_type: 'round_pass_7d' | 'season' | 'weekly';
}

async function resolvePlanConfig(plan: string): Promise<PlanConfig | null> {
  if (plan === 'weekly') {
    const envPrice = Deno.env.get('STRIPE_PRICE_WEEKLY');
    if (envPrice && !isPlaceholderId(envPrice)) {
      return { price_id: envPrice, interval: 'week', plan_type: 'weekly' };
    }
  } else if (plan === 'season') {
    const envPrice = Deno.env.get('STRIPE_PRICE_SEASON');
    if (envPrice && !isPlaceholderId(envPrice)) {
      return { price_id: envPrice, interval: 'one_time', plan_type: 'season' };
    }
  } else if (plan === 'round_pass_7d') {
    const envPrice = Deno.env.get('STRIPE_PRICE_ROUND_PASS_7D');
    if (envPrice && !isPlaceholderId(envPrice)) {
      return { price_id: envPrice, interval: 'one_time', plan_type: 'round_pass_7d' };
    }
  }

  const { data: planRow, error: planErr } = await supabase
    .from('stripe_products_config')
    .select('price_id, interval')
    .eq('plan_key', plan)
    .maybeSingle();

  if (planErr) {
    console.error('stripe-checkout: failed to load plan config from DB', planErr);
  }

  if (planRow?.price_id && !isPlaceholderId(planRow.price_id)) {
    const interval = planRow.interval ?? (plan === 'weekly' ? 'week' : 'one_time');
    console.log(`stripe-checkout: resolved ${plan} price from DB: ${planRow.price_id}`);
    return { price_id: planRow.price_id, interval, plan_type: plan as 'round_pass_7d' | 'season' | 'weekly' };
  }

  const envKeyMap: Record<string, string> = {
    season: 'STRIPE_PRICE_SEASON',
    weekly: 'STRIPE_PRICE_WEEKLY',
    round_pass_7d: 'STRIPE_PRICE_ROUND_PASS_7D',
  };
  const envKey = envKeyMap[plan] ?? `STRIPE_PRICE_${plan.toUpperCase()}`;
  console.error(
    `stripe-checkout: price_id for plan "${plan}" is a placeholder or missing. ` +
    `Set ${envKey} in Supabase Edge Function secrets, ` +
    `or update stripe_products_config with a real Stripe price ID.`
  );
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  function ok(body: object) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  function err(message: string, status = 400, extra?: object) {
    return new Response(JSON.stringify({ error: message, ...extra }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return err('Method not allowed', 405);
  }

  try {
    if (!stripeSecret || !stripeSecret.startsWith('sk_')) {
      console.error('stripe-checkout: STRIPE_SECRET_KEY missing or invalid format');
      return err('Stripe is not configured', 500);
    }

    const body = await req.json().catch(() => ({}));
    const { plan, success_url, cancel_url } = body;

    if (!plan || (plan !== 'weekly' && plan !== 'season' && plan !== 'round_pass_7d')) {
      return err('Invalid plan — must be "weekly", "season", or "round_pass_7d"');
    }

    if (!success_url || typeof success_url !== 'string') {
      return err('Missing required parameter: success_url');
    }
    if (!cancel_url || typeof cancel_url !== 'string') {
      return err('Missing required parameter: cancel_url');
    }

    if (!isAllowedRedirectUrl(success_url)) {
      console.error('stripe-checkout: invalid success_url domain');
      return err('Invalid success_url domain', 400);
    }
    if (!isAllowedRedirectUrl(cancel_url)) {
      console.error('stripe-checkout: invalid cancel_url domain');
      return err('Invalid cancel_url domain', 400);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return err('Missing Authorization header', 401);
    }

    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);

    if (getUserError || !user) {
      console.error('stripe-checkout: auth failed', getUserError?.message);
      return err('Failed to authenticate user', 401);
    }

    // Rate limit: 5 checkout attempts per user per hour
    const windowStart = new Date();
    windowStart.setMinutes(0, 0, 0);
    const { data: rateCount, error: rateErr } = await supabase.rpc('increment_rate_limit', {
      p_user_id: user.id,
      p_function_name: 'stripe-checkout',
      p_window_start: windowStart.toISOString(),
    });
    if (rateErr) {
      console.error('stripe-checkout: rate limit check failed', rateErr);
    } else if (typeof rateCount === 'number' && rateCount > 5) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const planConfig = await resolvePlanConfig(plan);

    if (!planConfig) {
      return err(
        `Checkout unavailable for plan "${plan}" — Stripe price IDs have not been configured. ` +
        `Contact support or try again later.`,
        503
      );
    }

    const { price_id, interval, plan_type } = planConfig;
    const isOneTime = interval === 'one_time';

    console.log(`stripe-checkout: plan=${plan_type}, mode=${isOneTime ? 'payment' : 'subscription'}, price=${price_id}, user=${user.id}`);

    const { data: customer, error: getCustomerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (getCustomerError) {
      console.error('stripe-checkout: failed to fetch customer', getCustomerError);
      return err('Failed to fetch customer information', 500);
    }

    let customerId: string;

    if (!customer?.customer_id) {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });

      console.log('stripe-checkout: created new Stripe customer', newCustomer.id);

      const { error: createCustomerError } = await supabase
        .from('stripe_customers')
        .insert({ user_id: user.id, customer_id: newCustomer.id });

      if (createCustomerError) {
        console.error('stripe-checkout: failed to save customer', createCustomerError);
        try { await stripe.customers.del(newCustomer.id); } catch (_) {}
        return err('Failed to create customer record', 500);
      }

      customerId = newCustomer.id;
    } else {
      customerId = customer.customer_id;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: isOneTime ? 'payment' : 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}&plan=${plan_type}`,
      cancel_url,
      metadata: {
        user_id: user.id,
        email: user.email ?? '',
        plan: plan_type,
        plan_type: plan_type,
        plan_key: plan_type,
        product: 'neeko_plus',
        access_days: plan_type === 'round_pass_7d' ? '7' : plan_type === 'season' ? '161' : '',
      },
    };

    if (!isOneTime) {
      sessionParams.payment_method_collection = 'always';
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(`stripe-checkout: session created ${session.id} for user ${user.id}`);

    return ok({ sessionId: session.id, url: session.url });
  } catch (e: any) {
    console.error('stripe-checkout: unhandled error', {
      message: e?.message,
      type: e?.type,
      code: e?.code,
    });

    return err('Unable to start checkout session', 500);
  }
});
