export const NEEKO_PRICING = {
  round_pass_7d: {
    price: 7.99,
    cents: 799,
    stripePlan: "round_pass_7d" as const,
    label: "Neeko+ 7-Day Round Pass",
    billingNote: "One-time payment. 7 days of premium access.",
    accessDays: 7,
  },
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
