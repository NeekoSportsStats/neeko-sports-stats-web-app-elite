import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  TableProperties,
  Star,
  Crown,
  Search,
  ArrowRight,
} from "lucide-react";
import { NEEKO_PRICING } from "@/config/neekoPricing";

// ── FAQ data ──────────────────────────────────────────────────────────────────

const PRICING_TEXT = `Neeko+ is available in two options: Season Pass at $${NEEKO_PRICING.season.price} AUD (${NEEKO_PRICING.season.billingNote}), or Weekly at $${NEEKO_PRICING.weekly.price} AUD per week (${NEEKO_PRICING.weekly.billingNote}). Both options include full access to all Neeko+ features.`;

const FAQ_GROUPS: { id: string; group: string; label: string; items: { q: string; a: string | null }[] }[] = [
  {
    id: "platform",
    group: "Platform",
    label: "Platform",
    items: [
      {
        q: "What is Neeko Sports Stats?",
        a: "Neeko Sports Stats is an AFL stats and fantasy intelligence platform that tracks player performance, projections, prices, form, matchup context and weekly decision signals. It includes a Stat Board for AFL stat research, a Fantasy Hub for AFL Fantasy decision support, and individual player and team pages — all updated weekly during the AFL season.",
      },
      {
        q: "What is the difference between Stat Board and Fantasy Hub?",
        a: "The Stat Board is a stat research tool — it shows player and team performance across recent rounds, match centre data, hit rates and form trends. The Fantasy Hub is a decision-support tool for AFL Fantasy managers — it includes weekly player rankings, score projections, captain recommendations, breakeven tracking, value picks and trap alerts. Both tools are available on the platform and complement each other.",
      },
      {
        q: "What do the Players and Teams pages show?",
        a: "The Players directory lets you browse individual player profiles, including recent performance, form trends, projection context and team information. The Teams directory shows squad breakdowns, team performance patterns and per-team player lists. Both are useful for research before and during the AFL season.",
      },
      {
        q: "Does Neeko Sports Stats provide betting or gambling advice?",
        a: "No. Neeko Sports Stats is an AFL stats and fantasy intelligence platform. Nothing on the platform constitutes betting advice, gambling tips or financial advice. The platform is designed to support AFL Fantasy decisions, not wagering.",
      },
    ],
  },
  {
    id: "free-vs-neeko-plus",
    group: "Free vs Neeko+",
    label: "Free vs Neeko+",
    items: [
      {
        q: "What can I use for free?",
        a: "Free users can access a limited set of player rankings, a preview of Stat Board data, and basic player and team pages. The free tier gives a genuine look at the platform but restricts depth — you can see how the tools work without unlocking the full player pool, complete projections or premium signals.",
      },
      {
        q: "What does Neeko+ unlock?",
        a: "Neeko+ unlocks the full premium layer of the platform: all 600+ player rankings across every position, full score projections and breakeven calculations, complete Stat Board rows, Market Watch signals, captain edge ratings, value picks, trap alerts, player and team intelligence pages and summaries. Free access covers a limited subset of the player pool and hides premium signals.",
      },
      {
        q: "Why are some players, stats or signals blurred?",
        a: "Some data is reserved for Neeko+ subscribers. The free tier shows a representative sample so you can evaluate the platform before committing. Neeko+ removes these restrictions and gives access to the full player pool and all signal layers.",
      },
      {
        q: "Can free users still browse player and team pages?",
        a: "Yes. Free users can browse player profiles and team pages, but premium data layers — detailed projections, value signals and summaries — are visible only to Neeko+ subscribers.",
      },
    ],
  },
  {
    id: "billing",
    group: "Billing",
    label: "Billing",
    items: [
      {
        q: "How much does Neeko+ cost?",
        a: null,
      },
      {
        q: "Is the Season Pass a subscription?",
        a: `No. The Season Pass is a one-time payment of $${NEEKO_PRICING.season.price} AUD for full access across the entire 2026 AFL season. There is no recurring charge and no automatic renewal.`,
      },
      {
        q: "How does the Weekly plan work?",
        a: `The Weekly plan is billed at $${NEEKO_PRICING.weekly.price} AUD per week. Access continues each week while active. You can cancel at any time from your account settings and your access will continue until the end of the current paid period.`,
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. The Weekly plan can be cancelled at any time from your account settings. Access continues until the end of the current paid period. The Season Pass is a one-time payment with no recurring billing — there is nothing to cancel.",
      },
      {
        q: "Are refunds available?",
        a: "Refund requests are assessed on a case-by-case basis in accordance with the Refund Policy and Australian Consumer Law. See the Refund Policy page for full details.",
      },
    ],
  },
  {
    id: "data-projections",
    group: "Data & Projections",
    label: "Data & Projections",
    items: [
      {
        q: "How are projections calculated?",
        a: "Projections are built from a multi-factor model that combines recent form, historical performance, positional role, opponent defensive ratings by position and venue context. The model produces a projected score range — not a single guaranteed number — and is regenerated each round using the latest available data.",
      },
      {
        q: "How often are rankings and stats updated?",
        a: "Rankings and Stat Board data are updated weekly after each completed AFL round. They reflect the most recent match data and the upcoming fixture context.",
      },
      {
        q: "When do weekly projections update?",
        a: "Projections are updated each week once the previous round's data has been processed and the upcoming fixture schedule is confirmed. The platform shows the round the projections relate to so you can check whether the data is current.",
      },
      {
        q: "Why can projections, averages and breakevens change?",
        a: "Player data changes as the season progresses. Projections update as recent form shifts, prices change, roles evolve and new match data arrives. Breakevens update when official AFL Fantasy prices change. This is expected behaviour — it reflects the model incorporating new information.",
      },
      {
        q: "Are projections guaranteed?",
        a: "No. Projections are modelled estimates based on historical performance, form, matchup context and other factors. They represent likely scoring ranges, not certainties. AFL player performance is inherently variable and projections will not always be correct.",
      },
    ],
  },
  {
    id: "accounts",
    group: "Accounts",
    label: "Accounts",
    items: [
      {
        q: "Do I need an account?",
        a: "Some free content — including a limited set of player rankings and Stat Board data — is accessible without signing in. An account is required to subscribe to Neeko+ and to maintain access across sessions.",
      },
      {
        q: "Can I use Neeko+ on multiple devices?",
        a: "Yes. Neeko+ is linked to your account. Sign in from any device — desktop, tablet or mobile — to access your full subscription.",
      },
      {
        q: "What should I do if I cannot access Neeko+ after paying?",
        a: "If your Neeko+ access is not activating after payment, sign out and sign back in first. If the issue persists, use the Contact page and include your email address and the order reference from your Stripe receipt. Access issues are usually resolved within a few hours.",
      },
      {
        q: "What should I do if I find a bug?",
        a: "Use the Contact page to report it. Include a description of the issue, the page it occurred on, and the device or browser you were using. Bug reports help improve the platform for everyone.",
      },
    ],
  },
  {
    id: "legal",
    group: "Legal",
    label: "Legal",
    items: [
      {
        q: "Is my payment information secure?",
        a: "Yes. All payment data is handled by Stripe using industry-standard encryption. Neeko Sports Stats does not store card numbers or sensitive payment information.",
      },
      {
        q: "What personal data is stored?",
        a: "Only essential account information is stored — primarily your email address and subscription status. See the Privacy Policy for full details on data collection, storage and handling.",
      },
      {
        q: "Where can I read the policies?",
        a: "All policies are available on the Policies page: Privacy Policy, Terms and Conditions, Refund Policy, Security Policy and User Conduct Policy.",
      },
    ],
  },
];

// Pricing answer as JSX
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

// ── JSON-LD schema ────────────────────────────────────────────────────────────

function buildSchemaItems() {
  return FAQ_GROUPS.flatMap(({ items }) =>
    items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a === null ? PRICING_TEXT : a,
      },
    }))
  );
}

// ── Category pill labels ──────────────────────────────────────────────────────

const CATEGORY_PILLS = FAQ_GROUPS.map(({ id, label }) => ({ id, label }));

// ── Component ─────────────────────────────────────────────────────────────────

export default function FAQ() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: buildSchemaItems(),
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cat = activeCategory;

    return FAQ_GROUPS
      .filter(({ id }) => !cat || id === cat)
      .map(({ group, id, label, items }) => ({
        group,
        id,
        label,
        items: q
          ? items.filter(
              ({ q: question, a }) =>
                question.toLowerCase().includes(q) ||
                (typeof a === "string" && a.toLowerCase().includes(q))
            )
          : items,
      }))
      .filter(({ items }) => items.length > 0);
  }, [query, activeCategory]);

  const noResults = (query.trim().length > 0 || activeCategory !== null) && filtered.length === 0;

  // First item value for default-open
  const firstItemValue = filtered.length > 0 && filtered[0].items.length > 0
    ? `${filtered[0].id}-0`
    : undefined;

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Helmet>
        <title>FAQ | Neeko Sports Stats</title>
        <meta name="description" content="Answers about Neeko Sports Stats, Stat Board, Fantasy Hub, Neeko+, billing, privacy and account access." />
        <link rel="canonical" href="https://neekostats.com.au/faq" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/faq" />
        <meta property="og:title" content="FAQ | Neeko Sports Stats" />
        <meta property="og:description" content="Answers about Neeko Sports Stats, Stat Board, Fantasy Hub, Neeko+, billing, privacy and account access." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FAQ | Neeko Sports Stats" />
        <meta name="twitter:description" content="Answers about Neeko Sports Stats, Stat Board, Fantasy Hub, Neeko+, billing, privacy and account access." />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-14">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="mb-10">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/25 mb-4">
            Support
          </p>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">
            Frequently Asked Questions
          </h1>
          <p className="text-white/45 text-sm md:text-base leading-relaxed max-w-xl">
            Answers about Neeko Sports Stats, Stat Board, Fantasy Hub, Neeko+, billing, privacy and account access.
          </p>
        </div>

        {/* ── Category jump pills ───────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-8" role="group" aria-label="Filter by category">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
              activeCategory === null
                ? "bg-white/10 border-white/20 text-white"
                : "bg-transparent border-white/[0.09] text-white/40 hover:text-white/65 hover:border-white/[0.16]"
            }`}
            aria-pressed={activeCategory === null}
          >
            All
          </button>
          {CATEGORY_PILLS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveCategory(activeCategory === id ? null : id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                activeCategory === id
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-transparent border-white/[0.09] text-white/40 hover:text-white/65 hover:border-white/[0.16]"
              }`}
              aria-pressed={activeCategory === id}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Search ────────────────────────────────────────────────────────── */}
        <div className="relative mb-10">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search FAQ..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search frequently asked questions"
            className="w-full bg-[#0e0e0e] border border-white/[0.09] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus-visible:border-white/[0.22] transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/55 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded"
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </div>

        {/* ── FAQ sections ──────────────────────────────────────────────────── */}
        {noResults ? (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] px-6 py-10 text-center">
            <p className="text-sm text-white/40 leading-relaxed">
              No matching FAQ found. Try searching for{" "}
              <span className="text-white/55">projections</span>,{" "}
              <span className="text-white/55">Neeko+</span>,{" "}
              <span className="text-white/55">payment</span>,{" "}
              <span className="text-white/55">locked</span> or{" "}
              <span className="text-white/55">Stat Board</span>.
            </p>
            <button
              onClick={() => { setQuery(""); setActiveCategory(null); }}
              className="mt-4 text-xs text-white/35 hover:text-white/60 underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded"
            >
              Show all questions
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {filtered.map(({ group, id, items }, groupIndex) => (
              <section key={id} aria-labelledby={`faq-group-${id}`}>
                <p
                  id={`faq-group-${id}`}
                  className="text-[10px] font-black uppercase tracking-[0.20em] text-white/25 mb-4"
                >
                  {group}
                </p>
                <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] overflow-hidden">
                  {/* First group: open first item by default. Subsequent groups: collapsible only */}
                  <Accordion
                    type="single"
                    collapsible
                    defaultValue={groupIndex === 0 ? firstItemValue : undefined}
                  >
                    {items.map(({ q, a }, i) => (
                      <AccordionItem
                        key={`${id}-${i}`}
                        value={`${id}-${i}`}
                        className="border-white/[0.07] last:border-0"
                      >
                        <AccordionTrigger className="text-left text-sm font-semibold text-white/75 hover:text-white px-6 py-4 hover:no-underline [&[data-state=open]]:text-white transition-colors">
                          {q}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-white/45 leading-relaxed px-6 pb-5">
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
          <h2 className="text-base font-bold text-white mb-1.5">Still deciding?</h2>
          <p className="text-sm text-white/40 mb-6 leading-relaxed">
            Start with the free Stat Board or unlock Neeko+ for full player, team and fantasy intelligence.
          </p>

          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/stat-board"
              className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20 text-white/75 hover:text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <TableProperties size={13} />
              Open Stat Board
            </Link>

            <Link
              to="/neeko-plus"
              className="inline-flex items-center gap-2 font-bold text-[#130c00] text-sm px-4 py-2.5 rounded-xl transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              style={{ background: "linear-gradient(160deg,#fad52a 0%,#e09600 100%)", boxShadow: "0 4px 18px rgba(224,174,45,0.22)" }}
            >
              <Crown size={13} />
              Unlock Neeko+
            </Link>

            <Link
              to="/fantasy"
              className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20 text-white/75 hover:text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <Star size={13} />
              View Fantasy Hub
            </Link>

            <Link
              to="/contact"
              className="inline-flex items-center gap-2 text-white/35 hover:text-white/60 font-semibold text-sm px-4 py-2.5 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
