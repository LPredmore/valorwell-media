import { loadStripe, type Stripe } from "@stripe/stripe-js";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
    stripePromise = loadStripe(clientToken);
  }
  return stripePromise;
}

/**
 * Returns the Stripe environment derived from the client token prefix.
 * Throws if no token is configured — callers must handle this (e.g. skip
 * Stripe sync entirely) instead of silently defaulting to "live", which
 * would cause the wrong-environment lookups to wipe valid subscriber rows.
 */
export function getStripeEnvironment(): "sandbox" | "live" {
  if (!clientToken) {
    throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set");
  }
  return clientToken.startsWith("pk_test_") ? "sandbox" : "live";
}

/** Safe variant: returns null when no payments token is configured. */
export function tryGetStripeEnvironment(): "sandbox" | "live" | null {
  if (!clientToken) return null;
  return clientToken.startsWith("pk_test_") ? "sandbox" : "live";
}

export function isPaymentsConfigured(): boolean {
  return !!clientToken;
}
