import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { TableProperties, Star, Users, TrendingUp, Database, Cpu, ChartBar as BarChart2, CircleCheck as CheckCircle2, Circle as XCircle, ArrowRight, Crown } from "lucide-react";

// ── Data ─────────────────────────────────────────────────────────────────────

const STAT_STRIP = [
  { value: "600+",               label: "Players tracked"        },
  { value: "Weekly",             label: "AFL updates"            },
  { value: "Stat Board",         label: "& Fantasy Hub"          },
  { value: "Player & Team",      label: "pages"                  },
];

const PRODUCTS = [
  {
    icon: TableProperties,
    title: "Stat Board",
    desc: "Find players most likely to hit key stats using match, player and recent-form context. Browse by player, team or match, and compare performance across rounds.",
    href: "/stat-board",
    cta: "Open Stat Board",
  },
  {
    icon: Star,
    title: "Fantasy Hub",
    desc: "View rankings, projections, captain calls, value picks and trap alerts for the current AFL Fantasy round — updated before each lockout.",
    href: "/fantasy",
    cta: "View Fantasy Hub",
  },
  {
    icon: Users,
    title: "Player & Team Intelligence",
    desc: "Explore individual player trends, team profiles, squad breakdowns and weekly signals. Dig into any player or club to understand form and context.",
    href: "/sports/afl/players",
    cta: "Browse Players",
  },
];

const PIPELINE_STEPS = [
  {
    step: "01",
    icon: Database,
    title: "Collect AFL player data",
    desc: "Match statistics, player performance records, team results and price history are ingested each week from AFL game data.",
  },
  {
    step: "02",
    icon: Cpu,
    title: "Process form, role, price and matchup context",
    desc: "Each player's recent form, positional role, current price, breakeven and upcoming opponent difficulty are combined into a structured feature set.",
  },
  {
    step: "03",
    icon: BarChart2,
    title: "Generate rankings, projections, signals and summaries",
    desc: "The processed data produces weekly rankings, score projections, value signals, captain ratings, breakout candidates and trap alerts across the full player pool.",
  },
];

const IS_LIST = [
  "An AFL player stats and modelling platform",
  "A weekly AFL Fantasy decision-support tool",
  "A way to compare players, teams, prices, form and trends",
];

const IS_NOT_LIST = [
  "A gambling tips service",
  "A guarantee of player performance",
  "A replacement for user judgement",
];

const AUDIENCE = [
  {
    title: "AFL Fantasy managers",
    desc: "Research trades, captains and starts before lockout using projections, breakevens, form trends and value signals — all in one place.",
  },
  {
    title: "Stat-focused AFL fans",
    desc: "Track how players and teams are performing across rounds, explore match centre data and compare players by any key stat.",
  },
  {
    title: "Pre-lockout researchers",
    desc: "Quickly compare two players before selection cuts off — projection, form trend, matchup grade and price context side by side.",
  },
  {
    title: "Data-first decision makers",
    desc: "Replace gut feel and social media consensus with structured data. Signals are built from verified AFL match statistics, not editorial opinion.",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function About() {
  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <Helmet>
        <title>About Neeko Sports Stats | AFL Stats, Rankings &amp; Fantasy Intelligence</title>
        <meta name="description" content="Learn how Neeko Sports Stats tracks AFL player data, projections, prices, rankings, team trends and fantasy signals to support smarter weekly decisions." />
        <link rel="canonical" href="https://neekostats.com.au/about" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://neekostats.com.au/about" />
        <meta property="og:title" content="About Neeko Sports Stats | AFL Stats, Rankings &amp; Fantasy Intelligence" />
        <meta property="og:description" content="Learn how Neeko Sports Stats tracks AFL player data, projections, prices, rankings, team trends and fantasy signals to support smarter weekly decisions." />
        <meta property="og:image" content="https://neekostats.com.au/og-default.png" />
        <meta name="robots" content="index, follow" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Neeko Sports Stats | AFL Stats, Rankings &amp; Fantasy Intelligence" />
        <meta name="twitter:description" content="Learn how Neeko Sports Stats tracks AFL player data, projections, prices, rankings, team trends and fantasy signals to support smarter weekly decisions." />
      </Helmet>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(48px, 8vw, 80px) clamp(16px, 5vw, 32px) 100px" }}>

        {/* ── 1. Hero ─────────────────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(245,200,76,0.60)",
            marginBottom: 18,
          }}>
            About
          </p>

          <h1 style={{
            fontSize: "clamp(1.9rem, 4.5vw, 3rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            lineHeight: 1.12,
            color: "#F5F5F5",
            margin: "0 0 20px",
            maxWidth: 680,
          }}>
            AFL stats and fantasy intelligence,<br />
            <span style={{ color: "#F5C84C" }}>built for weekly decisions.</span>
          </h1>

          <p style={{
            fontSize: "clamp(14px, 1.2vw, 16.5px)",
            color: "rgba(255,255,255,0.50)",
            lineHeight: 1.7,
            maxWidth: 620,
            margin: "0 0 40px",
          }}>
            Neeko Sports Stats was built to make AFL player data easier to use before lockout. Instead of jumping between spreadsheets, match stats, price lists and social media opinions, Neeko brings player trends, projections, prices, breakevens, hit rates and team context into one weekly decision platform.
          </p>

          {/* Stat strip */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 1,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            {STAT_STRIP.map(({ value, label }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.02)",
                padding: "18px 20px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#F5C84C", letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 5, fontWeight: 500 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div style={{ width: 40, height: 2, background: "rgba(245,200,76,0.25)", borderRadius: 99, marginBottom: 64 }} />

        {/* ── 2. What Neeko does ───────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            The platform
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 28px",
          }}>
            What Neeko does
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
            {PRODUCTS.map(({ icon: Icon, title, desc, href, cta }) => (
              <div key={title} style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: "24px 22px",
                display: "flex", flexDirection: "column",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "rgba(245,200,76,0.09)",
                  border: "1px solid rgba(245,200,76,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 16,
                }}>
                  <Icon size={16} style={{ color: "#F5C84C" }} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: "#F5F5F5", margin: "0 0 8px" }}>{title}</h3>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, margin: "0 0 20px", flexGrow: 1 }}>{desc}</p>
                <Link to={href} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 700, color: "rgba(245,200,76,0.75)",
                  textDecoration: "none",
                  transition: "color 0.12s",
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.color = "#F5C84C")}
                onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.color = "rgba(245,200,76,0.75)")}
                >
                  {cta} <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── 3. How it works ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            The pipeline
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 28px",
          }}>
            How it works
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {PIPELINE_STEPS.map(({ step, icon: Icon, title, desc }) => (
              <div key={step} style={{
                display: "flex", alignItems: "flex-start", gap: 18,
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14,
                padding: "20px 22px",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 900, color: "rgba(245,200,76,0.50)",
                  letterSpacing: "0.04em", minWidth: 24, paddingTop: 2, flexShrink: 0,
                }}>
                  {step}
                </div>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: "rgba(245,200,76,0.07)",
                  border: "1px solid rgba(245,200,76,0.14)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Icon size={15} style={{ color: "#F5C84C" }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: "#F5F5F5", margin: "0 0 6px" }}>{title}</h3>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", lineHeight: 1.65, margin: 0 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Is / Is not ──────────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            Transparency
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 28px",
          }}>
            What Neeko is — and is not
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {/* Is */}
            <div style={{
              background: "rgba(34,197,94,0.04)",
              border: "1px solid rgba(34,197,94,0.14)",
              borderRadius: 16, padding: "22px 22px",
            }}>
              <p style={{
                fontSize: 10, fontWeight: 900, letterSpacing: "0.22em",
                textTransform: "uppercase", color: "rgba(34,197,94,0.60)",
                marginBottom: 16,
              }}>
                Neeko is
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {IS_LIST.map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <CheckCircle2 size={15} style={{ color: "rgba(34,197,94,0.70)", marginTop: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.60)", lineHeight: 1.55 }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Is not */}
            <div style={{
              background: "rgba(239,68,68,0.04)",
              border: "1px solid rgba(239,68,68,0.12)",
              borderRadius: 16, padding: "22px 22px",
            }}>
              <p style={{
                fontSize: 10, fontWeight: 900, letterSpacing: "0.22em",
                textTransform: "uppercase", color: "rgba(239,68,68,0.55)",
                marginBottom: 16,
              }}>
                Neeko is not
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {IS_NOT_LIST.map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <XCircle size={15} style={{ color: "rgba(239,68,68,0.60)", marginTop: 1, flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, color: "rgba(255,255,255,0.60)", lineHeight: 1.55 }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── 5. Who it is for ────────────────────────────────────────────── */}
        <section style={{ marginBottom: 64 }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            marginBottom: 10,
          }}>
            Audience
          </p>
          <h2 style={{
            fontSize: "clamp(1.2rem, 2.5vw, 1.6rem)",
            fontWeight: 800, color: "#F5F5F5",
            letterSpacing: "-0.025em", margin: "0 0 28px",
          }}>
            Who it is for
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {AUDIENCE.map(({ title, desc }) => (
              <div key={title} style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "18px 20px",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.13)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)")}
              >
                <h3 style={{ fontSize: 13.5, fontWeight: 800, color: "#F5F5F5", margin: "0 0 7px" }}>{title}</h3>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 6. CTA ──────────────────────────────────────────────────────── */}
        <section>
          <div style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 20, padding: "36px 32px",
            textAlign: "center",
          }}>
            <h2 style={{
              fontSize: "clamp(1.1rem, 2.2vw, 1.45rem)",
              fontWeight: 800, color: "#F5F5F5",
              letterSpacing: "-0.025em", margin: "0 0 8px",
            }}>
              Ready to get started?
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", margin: "0 0 28px", lineHeight: 1.6 }}>
              Explore the Stat Board and Fantasy Hub for free, or unlock the full platform with Neeko+.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {/* Primary — Neeko+ */}
              <Link to="/neeko-plus" style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "linear-gradient(160deg,#fad52a 0%,#e09600 100%)",
                color: "#130c00", fontWeight: 900, fontSize: 14,
                padding: "12px 22px", borderRadius: 11,
                textDecoration: "none",
                boxShadow: "0 6px 24px rgba(224,174,45,0.28)",
                transition: "filter 0.14s",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.08)")}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.filter = "none")}
              >
                <Crown size={14} />
                Unlock Neeko+
              </Link>

              {/* Secondary — Stat Board */}
              <Link to="/stat-board" style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.80)", fontWeight: 700, fontSize: 14,
                padding: "12px 22px", borderRadius: 11,
                textDecoration: "none",
                transition: "background 0.14s, border-color 0.14s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background = "rgba(255,255,255,0.09)";
                el.style.borderColor = "rgba(255,255,255,0.20)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background = "rgba(255,255,255,0.06)";
                el.style.borderColor = "rgba(255,255,255,0.12)";
              }}
              >
                <TableProperties size={13} />
                Open Stat Board
              </Link>

              {/* Secondary — Fantasy Hub */}
              <Link to="/fantasy" style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.80)", fontWeight: 700, fontSize: 14,
                padding: "12px 22px", borderRadius: 11,
                textDecoration: "none",
                transition: "background 0.14s, border-color 0.14s",
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background = "rgba(255,255,255,0.09)";
                el.style.borderColor = "rgba(255,255,255,0.20)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.background = "rgba(255,255,255,0.06)";
                el.style.borderColor = "rgba(255,255,255,0.12)";
              }}
              >
                <Star size={13} />
                View Fantasy Hub
              </Link>
            </div>

            <p style={{ marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
              Have a question?{" "}
              <Link to="/contact" style={{ color: "rgba(255,255,255,0.40)", textDecoration: "underline" }}>
                Contact us
              </Link>
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
