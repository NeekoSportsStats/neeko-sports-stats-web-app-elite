import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

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

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: { name: 'Neeko Sports', version: '1.0.0' },
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Missing authorization header' }, { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // Resolve stripe customer via stripe_customers.user_id (the only valid column)
    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = customer?.customer_id;

    if (!customerId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .maybeSingle();

      customerId = profile?.stripe_customer_id;
    }

    if (!customerId) {
      return Response.json(
        { error: 'No Stripe customer found for this account. Please contact support.' },
        { status: 404, headers: corsHeaders }
      );
    }

    const ALLOWED_RETURN_ORIGINS = new Set(['https://www.neekostats.com.au', 'https://neekostats.com.au', 'http://localhost:5173', 'http://localhost:3000']);
    const requestOrigin = req.headers.get('origin') ?? '';
    const safeOrigin = ALLOWED_RETURN_ORIGINS.has(requestOrigin) ? requestOrigin : 'https://www.neekostats.com.au';
    const returnUrl = `${safeOrigin}/account`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('Portal error:', err);
    return Response.json({ error: "Request failed" }, { status: 500, headers: corsHeaders });
  }
});
