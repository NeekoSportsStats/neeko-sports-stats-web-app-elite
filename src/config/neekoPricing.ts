export const NEEKO_PRICING = {
  weekly: {
    price: 5.99,
    cents: 599,
    stripePlan: "weekly" as const,
    label: "Neeko+ Weekly",
    billingNote: "Billed weekly. Cancel anytime.",
  },
  season: {
    price: 59,
    cents: 5900,
    stripePlan: "season" as const,
    label: "Neeko+ Season",
    billingNote: "One-time payment. Full season access.",
    totalRounds: 23,
  },
} as const;

export type NeekoPlan = keyof typeof NEEKO_PRICING;
