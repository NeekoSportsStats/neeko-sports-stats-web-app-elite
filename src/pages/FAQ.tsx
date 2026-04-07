import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft } from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";

const FAQ_SCHEMA_ITEMS = [
  { q: "What is Neeko Sports Stats?", a: "Neeko Sports Stats is an AFL Fantasy analytics platform. It provides weekly player rankings, captain signals, breakout alerts, trap warnings and projection modelling — designed to support selection decisions before each round's lockout." },
  { q: "How are projections calculated?", a: "Projections are built from a multi-factor model that combines historical fantasy scores, recent form velocity, opponent defensive ratings by position, and venue context. No single variable determines the output — the model weights each factor and produces a projected score range." },
  { q: "How often are rankings updated?", a: "Rankings are updated weekly, after each round's data is processed. They reflect the most recent completed round and the upcoming fixture." },
  { q: "Do projections update weekly?", a: "Yes. Projections are regenerated each round using the latest match data. Stale projections from prior rounds are not carried forward." },
  { q: "Does the platform cover sports other than AFL?", a: "No. The platform is scoped entirely to AFL Fantasy." },
  { q: "Why are some players blurred or restricted?", a: "Free users have access to a limited player set. Restricted content requires a Neeko+ subscription." },
  { q: "Does Neeko Sports Stats provide gambling or betting advice?", a: "No. The platform provides AFL Fantasy analytics only. Nothing on the platform constitutes betting or financial advice." },
  { q: "Are projections guaranteed?", a: "No. Projections are model outputs based on historical and current data. They represent likely ranges, not certainties. AFL is inherently variable." },
  { q: "Why don't all players have AI analysis?", a: "AI analysis requires a minimum data threshold. Players with limited game history may not have enough data for the model to generate a reliable output." },
  { q: "What does Neeko+ include?", a: "Neeko+ unlocks the full player pool across all rankings, captain recommendations, breakout and trap boards, AI-generated player analysis, and detailed projection data. Free access covers a limited subset of players." },
  { q: "How much does Neeko+ cost?", a: `Neeko+ is available in two subscription options: Monthly at $${NEEKO_PRICING.monthly.price} AUD per month, or Yearly at $${NEEKO_PRICING.yearly.price} AUD per year (save ${NEEKO_PRICING.savingsPercent}% compared to monthly). Your subscription includes full access to all premium features. Subscriptions renew automatically and can be cancelled anytime.` },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings at any time. Access continues until the end of the current billing period." },
  { q: "Can I use Neeko+ across multiple devices?", a: "Yes. Your subscription is tied to your account. Log in from any device to access it." },
  { q: "Are refunds available?", a: "Refund requests are reviewed on a case-by-case basis. Refer to the Refund Policy for full details." },
  { q: "Do I need an account to use the platform?", a: "Some free content is accessible without an account. An account is required to access Neeko+ and to save preferences." },
  { q: "What payment methods are accepted?", a: "Payments are processed via Stripe. Major debit and credit cards are supported." },
  { q: "Is my payment information secure?", a: "Yes. Neeko does not store card details. All payment data is handled by Stripe using industry-standard encryption." },
  { q: "What personal data is stored?", a: "Only essential account information is stored. See the Privacy Policy for full details on data handling." },
  { q: "What should I do if I find a bug?", a: "Report it via the Contact page. Include a description of what happened and the device or browser you were using." },
];

const PRICING_ANSWER = (
  <div className="space-y-4">
    <p>Neeko+ is available in two subscription options:</p>
    <div className="space-y-2">
      <div>
        <p className="font-semibold text-white/70">Monthly</p>
        <p>${NEEKO_PRICING.monthly.price} AUD per month</p>
      </div>
      <div>
        <p className="font-semibold text-white/70">Yearly</p>
        <p>${NEEKO_PRICING.yearly.price} AUD per year <span className="text-[#F5C84C]">(Save {NEEKO_PRICING.savingsPercent}% compared to monthly)</span></p>
      </div>
    </div>
    <div>
      <p className="mb-2">Your subscription includes full access to:</p>
      <ul className="space-y-1 list-none">
        {[
          "Complete rankings table",
          "AI player breakdowns",
          "Captain Edge board",
          "Breakout alerts",
          "Trap warnings",
          "Player vs Player comparison",
          "Advanced projections and value metrics",
        ].map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="text-[#F5C84C]">•</span> {item}
          </li>
        ))}
      </ul>
    </div>
    <p>Subscriptions renew automatically and can be cancelled anytime.</p>
  </div>
);

const FAQ_GROUPS = [
  {
    group: "The Platform",
    items: [
      {
        q: "What is Neeko Sports Stats?",
        a: "Neeko Sports Stats is an AFL Fantasy analytics platform. It provides weekly player rankings, captain signals, breakout alerts, trap warnings and projection modelling — designed to support selection decisions before each round's lockout.",
      },
      {
        q: "How are projections calculated?",
        a: "Projections are built from a multi-factor model that combines historical fantasy scores, recent form velocity, opponent defensive ratings by position, and venue context. No single variable determines the output — the model weights each factor and produces a projected score range.",
      },
      {
        q: "How often are rankings updated?",
        a: "Rankings are updated weekly, after each round's data is processed. They reflect the most recent completed round and the upcoming fixture.",
      },
      {
        q: "Do projections update weekly?",
        a: "Yes. Projections are regenerated each round using the latest match data. Stale projections from prior rounds are not carried forward.",
      },
      {
        q: "Does the platform cover sports other than AFL?",
        a: "No. The platform is scoped entirely to AFL Fantasy.",
      },
      {
        q: "Why are some players blurred or restricted?",
        a: "Free users have access to a limited player set. Restricted content requires a Neeko+ subscription.",
      },
      {
        q: "Does Neeko Sports Stats provide gambling or betting advice?",
        a: "No. The platform provides AFL Fantasy analytics only. Nothing on the platform constitutes betting or financial advice.",
      },
      {
        q: "Are projections guaranteed?",
        a: "No. Projections are model outputs based on historical and current data. They represent likely ranges, not certainties. AFL is inherently variable.",
      },
      {
        q: "Why don't all players have AI analysis?",
        a: "AI analysis requires a minimum data threshold. Players with limited game history may not have enough data for the model to generate a reliable output.",
      },
    ],
  },
  {
    group: "Neeko+",
    items: [
      {
        q: "What does Neeko+ include?",
        a: "Neeko+ unlocks the full player pool across all rankings, captain recommendations, breakout and trap boards, AI-generated player analysis, and detailed projection data. Free access covers a limited subset of players.",
      },
      {
        q: "How much does Neeko+ cost?",
        a: PRICING_ANSWER,
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel from your account settings at any time. Access continues until the end of the current billing period.",
      },
      {
        q: "Can I use Neeko+ across multiple devices?",
        a: "Yes. Your subscription is tied to your account. Log in from any device to access it.",
      },
      {
        q: "Are refunds available?",
        a: "Refund requests are reviewed on a case-by-case basis. Refer to the Refund Policy for full details.",
      },
    ],
  },
  {
    group: "Account & Privacy",
    items: [
      {
        q: "Do I need an account to use the platform?",
        a: "Some free content is accessible without an account. An account is required to access Neeko+ and to save preferences.",
      },
      {
        q: "What payment methods are accepted?",
        a: "Payments are processed via Stripe. Major debit and credit cards are supported.",
      },
      {
        q: "Is my payment information secure?",
        a: "Yes. Neeko does not store card details. All payment data is handled by Stripe using industry-standard encryption.",
      },
      {
        q: "What personal data is stored?",
        a: "Only essential account information is stored. See the Privacy Policy for full details on data handling.",
      },
      {
        q: "What should I do if I find a bug?",
        a: "Report it via the Contact page. Include a description of what happened and the device or browser you were using.",
      },
    ],
  },
];

export default function FAQ() {
  const navigate = useNavigate();

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": FAQ_SCHEMA_ITEMS.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Helmet>
        <title>FAQ — Neeko Sports Stats | AFL Fantasy Analytics</title>
        <meta name="description" content="Frequently asked questions about Neeko Sports Stats — AFL Fantasy analytics, projections, Neeko+ subscription, pricing, accounts and platform features." />
        <link rel="canonical" href="https://neekostats.com.au/faq" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/faq" />
        <meta property="og:title" content="FAQ — Neeko Sports Stats | AFL Fantasy Analytics" />
        <meta property="og:description" content="Frequently asked questions about Neeko Sports Stats — AFL Fantasy analytics, projections, Neeko+ subscription, pricing, accounts and platform features." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FAQ — Neeko Sports Stats | AFL Fantasy Analytics" />
        <meta name="twitter:description" content="Frequently asked questions about Neeko Sports Stats — AFL Fantasy analytics, projections, Neeko+ subscription, pricing, accounts and platform features." />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>
      <div className="max-w-3xl mx-auto px-4 py-16">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/30 hover:text-white/60 text-sm mb-10 transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/25 mb-4">Support</p>
          <h1 className="text-4xl font-extrabold mb-3">Frequently Asked Questions</h1>
          <p className="text-white/40 text-base">
            Questions about the platform, projections, subscriptions and accounts.
          </p>
        </div>

        <div className="space-y-12">
          {FAQ_GROUPS.map(({ group, items }) => (
            <section key={group}>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/25 mb-4">{group}</p>
              <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden">
                <Accordion type="single" collapsible>
                  {items.map(({ q, a }, i) => (
                    <AccordionItem
                      key={i}
                      value={`${group}-${i}`}
                      className="border-white/[0.07] last:border-0"
                    >
                      <AccordionTrigger className="text-left text-sm font-semibold text-white/80 hover:text-white px-6 py-4 hover:no-underline [&[data-state=open]]:text-white transition-colors">
                        {q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-white/40 leading-relaxed px-6 pb-5">
                        {a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white mb-1">Still have a question?</p>
            <p className="text-sm text-white/35">Use the contact page to get in touch.</p>
          </div>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 border border-white/15 text-white/60 hover:text-white hover:border-white/30 font-semibold text-sm px-5 py-2.5 rounded-xl transition-all whitespace-nowrap"
          >
            Contact us
          </Link>
        </div>

      </div>
    </div>
  );
}
