export const lastUpdated = "2 September 2026";

export const title = "Privacy Policy | Neeko Stats";

export const description =
  "Privacy policy for Neeko Stats. Learn what data we collect, how it is used, and how to exercise your privacy rights.";

export interface PolicySection {
  num?: number;
  heading: string;
  paragraphs?: string[];
  bullets?: { label?: string; text: string }[];
  closingParagraphs?: string[];
  cards?: { title: string; body: string }[];
  boldFirstParagraph?: boolean;
}

export const sections: PolicySection[] = [
  {
    num: 1,
    heading: "What Information We Collect",
    paragraphs: [
      "Neeko Stats collects the following types of information when you use the app:",
    ],
    bullets: [
      { label: "Account identifier", text: "An app user identifier (User ID) is created automatically when you use the app. It is used solely for app functionality, such as managing your Neeko Pro entitlement across devices. No account, email address or password is required." },
      { label: "Subscription and purchase history", text: "We process your Neeko Pro subscription status and purchase history to determine which app features you can access. This information is linked to your user account for app functionality and support purposes." },
      { label: "Install and launch events", text: "We record that the app was installed and opened, so we can measure whether our own advertising (for example on TikTok) is working. See section 6." },
      { label: "Advertising identifier (Android only)", text: "The Android version of the app includes a software component that may access the Google Advertising ID for the purpose in section 6. You can reset or delete this identifier in your Android settings. On iOS we do not request permission to track you and do not access the advertising identifier." },
      { label: "Contact form submissions", text: "If you contact us via the contact form, we collect your name, email address and message content. This information is used only to respond to your enquiry." },
      { label: "Usage data", text: "We may collect aggregate usage patterns (such as features used or screens visited) to understand how the app is being used and to improve it over time. This data is processed in aggregate or anonymised form." },
    ],
    closingParagraphs: [
      "We do not collect your full name, date of birth, precise location, health data, or financial information.",
    ],
  },
  {
    num: 2,
    heading: "How We Use Your Information",
    paragraphs: [
      "We use collected information to:",
    ],
    bullets: [
      { text: "Provide and maintain the Neeko Stats app and its features" },
      { text: "Manage your Neeko Pro subscription status and entitlement access" },
      { text: "Respond to support enquiries submitted through the contact form" },
      { text: "Analyse aggregate usage patterns to improve app performance and features" },
      { text: "Detect and prevent misuse or security threats" },
      { text: "Comply with legal obligations" },
    ],
    closingParagraphs: [
      "We do not show advertisements in the app, and we do not share your information with third parties for their own marketing. We do measure the performance of our own advertising, as described in section 6.",
      "Neeko Stats does not provide betting tips, bookmaker links, gambling advice, or financial advice. The app provides AFL, NBA and English Premier League statistics and form data for research and entertainment purposes only.",
    ],
  },
  {
    num: 3,
    heading: "Subscription and Payment Data",
    paragraphs: [
      "Neeko Pro is purchased through the Apple App Store on iOS and through Google Play on Android, using each platform's in-app purchase system. Apple and Google handle all payment processing, billing and receipts. Neeko Stats does not receive, handle or store your credit card number, CVV, or other payment credentials.",
      "We may receive confirmation of your subscription status and purchase history from Apple, Google and RevenueCat (our subscription management provider) to determine your access within the app.",
      "For information about how these platforms handle payment data, see apple.com/legal/privacy and policies.google.com/privacy.",
    ],
  },
  {
    num: 4,
    heading: "Platform Privacy Disclosures",
    paragraphs: [
      "Neeko Stats discloses the following to each app store.",
    ],
    cards: [
      { title: "User ID", body: "Used for app functionality. Linked to your identity. Not used for tracking." },
      { title: "Purchase History", body: "Used for app functionality (subscription access). Linked to your identity. Not used for tracking." },
    ],
    closingParagraphs: [
      "Apple App Store (privacy labels): User ID and Purchase History — used for app functionality, linked to your identity, not used for tracking.",
      "Google Play (Data safety): User IDs and Purchase history — app functionality. Device or other IDs — advertising or marketing (install attribution only; see section 6). Data is encrypted in transit. You can request deletion of your data (section 9).",
      "We do not sell your data and do not share it with data brokers.",
    ],
  },
  {
    num: 5,
    heading: "Third-Party Services",
    paragraphs: [
      "We use the following third-party services to operate Neeko Stats:",
    ],
    bullets: [
      { label: "Apple App Store", text: "In-app purchases, subscription management and payment processing on iOS." },
      { label: "Google Play", text: "In-app purchases, subscription management and payment processing on Android." },
      { label: "RevenueCat", text: "Manages subscription status, entitlement access and purchase history synchronisation within the app." },
      { label: "Supabase", text: "Provides database, authentication, and backend infrastructure. App functionality data is stored in Supabase-hosted environments." },
      { label: "TikTok Business SDK", text: "Install and launch measurement for our advertising, as described in section 6. It does not show advertisements inside the app." },
      { label: "Analytics tools", text: "We may use analytics services to measure app usage. Where used, data is processed in aggregate or anonymised form." },
    ],
    closingParagraphs: [
      "These providers are used only as necessary to operate the app and are not authorised to use your data for other purposes.",
    ],
  },
  {
    num: 6,
    heading: "Advertising Measurement",
    paragraphs: [
      "Neeko Stats shows no advertisements. We do not partner with any bookmaker or gambling operator, and we never sell your data to data brokers.",
      "We do advertise the app itself on platforms such as TikTok. To know whether that advertising works, the app includes the TikTok Business SDK, which records that the app was installed and opened. On Android, this component may use the Google Advertising ID to attribute an install to an advertisement; you can reset or delete this identifier at any time in Android Settings \u2192 Google \u2192 Ads. On iOS, the app does not request App Tracking Transparency permission, so the advertising identifier is not available to it, and attribution relies on Apple's privacy-preserving framework.",
      "We do not use this information to build a profile of you, to target you with advertising inside the app, or to track you across other companies' apps and websites.",
    ],
  },
  {
    num: 7,
    heading: "Data Storage and Protection",
    paragraphs: [
      "Reasonable technical and organisational safeguards are used to protect your data against unauthorised access, disclosure, or loss. Authentication and account access are handled through trusted infrastructure providers.",
      "No online service can guarantee absolute security. You should protect your own Apple ID or Google Account credentials and report any suspected unauthorised access to the relevant platform.",
    ],
  },
  {
    num: 8,
    heading: "Data Sharing and Disclosure",
    paragraphs: [
      "We do not sell, rent, or trade your personal information to third parties.",
      "We may share information only in the following circumstances:",
    ],
    bullets: [
      { text: "With your explicit consent" },
      { text: "To comply with legal obligations, court orders, or government requests" },
      { text: "To protect the rights, property, or safety of Neeko Stats or its users" },
      { text: "With service providers who operate the app, under confidentiality obligations" },
      { text: "In connection with a business transfer or acquisition, with prior notice to affected users" },
    ],
    boldFirstParagraph: true,
  },
  {
    num: 9,
    heading: "Your Privacy Rights",
    paragraphs: [
      "You have the right to:",
    ],
    bullets: [
      { label: "Access", text: "Request a copy of the personal data we hold about you." },
      { label: "Correction", text: "Request correction of inaccurate information by contacting us." },
      { label: "Deletion", text: "Request deletion of your data by following the steps at neekostats.com.au/delete-data. Purchase records that we are legally required to retain are explained on that page." },
      { label: "Subscription management", text: "Manage or cancel Neeko Pro through your Apple ID subscription settings on iOS, or Google Play \u2192 Payments & subscriptions on Android. Cancelling a subscription does not delete your data; use the deletion process above for that." },
    ],
    closingParagraphs: [
      "To exercise any of these rights, contact us at matthew@neekostats.com.au.",
    ],
  },
  {
    num: 10,
    heading: "Data Retention",
    bullets: [
      { text: "Account and subscription data is retained while your account is active" },
      { text: "Purchase and billing records may be retained for up to 7 years for legal and accounting purposes" },
      { text: "Usage and analytics data may be anonymised and retained for app improvement" },
      { text: "Contact form submissions are retained only as long as needed to resolve your enquiry" },
      { text: "Advertising measurement data is held by the measurement provider under its own policy; we keep only aggregate campaign statistics" },
    ],
  },
  {
    num: 11,
    heading: "Children's Privacy",
    paragraphs: [
      "Neeko Stats is not directed at users under the age of 13. We do not knowingly collect personal information from children. If we become aware that a child has provided personal data, we will take steps to delete it.",
    ],
  },
  {
    num: 12,
    heading: "Changes to This Policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the app after changes constitutes acceptance of the updated policy.",
    ],
  },
  {
    num: 13,
    heading: "Contact",
    paragraphs: [
      "For privacy questions or data requests, contact us at: matthew@neekostats.com.au",
      "Melbourne, Victoria, Australia",
    ],
  },
];
