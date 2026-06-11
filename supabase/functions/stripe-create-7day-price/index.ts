import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Supabase env vars not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeBase = "https://api.stripe.com/v1";
    const stripeHeaders = {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const encode = (params: Record<string, string>) =>
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

    // Step 1: Find existing Neeko+ product (reuse the same product as season/weekly)
    // We look for prices with the season price ID to get its product ID
    const SEASON_PRICE_ID = "price_1TM0kpEKV8332a9YHhTfin2z";
    const seasonPriceRes = await fetch(`${stripeBase}/prices/${SEASON_PRICE_ID}`, {
      headers: { "Authorization": `Bearer ${stripeKey}` },
    });
    const seasonPrice = await seasonPriceRes.json();

    let productId: string;
    if (seasonPriceRes.ok && seasonPrice.product) {
      productId = seasonPrice.product;
      console.log(`[stripe-create-7day-price] reusing product: ${productId}`);
    } else {
      // Fallback: create a product
      const productRes = await fetch(`${stripeBase}/products`, {
        method: "POST",
        headers: stripeHeaders,
        body: encode({
          name: "Neeko+ 7-Day Round Pass",
          description: "7 days of full Neeko+ premium access. One-time payment.",
          "metadata[plan_key]": "round_pass_7d",
          "metadata[product]": "neeko_plus",
        }),
      });
      const product = await productRes.json();
      if (!productRes.ok) {
        return new Response(JSON.stringify({ error: "Product creation failed", detail: product }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      productId = product.id;
      console.log(`[stripe-create-7day-price] created new product: ${productId}`);
    }

    // Step 2: Check if an active 799 AUD one-time price already exists for this product
    const existingPricesRes = await fetch(
      `${stripeBase}/prices?product=${productId}&currency=aud&active=true&limit=20`,
      { headers: { "Authorization": `Bearer ${stripeKey}` } }
    );
    const existingPrices = await existingPricesRes.json();

    let priceId: string | null = null;
    let priceAction = "none";

    if (existingPricesRes.ok && Array.isArray(existingPrices.data)) {
      const match = existingPrices.data.find(
        (p: { type: string; unit_amount: number; recurring: unknown }) =>
          p.type === "one_time" && p.unit_amount === 799 && !p.recurring
      );
      if (match) {
        priceId = match.id;
        priceAction = "reused_existing";
        console.log(`[stripe-create-7day-price] found existing 799 AUD one-time price: ${priceId}`);
      }
    }

    // Step 3: If no matching price, create one
    if (!priceId) {
      const newPriceRes = await fetch(`${stripeBase}/prices`, {
        method: "POST",
        headers: stripeHeaders,
        body: encode({
          product: productId,
          unit_amount: "799",
          currency: "aud",
          nickname: "Neeko+ 7-Day Round Pass",
          "metadata[plan_key]": "round_pass_7d",
          "metadata[product]": "neeko_plus",
          "metadata[access_days]": "7",
        }),
      });
      const newPrice = await newPriceRes.json();
      if (!newPriceRes.ok) {
        return new Response(JSON.stringify({ error: "Price creation failed", detail: newPrice }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      priceId = newPrice.id;
      priceAction = "created_new";
      console.log(`[stripe-create-7day-price] created new price: ${priceId}`);
    }

    // Step 4: Update stripe_products_config in DB
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: dbError } = await supabase
      .from("stripe_products_config")
      .update({ price_id: priceId, product_id: productId })
      .eq("plan_key", "round_pass_7d");

    if (dbError) {
      console.error("[stripe-create-7day-price] DB update failed:", dbError);
      return new Response(
        JSON.stringify({ error: "DB update failed", detail: dbError, price_id: priceId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        price_id: priceId,
        product_id: productId,
        price_action: priceAction,
        note: `Set STRIPE_PRICE_ROUND_PASS_7D=${priceId} in Supabase Edge Function secrets via dashboard`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[stripe-create-7day-price] unhandled error:", err);
    return new Response(JSON.stringify({ error: "Request failed", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
