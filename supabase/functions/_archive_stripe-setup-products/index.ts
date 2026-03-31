import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      appInfo: { name: "Neeko Sports Stats", version: "1.0.0" },
    });

    const monthlyProduct = await stripe.products.create({
      name: "Neeko+ Monthly",
      description: "Full access to Neeko Sports Stats premium AFL fantasy analytics including: Complete Rankings access, AI player insights, Captain Edge board, Breakout watch alerts, Trap pick warnings, Player vs Player comparison, and Advanced projections and value metrics.",
      metadata: { plan: "monthly" },
    });

    const monthlyPrice = await stripe.prices.create({
      product: monthlyProduct.id,
      unit_amount: 999,
      currency: "aud",
      recurring: {
        interval: "month",
      },
      nickname: "Neeko+ Monthly AUD",
      metadata: { plan: "monthly" },
    });

    const yearlyProduct = await stripe.products.create({
      name: "Neeko+ Yearly",
      description: "Full access to Neeko Sports Stats premium AFL fantasy analytics. Save 26% with annual billing.",
      metadata: { plan: "yearly" },
    });

    const yearlyPrice = await stripe.prices.create({
      product: yearlyProduct.id,
      unit_amount: 8900,
      currency: "aud",
      recurring: {
        interval: "year",
      },
      nickname: "Neeko+ Yearly AUD",
      metadata: { plan: "yearly" },
    });

    await stripe.products.update(monthlyProduct.id, {
      default_price: monthlyPrice.id,
    });

    await stripe.products.update(yearlyProduct.id, {
      default_price: yearlyPrice.id,
    });

    return new Response(
      JSON.stringify({
        monthly: {
          product_id: monthlyProduct.id,
          price_id: monthlyPrice.id,
          amount: 999,
          currency: "aud",
          interval: "month",
        },
        yearly: {
          product_id: yearlyProduct.id,
          price_id: yearlyPrice.id,
          amount: 8900,
          currency: "aud",
          interval: "year",
        },
        webhook_events_needed: [
          "checkout.session.completed",
          "customer.subscription.created",
          "customer.subscription.updated",
          "customer.subscription.deleted",
          "invoice.payment_succeeded",
          "invoice.payment_failed",
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
