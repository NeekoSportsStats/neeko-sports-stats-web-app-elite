import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1];
    if (!projectRef) {
      return new Response(JSON.stringify({ error: "Could not parse project ref from SUPABASE_URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secrets = [
      { name: "STRIPE_PRICE_SEASON", value: "price_1TM0kpEKV8332a9YHhTfin2z" },
      { name: "STRIPE_PRICE_WEEKLY", value: "price_1TM0kpEKV8332a9YDaho0M3J" },
    ];

    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(secrets),
    });

    const body = await res.text();

    return new Response(
      JSON.stringify({
        status: res.status,
        ok: res.ok,
        body: body || "(empty — likely success)",
        secrets_attempted: secrets.map(s => s.name),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
