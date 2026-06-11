import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// This function was used once to create the Stripe price for the 7-Day Round Pass.
// It is now DISABLED. The price has been created: price_1Th2xaEKV8332a9YdWDMnksH
// The DB row in stripe_products_config has been updated.
// Do not re-enable this function without adding strict admin authentication.

Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({ error: "This endpoint has been disabled. The Stripe price has already been created." }),
    { status: 410, headers: { "Content-Type": "application/json" } }
  );
});
