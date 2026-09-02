export const lastUpdated = "2 September 2026";

export const title = "Delete your data — Neeko Stats";

export const description =
  "How to request deletion of the data Neeko Stats holds about you.";

export interface DeleteDataSection {
  num?: number;
  heading?: string;
  paragraphs?: string[];
  bullets?: { label?: string; text: string }[];
}

export const sections: DeleteDataSection[] = [
  {
    paragraphs: [
      "Neeko Stats (developer: Matthew Nixon) does not require an account, so most users have no personal data held on our servers. Uninstalling the app removes all data stored on your device.",
      "If you have subscribed to Neeko Pro, or contacted us through our website, follow these steps to request deletion:",
    ],
  },
  {
    bullets: [
      { text: "Email matthew@neekostats.com.au with the subject \"Delete my data\"." },
      { text: "Tell us which platform you use (iOS or Android) and the approximate date of your first purchase." },
      { text: "If you have an Apple or Google order number for a Neeko Pro purchase, include it — it lets us find your record quickly." },
    ],
  },
  {
    paragraphs: [
      "What we delete: your app user identifier and subscription entitlement record held by our subscription provider, and any contact form messages you have sent us. Deletion is completed within 30 days of your request, and we will confirm by email.",
      "What we keep: records of purchases and payments may be retained for up to 7 years where Australian tax and accounting law requires it. Apple and Google keep their own transaction records under their own policies, which we do not control.",
      "Cancelling a subscription is separate from deleting data. To stop being charged, cancel through your Apple ID subscription settings (iOS) or Google Play \u2192 payments & subscriptions (Android).",
    ],
  },
];
