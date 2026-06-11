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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SEASON_ID = "price_1TM0kpEKV8332a9YHhTfin2z";
    const WEEKLY_ID = "price_1TM0kpEKV8332a9YDaho0M3J";
    const ROUND_PASS_ID = "price_1Th2xaEKV8332a9YdWDMnksH";

    const [seasonRes, weeklyRes, roundPassRes] = await Promise.all([
      fetch(`https://api.stripe.com/v1/prices/${SEASON_ID}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      }),
      fetch(`https://api.stripe.com/v1/prices/${WEEKLY_ID}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      }),
      fetch(`https://api.stripe.com/v1/prices/${ROUND_PASS_ID}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      }),
    ]);

    const [season, weekly, roundPass] = await Promise.all([seasonRes.json(), weeklyRes.json(), roundPassRes.json()]);

    const results = {
      round_pass_7d: {
        id: roundPass.id,
        exists: roundPassRes.ok,
        error: roundPassRes.ok ? null : (roundPass.error?.message ?? "not found"),
        currency: roundPass.currency,
        unit_amount: roundPass.unit_amount,
        type: roundPass.type,
        recurring: roundPass.recurring ?? null,
        product: roundPass.product,
        active: roundPass.active,
        checks: {
          exists: roundPassRes.ok,
          currency_aud: roundPass.currency === "aud",
          amount_799: roundPass.unit_amount === 799,
          is_one_time: roundPass.type === "one_time",
          no_recurring: roundPass.recurring === null,
          is_active: roundPass.active === true,
        },
      },
      season: {
        id: season.id,
        exists: seasonRes.ok,
        currency: season.currency,
        unit_amount: season.unit_amount,
        type: season.type,
        recurring: season.recurring ?? null,
        product: season.product,
        checks: {
          currency_aud: season.currency === "aud",
          amount_5900: season.unit_amount === 5900,
          is_one_time: season.type === "one_time",
          no_recurring: season.recurring === null,
        },
      },
      weekly: {
        id: weekly.id,
        exists: weeklyRes.ok,
        currency: weekly.currency,
        unit_amount: weekly.unit_amount,
        type: weekly.type,
        recurring: weekly.recurring ?? null,
        product: weekly.product,
        checks: {
          currency_aud: weekly.currency === "aud",
          amount_599: weekly.unit_amount === 599,
          is_recurring: weekly.type === "recurring",
          interval_week: weekly.recurring?.interval === "week",
        },
      },
      stripe_key_mode: stripeKey.startsWith("sk_live_") ? "live" : stripeKey.startsWith("sk_test_") ? "test" : "unknown",
      all_checks_passed:
        roundPassRes.ok && seasonRes.ok && weeklyRes.ok &&
        roundPass.unit_amount === 799 && roundPass.type === "one_time" && roundPass.currency === "aud" &&
        season.currency === "aud" && season.unit_amount === 5900 && season.type === "one_time" &&
        weekly.currency === "aud" && weekly.unit_amount === 599 && weekly.type === "recurring" && weekly.recurring?.interval === "week",
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-verify-prices] unhandled error:", err);
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
