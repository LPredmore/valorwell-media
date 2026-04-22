// Reads live Stripe subscription state and upserts the local `subscribers` row.
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

    // Find the Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      await supabase.from("subscribers").upsert(
        {
          user_id: user.id,
          email: user.email,
          stripe_customer_id: null,
          subscribed: false,
          subscription_tier: null,
          subscription_end: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      return new Response(
        JSON.stringify({ subscribed: false, subscription_tier: null, subscription_end: null }),
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
      JSON.stringify({ subscribed, subscription_tier: tier, subscription_end: endIso }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
