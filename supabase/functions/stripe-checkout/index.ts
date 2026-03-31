import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'Neeko Sports Stats', version: '1.0.0' },
});

const ALLOWED_ORIGINS = new Set([
  'https://www.neekostats.com.au',
  'https://neekostats.com.au',
  'http://localhost:5173',
  'http://localhost:3000',
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

let corsHeaders: Record<string, string> = getCorsHeaders(new Request('https://placeholder'));

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

async function resolvePriceId(plan: string): Promise<string | null> {
  if (plan === 'monthly') {
    const envPrice = Deno.env.get('STRIPE_PRICE_MONTHLY');
    if (envPrice) return envPrice;
  } else if (plan === 'yearly') {
    const envPrice = Deno.env.get('STRIPE_PRICE_YEARLY');
    if (envPrice) return envPrice;
  }

  if (plan === 'monthly' || plan === 'yearly') {
    const { data: planRow, error: planErr } = await supabase
      .from('stripe_products_config')
      .select('price_id')
      .eq('plan_key', plan)
      .maybeSingle();

    if (planErr) {
      console.error('stripe-checkout: failed to load plan config', planErr);
    }

    if (planRow?.price_id) {
      console.log(`stripe-checkout: resolved ${plan} price from DB: ${planRow.price_id}`);
      return planRow.price_id;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
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

    if (!plan || (plan !== 'monthly' && plan !== 'yearly')) {
      return err('Invalid plan — must be "monthly" or "yearly"');
    }

    if (!success_url || typeof success_url !== 'string') {
      return err('Missing required parameter: success_url');
    }
    if (!cancel_url || typeof cancel_url !== 'string') {
      return err('Missing required parameter: cancel_url');
    }

    const price_id = await resolvePriceId(plan);

    if (!price_id) {
      console.error(`stripe-checkout: could not resolve price_id for plan "${plan}"`);
      return err(`No price configured for plan: ${plan}`, 500);
    }

    console.log('stripe-checkout: inputs', { plan, price_id });

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return err('Missing Authorization header', 401);
    }

    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);

    if (getUserError || !user) {
      console.error('stripe-checkout: auth failed', getUserError);
      return err('Failed to authenticate user', 401);
    }

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
      // Create new Stripe customer
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });

      console.log(`stripe-checkout: created Stripe customer ${newCustomer.id} for user ${user.id}`);

      const { error: createCustomerError } = await supabase
        .from('stripe_customers')
        .insert({ user_id: user.id, customer_id: newCustomer.id });

      if (createCustomerError) {
        console.error('stripe-checkout: failed to save customer', createCustomerError);
        try {
          await stripe.customers.del(newCustomer.id);
        } catch (_) { /* ignore cleanup errors */ }
        return err('Failed to create customer record', 500);
      }

      customerId = newCustomer.id;
    } else {
      customerId = customer.customer_id;
    }

    console.log('stripe-checkout: creating session', { customerId, price_id, plan });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url,
      payment_method_collection: 'always',
      metadata: {
        supabase_user_id: user.id,
        email: user.email,
        plan: plan,
      },
    });

    console.log(`stripe-checkout: session created ${session.id}`);

    return ok({ sessionId: session.id, url: session.url });
  } catch (e: any) {
    console.error('stripe-checkout: unhandled error', {
      message: e?.message,
      type: e?.type,
      code: e?.code,
      param: e?.param,
      statusCode: e?.statusCode,
    });

    return err('Unable to start checkout session', 500);
  }
});
