import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  TableProperties,
  Star,
  Crown,
  User,
  Search,
  ArrowRight,
} from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQ_GROUPS = [
  {
    group: "The Platform",
    items: [
      {
        q: "What is Neeko Sports Stats?",
        a: "Neeko Sports Stats is an AFL stats and fantasy intelligence platform that tracks player performance, projections, prices, form, matchup context and weekly decision signals. It includes a Stat Board for AFL stat research, a Fantasy Hub for AFL Fantasy decision support, and individual player and team pages — all updated weekly during the AFL season.",
      },
      {
        q: "Does Neeko Sports Stats cover sports other than AFL?",
        a: "No. The platform is focused entirely on AFL. All data, projections, rankings and signals are AFL-specific.",
      },
      {
        q: "Is Neeko Sports Stats a betting or gambling service?",
        a: "No. Neeko Sports Stats is an AFL stats and fantasy intelligence platform. Nothing on the platform constitutes betting advice, gambling tips or financial advice. The platform is designed to support AFL Fantasy decisions, not wagering.",
      },
      {
        q: "Are projections guaranteed?",
        a: "No. Projections are modelled estimates based on historical performance, form, matchup context and other factors. They represent likely scoring ranges, not certainties. AFL player performance is inherently variable and projections will not always be correct.",
      },
    ],
  },
  {
    group: "Stat Board",
    items: [
      {
        q: "What is the Stat Board?",
        a: "The Stat Board is a player stat research tool. It shows AFL player performance across recent rounds, including key stats, hit rates, form trends and upcoming match context. Users can browse by player, team or match to research which players are most likely to hit key stats.",
      },
      {
        q: "How are hit rates calculated?",
        a: "Hit rates reflect how often a player has reached a specific stat threshold (for example, 25+ disposals or 80+ fantasy points) across their recent games. They are calculated from verified AFL match data and are updated each round.",
      },
      {
        q: "Why do some matches or stats show limited data?",
        a: "Limited data can occur early in the season when players have fewer games played, when a player has returned from injury, or when a player has recently changed teams or roles. The platform displays available data and notes where sample sizes are small.",
      },
      {
        q: "How often is Stat Board data updated?",
        a: "Stat Board data is updated weekly after each completed AFL round. Match results, player stats and hit rates reflect the most recently completed games.",
      },
    ],
  },
  {
    group: "Fantasy Hub",
    items: [
      {
        q: "What is the Fantasy Hub?",
        a: "The Fantasy Hub is a decision-support tool for AFL Fantasy managers. It includes weekly player rankings, score projections, captain recommendations, breakeven tracking, value picks, trap alerts and Market Watch signals — all designed to help users make faster, better-informed AFL Fantasy decisions before each lockout.",
      },
      {
        q: "How are projections calculated?",
        a: "Projections are built from a multi-factor model that combines recent form, historical performance, positional role, opponent defensive ratings by position and venue context. The model produces a projected score range — not a single guaranteed number — and is regenerated each round using the latest available data.",
      },
      {
        q: "How often are rankings updated?",
        a: "Rankings are updated weekly after each completed round. They reflect the most recent match data and the upcoming fixture context.",
      },
      {
        q: "Why do some players have blurred or restricted data?",
        a: "Some data is reserved for Neeko+ users. Free users can access a subset of players and rankings. Neeko+ unlocks the full player pool, complete projections, AI analysis and all premium signals.",
      },
      {
        q: "Why do some players not have full AI analysis?",
        a: "AI analysis requires a minimum game history threshold. Players with very limited AFL data — for example, debut-season rookies with fewer than three games — may not yet have enough data for the model to generate a reliable output.",
      },
    ],
  },
  {
    group: "Neeko+",
    items: [
      {
        q: "What does Neeko+ include?",
        a: `Neeko+ unlocks the full premium layer of the platform: complete player rankings across all positions, full AI-generated player analysis, detailed projections and value metrics, captain edge board, breakout candidates, trap alerts, Market Watch signals and premium Stat Board and player/team page data. Free access covers a limited subset of the player pool.`,
      },
      {
        q: "How much does Neeko+ cost?",
        a: null, // rendered as JSX below
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. The weekly plan can be cancelled at any time from your account settings. Access continues until the end of the current paid period. The Season Pass is a one-time payment with no recurring billing.",
      },
      {
        q: "Can I use Neeko+ across multiple devices?",
        a: "Yes. Neeko+ is linked to your account. Sign in from any device — desktop, tablet or mobile — to access your full subscription.",
      },
      {
        q: "Are refunds available?",
        a: "Refund requests are assessed on a case-by-case basis. See the Refund Policy for full details.",
      },
    ],
  },
  {
    group: "Account & Privacy",
    items: [
      {
        q: "Do I need an account to use the platform?",
        a: "Some free content — including a limited set of player rankings and Stat Board data — is accessible without signing in. An account is required to access Neeko+ and to maintain access across sessions.",
      },
      {
        q: "What payment methods are accepted?",
        a: "Payments are processed via Stripe. Major debit and credit cards are accepted. Neeko does not handle or store card details directly.",
      },
      {
        q: "Is my payment information secure?",
        a: "Yes. All payment data is handled by Stripe using industry-standard encryption. Neeko Sports Stats does not store card numbers or sensitive payment information.",
      },
      {
        q: "What personal data is stored?",
        a: "Only essential account information is stored — primarily your email address and subscription status. See the Privacy Policy for full details on data collection and handling.",
      },
      {
        q: "What should I do if I find a bug?",
        a: "Use the Contact page to report it. Include a description of the issue, the page it occurred on, and the device or browser you were using.",
      },
    ],
  },
];

// Pricing answer as JSX (kept separate to allow rich formatting)
const PRICING_ANSWER_JSX = (
  <div className="space-y-3">
    <p>Neeko+ is available in two options:</p>
    <div className="space-y-3">
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
        <p className="font-semibold text-white/75 mb-0.5">
          Season Pass — ${NEEKO_PRICING.season.price} AUD
        </p>
        <p className="text-white/40 text-xs leading-relaxed">
          {NEEKO_PRICING.season.billingNote}
        </p>
      </div>
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
        <p className="font-semibold text-white/75 mb-0.5">
          Weekly — ${NEEKO_PRICING.weekly.price} AUD/week
        </p>
        <p className="text-white/40 text-xs leading-relaxed">
          {NEEKO_PRICING.weekly.billingNote}
        </p>
      </div>
    </div>
    <p>Both options include full access to all Neeko+ features.</p>
  </div>
);

// ── JSON-LD schema (plain text answers for crawlers) ──────────────────────────

function buildSchemaItems() {
  const pricingText = `Neeko+ is available in two options: Season Pass at $${NEEKO_PRICING.season.price} AUD (${NEEKO_PRICING.season.billingNote}), or Weekly at $${NEEKO_PRICING.weekly.price} AUD per week (${NEEKO_PRICING.weekly.billingNote}). Both options include full access to all Neeko+ features.`;

  return FAQ_GROUPS.flatMap(({ items }) =>
    items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a === null ? pricingText : (typeof a === "string" ? a : ""),
      },
    }))
  );
}

// ── Quick-help cards ──────────────────────────────────────────────────────────

const HELP_CARDS = [
  {
    icon: TableProperties,
    title: "Stat Board",
    desc: "Find AFL players most likely to hit key stats in upcoming matches.",
    href: "/stat-board",
  },
  {
    icon: Star,
    title: "Fantasy Hub",
    desc: "View projections, rankings, captain calls, value picks and trap alerts.",
    href: "/fantasy",
  },
  {
    icon: Crown,
    title: "Neeko+",
    desc: "Unlock full projections, signals, AI analysis and premium player and team data.",
    href: "/neeko-plus",
    gold: true,
  },
  {
    icon: User,
    title: "Account & Billing",
    desc: "Manage sign in, access, payments and support questions.",
    href: "/account",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function FAQ() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: buildSchemaItems(),
  };

  // Filter groups/items by search query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_GROUPS;
    return FAQ_GROUPS.map(({ group, items }) => ({
      group,
      items: items.filter(
        ({ q: question, a }) =>
          question.toLowerCase().includes(q) ||
          (typeof a === "string" && a.toLowerCase().includes(q))
      ),
    })).filter(({ items }) => items.length > 0);
  }, [query]);

  const noResults = query.trim().length > 0 && filtered.length === 0;

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Helmet>
        <title>FAQ | Neeko Sports Stats</title>
        <meta name="description" content="Frequently asked questions about Neeko Sports Stats, AFL player data, Stat Board, Fantasy Hub, projections, Neeko+ access, payments and account support." />
        <link rel="canonical" href="https://neekostats.com.au/faq" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/faq" />
        <meta property="og:title" content="FAQ | Neeko Sports Stats" />
        <meta property="og:description" content="Frequently asked questions about Neeko Sports Stats, AFL player data, Stat Board, Fantasy Hub, projections, Neeko+ access, payments and account support." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FAQ | Neeko Sports Stats" />
        <meta name="twitter:description" content="Frequently asked questions about Neeko Sports Stats, AFL player data, Stat Board, Fantasy Hub, projections, Neeko+ access, payments and account support." />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-14">

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-white/30 hover:text-white/60 text-sm mb-10 transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/25 mb-4">
            Support
          </p>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-white/40 text-sm md:text-base leading-relaxed max-w-xl">
            Answers about Neeko Sports Stats, AFL player data, projections, Stat Board, Fantasy Hub, Neeko+ access and account support.
          </p>
        </div>

        {/* ── Quick-help cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
          {HELP_CARDS.map(({ icon: Icon, title, desc, href, gold }) => (
            <Link
              key={title}
              to={href}
              className="group flex flex-col gap-2 rounded-xl border bg-[#0e0e0e] p-3.5 transition-all hover:border-white/[0.15] no-underline"
              style={{ borderColor: gold ? "rgba(245,200,76,0.20)" : "rgba(255,255,255,0.07)" }}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{
                  background: gold ? "rgba(245,200,76,0.10)" : "rgba(255,255,255,0.05)",
                  border: gold ? "1px solid rgba(245,200,76,0.22)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Icon size={13} style={{ color: gold ? "#F5C84C" : "rgba(255,255,255,0.50)" }} />
              </div>
              <p className="text-xs font-bold" style={{ color: gold ? "#F5C84C" : "rgba(255,255,255,0.75)" }}>
                {title}
              </p>
              <p className="text-[11px] text-white/35 leading-relaxed">{desc}</p>
            </Link>
          ))}
        </div>

        {/* ── Search ────────────────────────────────────────────────────────── */}
        <div className="relative mb-10">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search FAQ..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-[#0e0e0e] border border-white/[0.09] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/[0.20] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 text-xs transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* ── FAQ sections ──────────────────────────────────────────────────── */}
        {noResults ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-10 text-center">
            <p className="text-sm text-white/35 leading-relaxed">
              No matching FAQ found. Try searching for{" "}
              <span className="text-white/50">projections</span>,{" "}
              <span className="text-white/50">Neeko+</span>,{" "}
              <span className="text-white/50">payment</span>,{" "}
              <span className="text-white/50">locked players</span> or{" "}
              <span className="text-white/50">Stat Board</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {filtered.map(({ group, items }) => (
              <section key={group} aria-labelledby={`faq-group-${group}`}>
                <p
                  id={`faq-group-${group}`}
                  className="text-[10px] font-black uppercase tracking-[0.20em] text-white/25 mb-4"
                >
                  {group}
                </p>
                <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden">
                  <Accordion type="single" collapsible>
                    {items.map(({ q, a }, i) => (
                      <AccordionItem
                        key={i}
                        value={`${group}-${i}`}
                        className="border-white/[0.07] last:border-0"
                      >
                        <AccordionTrigger className="text-left text-sm font-semibold text-white/75 hover:text-white px-6 py-4 hover:no-underline [&[data-state=open]]:text-white transition-colors">
                          {q}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-white/40 leading-relaxed px-6 pb-5">
                          {a === null ? PRICING_ANSWER_JSX : a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              </section>
            ))}
          </div>
        )}

        {/* ── Bottom CTA ────────────────────────────────────────────────────── */}
        <div className="mt-14 rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-7">
          <h2 className="text-base font-bold text-white mb-1.5">Still need help?</h2>
          <p className="text-sm text-white/35 mb-6 leading-relaxed">
            Explore the tools, unlock Neeko+ or contact support if something does not look right.
          </p>

          <div className="flex flex-wrap gap-2.5">
            {/* Gold primary */}
            <Link
              to="/neeko-plus"
              className="inline-flex items-center gap-2 font-bold text-[#130c00] text-sm px-4 py-2.5 rounded-xl transition-all hover:brightness-110"
              style={{ background: "linear-gradient(160deg,#fad52a 0%,#e09600 100%)", boxShadow: "0 4px 18px rgba(224,174,45,0.22)" }}
            >
              <Crown size={13} />
              Unlock Neeko+
            </Link>

            {/* Dark secondaries */}
            <Link
              to="/stat-board"
              className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20 text-white/70 hover:text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all"
            >
              <TableProperties size={13} />
              Open Stat Board
            </Link>

            <Link
              to="/fantasy"
              className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20 text-white/70 hover:text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all"
            >
              <Star size={13} />
              View Fantasy Hub
            </Link>

            <Link
              to="/contact"
              className="inline-flex items-center gap-2 text-white/35 hover:text-white/60 font-semibold text-sm px-4 py-2.5 rounded-xl transition-all"
            >
              Contact Support
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
