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

    const stripeBase = "https://api.stripe.com/v1";
    const headers = {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const encode = (params: Record<string, string>) =>
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    // Step 1: Create product
    const productRes = await fetch(`${stripeBase}/products`, {
      method: "POST",
      headers,
      body: encode({
        name: "Neeko+",
        description: "Full AFL Fantasy decision engine — projections, trades, captains, and weekly edge.",
      }),
    });
    const product = await productRes.json();
    if (!productRes.ok) {
      console.error("[stripe-setup-products] product creation failed", product);
      return new Response(JSON.stringify({ error: "Product setup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Create season price (one-time, AUD 59.00)
    const seasonPriceRes = await fetch(`${stripeBase}/prices`, {
      method: "POST",
      headers,
      body: encode({
        product: product.id,
        unit_amount: "5900",
        currency: "aud",
        nickname: "Neeko+ Season Pass",
      }),
    });
    const seasonPrice = await seasonPriceRes.json();
    if (!seasonPriceRes.ok) {
      console.error("[stripe-setup-products] season price creation failed", seasonPrice);
      return new Response(JSON.stringify({ error: "Product setup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Create weekly price (recurring, AUD 5.99/week)
    const weeklyPriceRes = await fetch(`${stripeBase}/prices`, {
      method: "POST",
      headers,
      body: encode({
        product: product.id,
        unit_amount: "599",
        currency: "aud",
        nickname: "Neeko+ Weekly",
        "recurring[interval]": "week",
      }),
    });
    const weeklyPrice = await weeklyPriceRes.json();
    if (!weeklyPriceRes.ok) {
      console.error("[stripe-setup-products] weekly price creation failed", weeklyPrice);
      return new Response(JSON.stringify({ error: "Product setup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        product_id: product.id,
        product_name: product.name,
        season_price_id: seasonPrice.id,
        season_price_amount: seasonPrice.unit_amount,
        season_price_currency: seasonPrice.currency,
        season_price_type: seasonPrice.type,
        weekly_price_id: weeklyPrice.id,
        weekly_price_amount: weeklyPrice.unit_amount,
        weekly_price_currency: weeklyPrice.currency,
        weekly_price_recurring: weeklyPrice.recurring,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stripe-setup-products] unhandled error:", err);
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
