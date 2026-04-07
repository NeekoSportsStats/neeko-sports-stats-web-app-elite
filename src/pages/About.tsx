import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Trophy, Target, ChartBar as BarChart, TrendingUp, Star, TriangleAlert as AlertTriangle, Shield, ArrowRight, Cpu } from "lucide-react";

const FOCUS_AREAS = [
  {
    icon: Trophy,
    title: "Weekly Rankings",
    desc: "Every relevant player ranked by projected fantasy score, updated each round. Designed to surface must-starts and isolate value picks before lock.",
  },
  {
    icon: Star,
    title: "Captain Signals",
    desc: "A dedicated captain scoring model that weights ceiling probability, matchup grade and recent form into a single ranked output.",
  },
  {
    icon: TrendingUp,
    title: "Breakout Alerts",
    desc: "Players identified as price-inefficient relative to their projection trajectory — candidates whose current price understates their upside.",
  },
  {
    icon: AlertTriangle,
    title: "Trap Warnings",
    desc: "Overpriced or over-owned players flagged for elevated risk. High ownership combined with difficult matchups or declining form metrics.",
  },
  {
    icon: Cpu,
    title: "Projection Modelling",
    desc: "Multi-factor projections built on historical performance, opponent defensive ratings, venue context and recent form velocity.",
  },
  {
    icon: BarChart,
    title: "Matchup Analysis",
    desc: "Opponent strength assessed by position, identifying where defences leak fantasy points and which players stand to benefit.",
  },
];

const PRINCIPLES = [
  {
    icon: Target,
    title: "Structured Output",
    desc: "Every signal is the result of a defined model, not editorial opinion. Rankings, verdicts and alerts follow consistent, repeatable logic.",
  },
  {
    icon: Shield,
    title: "Data Integrity",
    desc: "Projections are built from verified match statistics. Outputs are reviewed each round and the model is iterated to improve accuracy over time.",
  },
  {
    icon: TrendingUp,
    title: "Decision Relevance",
    desc: "The product is scoped to what actually matters in AFL Fantasy: captain choice, trade targets, starting decisions and trap avoidance.",
  },
];

export default function About() {
  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Helmet>
        <title>About Neeko Sports Stats — AFL Fantasy Analytics Platform</title>
        <meta name="description" content="Neeko Sports Stats is an AI-powered AFL Fantasy analytics platform providing weekly player rankings, captain signals, breakout alerts, trap warnings and projection modelling." />
        <link rel="canonical" href="https://neekostats.com.au/about" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/about" />
        <meta property="og:title" content="About Neeko Sports Stats — AFL Fantasy Analytics Platform" />
        <meta property="og:description" content="Neeko Sports Stats is an AI-powered AFL Fantasy analytics platform providing weekly player rankings, captain signals, breakout alerts, trap warnings and projection modelling." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Neeko Sports Stats — AFL Fantasy Analytics Platform" />
        <meta name="twitter:description" content="Neeko Sports Stats is an AI-powered AFL Fantasy analytics platform providing weekly player rankings, captain signals, breakout alerts, trap warnings and projection modelling." />
      </Helmet>
      <div className="max-w-4xl mx-auto px-4 py-16">

        {/* Header */}
        <div className="mb-14">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/25 mb-4">About</p>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-5">
            Neeko Sports Stats
          </h1>
          <p className="text-lg text-white/50 leading-relaxed max-w-2xl">
            An AFL Fantasy analytics platform built to provide advanced projections and AI-driven player insights for coaches who take their game seriously.
          </p>
        </div>

        {/* Divider */}
        <div className="w-10 h-0.5 rounded-full bg-[#F5C84C]/30 mb-14" />

        {/* What the platform is */}
        <section className="mb-16">
          <h2 className="text-xl font-bold text-white mb-4">What it is</h2>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-7 space-y-4">
            <p className="text-white/55 leading-relaxed">
              Neeko Sports Stats is a decision-support tool for AFL Fantasy coaches. The platform ingests match statistics, processes them through a structured analytics pipeline, and produces weekly outputs designed to support team-building decisions.
            </p>
            <p className="text-white/55 leading-relaxed">
              The product is not a news aggregator or a tipping service. It is a modelling platform — built to answer a specific question each round: which players represent the best and worst selections relative to their price, form and upcoming matchup.
            </p>
            <p className="text-white/55 leading-relaxed">
              Outputs are generated weekly and cover the full player pool. The platform is scoped entirely to AFL Fantasy.
            </p>
          </div>
        </section>

        {/* Focus areas */}
        <section className="mb-16">
          <h2 className="text-xl font-bold text-white mb-6">Focus areas</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {FOCUS_AREAS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-5 hover:border-white/[0.12] transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center shrink-0">
                    <Icon size={15} className="text-[#F5C84C]" />
                  </div>
                  <h3 className="text-sm font-bold text-white">{title}</h3>
                </div>
                <p className="text-sm text-white/40 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Principles */}
        <section className="mb-16">
          <h2 className="text-xl font-bold text-white mb-6">How the platform operates</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {PRINCIPLES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-5"
              >
                <div className="w-9 h-9 rounded-xl bg-[#F5C84C]/10 border border-[#F5C84C]/20 flex items-center justify-center mb-4">
                  <Icon size={16} className="text-[#F5C84C]" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Who it is for */}
        <section className="mb-16">
          <h2 className="text-xl font-bold text-white mb-4">Who it is for</h2>
          <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e0e] p-7">
            <p className="text-white/55 leading-relaxed">
              Neeko Sports Stats is built for AFL Fantasy coaches who engage seriously with the game — coaches who research before lockout, who track value across the season and who want data behind their decisions rather than gut feel or social media consensus.
            </p>
            <p className="text-white/55 leading-relaxed mt-4">
              The platform assumes basic familiarity with AFL Fantasy structure. It does not explain the game. It provides intelligence for people who already know what they need to decide.
            </p>
          </div>
        </section>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/sports/afl/rankings"
            className="inline-flex items-center gap-2 bg-[#F5C84C] text-black font-bold text-sm px-7 py-3 rounded-xl hover:brightness-110 transition-all"
          >
            View Rankings
            <ArrowRight size={14} />
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 border border-white/15 text-white/60 hover:text-white hover:border-white/30 font-semibold text-sm px-7 py-3 rounded-xl transition-all"
          >
            Contact
          </Link>
        </div>

      </div>
    </div>
  );
}
