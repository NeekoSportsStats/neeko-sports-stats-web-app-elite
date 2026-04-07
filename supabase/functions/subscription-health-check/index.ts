import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Vary': 'Origin',
  };
}

async function verifyAdmin(req: Request): Promise<{ ok: boolean; status?: number; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { ok: false, status: 401, error: 'Missing Authorization header' };

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return { ok: false, status: 401, error: 'Missing bearer token' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return { ok: false, status: 500, error: 'Server misconfiguration' };

  if (token === serviceKey) return { ok: true };

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return { ok: false, status: 401, error: 'Invalid or expired token' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.is_admin !== true) return { ok: false, status: 403, error: 'Forbidden: admin access required' };

  return { ok: true };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status ?? 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Run health check RPC
    const { data: healthResult, error: rpcError } = await supabase
      .rpc('check_subscription_health');

    if (rpcError) {
      console.error('subscription-health-check: RPC error:', rpcError.message);
      return new Response(
        JSON.stringify({ ok: false, error: rpcError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const totalIssues: number = healthResult?.total_issues ?? 0;

    // 2. Short-circuit if clean
    if (totalIssues === 0) {
      console.log('subscription-health-check: no issues found — system healthy');
      return new Response(
        JSON.stringify({ ok: true, total_issues: 0, message: 'Subscription system healthy' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Build alert payload
    const alertPayload = {
      type: 'subscription_health_alert',
      total_issues: totalIssues,
      summary: healthResult?.summary ?? {},
      issues: healthResult?.issues ?? [],
      checked_at: new Date().toISOString(),
    };

    console.warn(`subscription-health-check: ${totalIssues} issue(s) detected`);
    console.warn('subscription-health-check: payload:', JSON.stringify(alertPayload, null, 2));

    // 4a. Log to admin.command_logs (Option A — always runs)
    const logEntry = {
      command: 'subscription_health_check',
      status: 'warn',
      result: alertPayload,
      duration_ms: 0,
    };

    const { error: logError } = await supabase
      .from('admin_command_logs')
      .insert(logEntry);

    if (logError) {
      console.warn('subscription-health-check: failed to log to admin_command_logs (non-fatal):', logError.message);
    } else {
      console.log('subscription-health-check: issue alert logged to admin_command_logs');
    }

    // 4b. Send to external webhook (Option B — only if env var set)
    const webhookUrl = Deno.env.get('HEALTH_ALERT_WEBHOOK');
    if (webhookUrl) {
      try {
        const webhookRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertPayload),
        });
        console.log(`subscription-health-check: webhook dispatched — status=${webhookRes.status}`);
      } catch (webhookErr: unknown) {
        const msg = webhookErr instanceof Error ? webhookErr.message : String(webhookErr);
        console.warn('subscription-health-check: webhook dispatch failed (non-fatal):', msg);
      }
    }

    return new Response(
      JSON.stringify({ ok: false, total_issues: totalIssues, ...alertPayload }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('subscription-health-check: unhandled error:', msg);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
