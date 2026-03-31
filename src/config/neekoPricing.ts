export const NEEKO_PRICING = {
  monthly: {
    price: 9.99,
    cents: 999,
    stripePlan: "monthly" as const,
    label: "Neeko+ Monthly",
    billingNote: "Billed monthly. Cancel anytime.",
  },
  yearly: {
    price: 89,
    cents: 8900,
    stripePlan: "yearly" as const,
    label: "Neeko+ Yearly",
    billingNote: "Billed once per year.",
    monthlyEquivalent: 7.42,
  },
  savingsPercent: 26,
} as const;
