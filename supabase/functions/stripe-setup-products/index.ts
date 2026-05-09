import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// This was a one-time bootstrap function used during initial project setup to
// create the Neeko+ Stripe product and price objects (season pass + weekly).
// That operation has been completed. The function is permanently disabled to
// prevent unauthenticated Stripe product/price creation from the internet.

Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({ error: "Function disabled in production" }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    }
  );
});
