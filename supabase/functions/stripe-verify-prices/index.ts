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

    const [seasonRes, weeklyRes] = await Promise.all([
      fetch(`https://api.stripe.com/v1/prices/${SEASON_ID}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      }),
      fetch(`https://api.stripe.com/v1/prices/${WEEKLY_ID}`, {
        headers: { "Authorization": `Bearer ${stripeKey}` },
      }),
    ]);

    const [season, weekly] = await Promise.all([seasonRes.json(), weeklyRes.json()]);

    const results = {
      season: {
        id: season.id,
        exists: seasonRes.ok,
        currency: season.currency,
        unit_amount: season.unit_amount,
        type: season.type,
        recurring: season.recurring ?? null,
        product: season.product,
        nickname: season.nickname,
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
        nickname: weekly.nickname,
        checks: {
          currency_aud: weekly.currency === "aud",
          amount_599: weekly.unit_amount === 599,
          is_recurring: weekly.type === "recurring",
          interval_week: weekly.recurring?.interval === "week",
        },
      },
      same_product: season.product === weekly.product,
      all_checks_passed:
        seasonRes.ok && weeklyRes.ok &&
        season.currency === "aud" && season.unit_amount === 5900 && season.type === "one_time" &&
        weekly.currency === "aud" && weekly.unit_amount === 599 && weekly.type === "recurring" && weekly.recurring?.interval === "week",
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
