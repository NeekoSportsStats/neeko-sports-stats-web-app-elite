import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// This was a one-time bootstrap function used during initial project setup to
// write STRIPE_PRICE_SEASON and STRIPE_PRICE_WEEKLY into Supabase edge function
// secrets. That operation has been completed. The function is permanently
// disabled to prevent unauthenticated secret-write exposure.

Deno.serve(async (_req: Request) => {
  return new Response(
    JSON.stringify({ error: "Function disabled in production" }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    }
  );
});
