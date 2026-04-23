// Reads live Stripe subscription state and upserts the local `subscribers` row.
//
// IMPORTANT: This function is non-destructive when no Stripe customer is found.
// It can be called from either Stripe environment (sandbox or live), and a
// "customer not found" result in one environment must NOT wipe a valid
// subscription created in the other. Only a real cancellation (customer
// exists but no active sub) downgrades the row.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader);
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { environment } = await req.json().catch(() => ({}));
    const env = (environment || "sandbox") as StripeEnv;
    const stripe = createStripeClient(env);

    // Read existing DB row up-front. We use this as a fallback whenever
    // Stripe has no record of this customer in the requested environment.
    const { data: existing } = await supabase
      .from("subscribers")
      .select("subscribed, subscription_tier, subscription_end, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Complimentary accounts: skip Stripe entirely. These are manually granted
    // permanent free access and must never be downgraded by Stripe lookups.
    if (existing?.subscription_tier === "comp") {
      return new Response(
        JSON.stringify({
          subscribed: true,
          subscription_tier: "comp",
          subscription_end: null,
          source: "comp",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      // No customer in THIS Stripe environment. The user may have a valid
      // subscription in the other environment — do NOT overwrite the row.
      return new Response(
        JSON.stringify({
          subscribed: existing?.subscribed ?? false,
          subscription_tier: (existing?.subscription_tier as "monthly" | "annual" | null) ?? null,
          subscription_end: existing?.subscription_end ?? null,
          source: "db_unchanged_no_customer_in_env",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customerId = customers.data[0].id;
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    let subscribed = false;
    let tier: "monthly" | "annual" | null = null;
    let endIso: string | null = null;

    if (subs.data.length > 0) {
      const sub = subs.data[0];
      subscribed = true;
      const periodEnd =
        (sub as any).current_period_end ??
        sub.items?.data?.[0]?.current_period_end;
      if (typeof periodEnd === "number" && Number.isFinite(periodEnd)) {
        const d = new Date(periodEnd * 1000);
        if (!Number.isNaN(d.getTime())) endIso = d.toISOString();
      }
      const interval = sub.items.data[0]?.price?.recurring?.interval;
      tier = interval === "year" ? "annual" : "monthly";
    }

    // Customer exists in this environment — safe to upsert authoritative state.
    // (If subscribed=false here it means they cancelled in this env, which is
    // a real downgrade signal we want to record.)
    await supabase.from("subscribers").upsert(
      {
        user_id: user.id,
        email: user.email,
        stripe_customer_id: customerId,
        subscribed,
        subscription_tier: tier,
        subscription_end: endIso,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    return new Response(
      JSON.stringify({
        subscribed,
        subscription_tier: tier,
        subscription_end: endIso,
        source: "stripe",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
