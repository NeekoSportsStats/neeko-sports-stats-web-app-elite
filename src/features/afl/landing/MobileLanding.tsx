import { Link } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import {
  ArrowRight, ChevronRight, ChartBar as BarChart2Icon, Target,
  Zap, Check, Menu, X, Crown, TrendingUp, TriangleAlert as AlertTriangle,
  Star, TableProperties, Shield, Users, Share2, CircleHelp as HelpCircle,
  FileText, Mail, LogIn,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";
import { NEEKO_PRICING } from "@/config/neekoPricing";

interface Props {
  isPremium: boolean;
}

// ── Left drawer ───────────────────────────────────────────────────────────────

const DRAWER_LINKS = [
  { label: "Stat Board",   to: "/stat-board/players", icon: TableProperties },
  { label: "Fantasy Hub",  to: "/fantasy",            icon: Star            },
  { label: "Players",      to: "/sports/afl/players", icon: Users           },
  { label: "Teams",        to: "/sports/afl/teams",   icon: Shield          },
  { label: "Neeko+",       to: "/neeko-plus",         icon: Crown, gold: true },
];

const DRAWER_INFO = [
  { label: "About",    to: "/about",    icon: Users      },
  { label: "FAQ",      to: "/faq",      icon: HelpCircle },
  { label: "Socials",  to: "/socials",  icon: Share2     },
  { label: "Policies", to: "/policies", icon: FileText   },
  { label: "Contact",  to: "/contact",  icon: Mail       },
];

function LeftDrawer({ open, onClose, isPremium }: { open: boolean; onClose: () => void; isPremium: boolean }) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(2px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s ease",
        }}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0,
          width: 280, zIndex: 201,
          background: "#0a0c10",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          display: "flex", flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(0.22,1,0.36,1)",
          willChange: "transform",
          overflowY: "auto",
        }}
      >
        {/* Drawer header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <Link to="/" onClick={onClose} style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <img src="/logo.png" alt="Neeko Sports" style={{ height: "3.2rem", width: "auto" }} />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 8, padding: 8, color: "rgba(255,255,255,0.60)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Main nav */}
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: "0 0 10px 8px" }}>
            Main
          </p>
          {DRAWER_LINKS.filter(l => !(l.gold && isPremium)).map(({ label, to, icon: Icon, gold }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 12px", borderRadius: 10, marginBottom: 2,
                textDecoration: "none",
                color: gold ? "rgba(224,174,45,0.85)" : "rgba(255,255,255,0.72)",
                fontSize: 14, fontWeight: 600,
                transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Icon size={16} style={{ color: gold ? "#E0AE2D" : "rgba(255,255,255,0.42)", flexShrink: 0 }} />
              {label}
            </Link>
          ))}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "16px 0" }} />

          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", margin: "0 0 10px 8px" }}>
            Info
          </p>
          {DRAWER_INFO.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 10, marginBottom: 2,
                textDecoration: "none",
                color: "rgba(255,255,255,0.52)", fontSize: 13.5, fontWeight: 500,
                transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Icon size={15} style={{ color: "rgba(255,255,255,0.32)", flexShrink: 0 }} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Drawer footer */}
        <div style={{ padding: "16px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <Link
            to="/auth"
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "11px 16px", borderRadius: 10,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <LogIn size={14} /> Sign In
          </Link>
        </div>
      </div>
    </>
  );
}

// ── Mobile header ─────────────────────────────────────────────────────────────

function MobileHeader({ onMenuOpen, isPremium }: { onMenuOpen: () => void; isPremium: boolean }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      display: "flex", alignItems: "center",
      padding: "0 16px", height: 56,
      background: "rgba(8,10,14,0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      gap: 8,
    }}>
      {/* Hamburger — left side */}
      <button
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
        style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 8, padding: "7px 8px", color: "rgba(255,255,255,0.70)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Menu size={18} />
      </button>

      {/* Logo */}
      <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flex: 1 }}>
        <img src="/logo.png" alt="Neeko Sports" style={{ height: "3.5rem", width: "auto" }} />
      </Link>

      {/* Neeko+ CTA — only when not premium */}
      {!isPremium && (
        <Link
          to="/neeko-plus"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "7px 11px", borderRadius: 8,
            background: "linear-gradient(160deg,#fad52a 0%,#e8a800 100%)",
            color: "#130c00", fontSize: 12, fontWeight: 900,
            textDecoration: "none", letterSpacing: "0.01em",
            flexShrink: 0,
          }}
        >
          <Crown size={12} /> Neeko+
        </Link>
      )}
    </header>
  );
}

// ── Compact stat board preview (2-3 players) ─────────────────────────────────

function CompactPreviewRow({ player }: { player: StatBoardPlayer }) {
  const hitData = player.all_threshold_hit_rates?.["20"] ?? player.all_threshold_hit_rates?.["1"];
  const hitFrac = hitData ? `${hitData.hits}/${hitData.games}` : null;
  const hitPct = hitData ? hitData.rate : player.hit_rate_last_10 != null ? Math.round(player.hit_rate_last_10 * 100) : null;
  const proj = player.projection;

  const confColor =
    player.confidence_label === "HIGH" ? "#4ade80"
    : player.confidence_label === "MEDIUM" ? "#fcd34d"
    : "rgba(255,255,255,0.42)";

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "10px 14px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      gap: 8,
    }}>
      {/* Name + team */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#f0f0f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.player_name}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(255,255,255,0.42)" }}>
          {player.team_name}
        </p>
      </div>

      {/* Projection */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f5f5f5", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {proj != null ? proj : "—"}
        </p>
        <p style={{ margin: "1px 0 0", fontSize: 8.5, color: "rgba(255,255,255,0.32)", textTransform: "uppercase", letterSpacing: "0.04em" }}>proj</p>
      </div>

      {/* Hit rate */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 38 }}>
        {hitFrac ? (
          <>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{hitFrac}</p>
            {hitPct != null && (
              <p style={{ margin: "1px 0 0", fontSize: 9.5, color: hitPct >= 70 ? "#4ade80" : hitPct >= 50 ? "#fcd34d" : "rgba(255,255,255,0.38)", fontWeight: 600 }}>
                {hitPct}%
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.25)" }}>—</p>
        )}
        <p style={{ margin: "1px 0 0", fontSize: 8.5, color: "rgba(255,255,255,0.30)", textTransform: "uppercase", letterSpacing: "0.04em" }}>hit</p>
      </div>

      {/* Form label */}
      <div style={{ flexShrink: 0, minWidth: 44, textAlign: "right" }}>
        {player.confidence_label ? (
          <span style={{
            display: "inline-block",
            fontSize: 8.5, fontWeight: 700,
            color: confColor,
            background: `${confColor}18`,
            border: `1px solid ${confColor}35`,
            padding: "2px 6px", borderRadius: 999,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            {player.confidence_label}
          </span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 10 }}>—</span>
        )}
      </div>
    </div>
  );
}

function MobileCompactPreview() {
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [match, setMatch] = useState<StatBoardMatch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { data: matchData } = await supabase.rpc("get_stat_board_matches", { p_season: 2026, p_round: null });
      const matches = (matchData as StatBoardMatch[] | null) ?? [];
      const freeMatch = matches.find((m) => m.is_free_match) ?? matches[0] ?? null;
      if (!freeMatch) { setLoading(false); return; }
      setMatch(freeMatch);

      const { data: playerData } = await supabase.rpc("get_stat_board_players", {
        p_season: 2026, p_round: null,
        p_match_id: freeMatch.match_id,
        p_lens: "disposals", p_threshold: 20,
        p_limit: 4, p_offset: 0,
      });
      const rows = (playerData as StatBoardPlayer[] | null) ?? [];
      setPlayers(rows.filter(p => p.projection != null).slice(0, 3));
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 52, background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.04)", animation: "shimmer 1.3s ease-in-out infinite", backgroundSize: "200% 100%" }} />
        ))}
      </div>
    );
  }

  if (players.length === 0) return null;

  return (
    <div style={{
      borderRadius: 12,
      border: "1px solid rgba(34,197,94,0.22)",
      overflow: "hidden",
      background: "rgba(6,8,12,0.95)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.03)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ fontSize: 8.5, fontWeight: 800, color: "rgba(34,197,94,0.75)", letterSpacing: "0.20em", textTransform: "uppercase" }}>
            Live Preview
          </span>
        </div>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.30)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {match?.match_label ?? "Disposals 20+"}
        </span>
      </div>

      {players.map(p => <CompactPreviewRow key={p.player_id} player={p} />)}

      <Link
        to="/stat-board/players"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          padding: "10px 14px",
          fontSize: 12, fontWeight: 700, color: "#4ade80",
          textDecoration: "none",
          background: "rgba(34,197,94,0.06)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          letterSpacing: "0.02em",
        }}
      >
        Open full Stat Board <ChevronRight size={11} />
      </Link>
    </div>
  );
}

// ── How it works steps ────────────────────────────────────────────────────────

const HOW_STEPS = [
  {
    num: "01", icon: <BarChart2Icon size={15} />,
    title: "Pick this round's match",
    copy: "Select any fixture. Free access includes the first matches — Neeko+ unlocks all of them.",
  },
  {
    num: "02", icon: <Target size={15} />,
    title: "Choose the stat that matters",
    copy: "Disposals or goals. Set a threshold like 20+ and see every player ranked against it.",
  },
  {
    num: "03", icon: <Zap size={15} />,
    title: "See the trend instantly",
    copy: "Last 10 games, hit rate, projection and consistency — all on one screen before lockout.",
  },
] as const;

// ── Free vs Neeko+ comparison ─────────────────────────────────────────────────

const FREE_ITEMS = [
  "First matches preview",
  "Disposals and goals",
  "Limited access",
  "No card required",
];

const PREMIUM_ITEMS = [
  "Full round — every match",
  "All matches unlocked",
  "Full player and team stats",
  "Full Match Centre",
  "Fantasy Hub included",
  "Must Buys, Trap Alerts, Captains",
  "Full player history",
];

// ── Main component ────────────────────────────────────────────────────────────

export default function MobileLanding({ isPremium }: Props) {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div style={{ background: "#09090b", overflowX: "hidden", minHeight: "100vh" }}>

      <LeftDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} isPremium={isPremium} />
      <MobileHeader onMenuOpen={() => setDrawerOpen(true)} isPremium={isPremium} />

      {/* ─── HERO ─── */}
      <section style={{
        position: "relative",
        background: "linear-gradient(180deg, #09090b 0%, #080c0a 100%)",
        padding: "32px 16px 28px",
        overflow: "hidden",
      }}>
        {/* Ambient glow */}
        <div style={{ position: "absolute", top: -80, left: "50%", transform: "translateX(-50%)", width: 340, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,197,94,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 2 }}>
          {/* Eyebrow */}
          <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.72)", marginBottom: 10, textAlign: "center" }}>
            AFL Stat Board
          </p>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(1.55rem, 7.5vw, 2rem)",
            fontWeight: 900, lineHeight: 1.10, letterSpacing: "-0.028em",
            color: "#ffffff", marginBottom: 12, textAlign: "center",
          }}>
            Find AFL players most likely to{" "}
            <span style={{ color: "#22c55e" }}>hit key stats</span>{" "}
            this round.
          </h1>

          {/* Subcopy */}
          <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.60)", lineHeight: 1.55, textAlign: "center", marginBottom: 22, maxWidth: 320, marginLeft: "auto", marginRight: "auto" }}>
            Pick a match, choose a stat, and view form, hit rates, projections and trends in seconds.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
            <Link to="/stat-board/players" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
              color: "#f0fff4", fontWeight: 900, fontSize: 15,
              padding: "15px 20px", borderRadius: 11, textDecoration: "none",
              boxShadow: "0 4px 24px rgba(34,197,94,0.28)", minHeight: 52,
              letterSpacing: "0.01em",
            }}>
              Open Stat Board Free <ArrowRight size={15} />
            </Link>
            <Link to="/neeko-plus" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.70)", fontWeight: 700, fontSize: 14,
              padding: "13px 20px", borderRadius: 11, textDecoration: "none", minHeight: 48,
            }}>
              Unlock Full Round
            </Link>
          </div>

          {/* Premium hook */}
          <p style={{ textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.5, marginBottom: 24 }}>
            Free preview available.{" "}
            <span style={{ color: "rgba(224,174,45,0.70)", fontWeight: 600 }}>Neeko+ unlocks every match and full history.</span>
          </p>

          {/* Compact preview */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.28)", marginBottom: 10, letterSpacing: "0.10em", textTransform: "uppercase" }}>
              Disposals · 20+ threshold · current round
            </p>
            <MobileCompactPreview />
          </div>
        </div>
      </section>

      {/* ─── TRUST ROW ─── */}
      <section style={{ background: "#0d0f0c", padding: "16px" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { icon: <Zap size={10} />, text: "Updated before lockout" },
            { icon: <BarChart2Icon size={10} />, text: "600+ players tracked" },
            { icon: <Check size={10} />, text: "Free preview" },
          ].map(({ icon, text }) => (
            <div key={text} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 999,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              fontSize: 11, color: "rgba(255,255,255,0.50)", fontWeight: 600,
            }}>
              <span style={{ color: "rgba(34,197,94,0.65)" }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section style={{ background: "#0c0e0b", padding: "28px 16px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.55)", marginBottom: 6 }}>How it works</p>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15, margin: 0 }}>
            Three steps to every player trend
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {HOW_STEPS.map(({ num, icon, title, copy }) => (
            <div key={num} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "14px 14px",
              display: "flex", gap: 13, alignItems: "flex-start",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(to right, transparent, rgba(34,197,94,0.25), transparent)" }} />
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(34,197,94,0.09)", border: "1.5px solid rgba(34,197,94,0.20)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#22c55e", flexShrink: 0, marginTop: 1,
              }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: "#E8E8E8", letterSpacing: "-0.01em", margin: 0 }}>{title}</h3>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "rgba(34,197,94,0.12)", letterSpacing: "-0.03em", flexShrink: 0 }}>{num}</span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.5, margin: 0 }}>{copy}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <Link to="/stat-board/players" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 13.5, fontWeight: 700, color: "#4ade80",
            textDecoration: "none", border: "1px solid rgba(34,197,94,0.24)",
            padding: "12px 20px", borderRadius: 10,
            background: "rgba(34,197,94,0.07)", minHeight: 46,
          }}>
            Open Stat Board Free <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* ─── STAT LENSES ─── */}
      <section style={{ background: "#09090b", padding: "28px 16px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(255,255,255,0.32)", marginBottom: 6 }}>Stats available</p>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15, margin: 0 }}>
            Start with the stats people check first.
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              icon: <BarChart2Icon size={17} />, title: "Disposals", color: "#22c55e",
              copy: "Track disposal trends using last 10 games, rolling averages and projections.",
              pills: ["15+", "20+", "25+", "30+"],
            },
            {
              icon: <Target size={17} />, title: "Goals", color: "#f59e0b",
              copy: "Track goal-scoring trends using recent form, hit rates and projections.",
              pills: ["1+", "2+", "3+", "4+"],
            },
          ].map(({ icon, title, color, copy, pills }) => (
            <div key={title} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}20`, borderRadius: 12, padding: "15px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `${color}14`, border: `1px solid ${color}26`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                  {icon}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#ececec" }}>{title}</p>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: "#4ade80", background: "rgba(34,197,94,0.09)", padding: "1px 7px", borderRadius: 999, letterSpacing: "0.07em" }}>Available now</span>
                </div>
              </div>
              <p style={{ margin: "0 0 9px", fontSize: 12, color: "rgba(255,255,255,0.46)", lineHeight: 1.55 }}>{copy}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {pills.map(pill => (
                  <span key={pill} style={{
                    fontSize: 10, fontWeight: 700,
                    color: color === "#22c55e" ? "rgba(74,222,128,0.82)" : "rgba(253,211,77,0.82)",
                    background: color === "#22c55e" ? "rgba(34,197,94,0.09)" : "rgba(245,158,11,0.09)",
                    border: `1px solid ${color === "#22c55e" ? "rgba(34,197,94,0.20)" : "rgba(245,158,11,0.20)"}`,
                    padding: "2px 8px", borderRadius: 5, letterSpacing: "0.03em",
                  }}>{pill}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FANTASY HUB TEASER ─── */}
      <section style={{
        background: "#0c0e0b",
        backgroundImage: "radial-gradient(circle at 50% 0%, rgba(255,180,50,0.04), transparent 55%)",
        padding: "28px 16px 32px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(244,197,66,0.60)", marginBottom: 6 }}>Fantasy Hub</p>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#E8E8E8", lineHeight: 1.15, margin: "0 0 6px" }}>
            Need fantasy-specific calls?
          </h2>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.42)", lineHeight: 1.5, margin: "0 auto", maxWidth: 280 }}>
            Must Buys, Trap Alerts, Captain Picks and Rankings — updated before every lockout.
          </p>
        </div>

        {/* 2 fantasy cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Must Buy", icon: <TrendingUp size={12} />, color: "#22c55e", desc: "Best value plays this round." },
            { label: "Trap Alert", icon: <AlertTriangle size={12} />, color: "#f87171", desc: "High-risk underperformers." },
          ].map(({ label, icon, color, desc }) => (
            <div key={label} style={{
              background: "rgba(10,12,16,0.85)",
              border: `1px solid ${color}22`,
              borderRadius: 12, padding: "14px 12px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.6 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <span style={{ color, opacity: 0.85 }}>{icon}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color }}>{label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.50)", lineHeight: 1.45 }}>{desc}</p>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { label: "Captain Pick", icon: <Star size={12} />, color: "#E0AE2D", desc: "Top projected scorer this round." },
            { label: "Value Pick", icon: <Zap size={12} />, color: "#E8855A", desc: "Projecting above recent averages." },
          ].map(({ label, icon, color, desc }) => (
            <div key={label} style={{
              background: "rgba(10,12,16,0.85)",
              border: `1px solid ${color}22`,
              borderRadius: 12, padding: "14px 12px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.6 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                <span style={{ color, opacity: 0.85 }}>{icon}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color }}>{label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.50)", lineHeight: 1.45 }}>{desc}</p>
            </div>
          ))}
        </div>

        <Link to="/fantasy" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          fontSize: 13.5, fontWeight: 700, color: "rgba(244,197,66,0.85)",
          textDecoration: "none", border: "1px solid rgba(244,197,66,0.24)",
          padding: "12px 20px", borderRadius: 10,
          background: "rgba(244,197,66,0.06)", minHeight: 46,
        }}>
          View Fantasy Hub <ChevronRight size={13} />
        </Link>
      </section>

      {/* ─── FREE vs NEEKO+ ─── */}
      <section style={{ background: "#09090b", padding: "28px 16px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 6 }}>Pricing</p>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 900, letterSpacing: "-0.025em", color: "#F0F0F0", lineHeight: 1.15, margin: 0 }}>
            Free lets you explore the first matches.
          </h2>
        </div>

        {/* Free card */}
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: "20px 18px", marginBottom: 10,
        }}>
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: "0 0 8px" }}>Free</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: "rgba(255,255,255,0.58)", letterSpacing: "-0.04em" }}>$0</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.32)" }}>/forever</span>
            </div>
            <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>No card required.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
            {FREE_ITEMS.map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.20)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={8} style={{ color: "#4ade80" }} />
                </div>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>{item}</span>
              </div>
            ))}
          </div>
          <Link to="/stat-board/players" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "12px 20px", borderRadius: 10, minHeight: 46,
            border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: 700,
            textDecoration: "none",
          }}>
            Open Stat Board Free <ArrowRight size={12} />
          </Link>
        </div>

        {/* Neeko+ card */}
        <div style={{
          background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)",
          border: "1px solid rgba(224,174,45,0.30)", borderRadius: 16, padding: "20px 18px",
          position: "relative", overflow: "hidden",
          boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 16px 40px rgba(0,0,0,0.50)",
        }}>
          {/* Top gold line */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, transparent, rgba(224,174,45,0.80), transparent)" }} />

          <div style={{ position: "absolute", top: 16, right: 16, background: "rgba(224,174,45,0.15)", border: "1px solid rgba(224,174,45,0.32)", borderRadius: 999, padding: "3px 10px", fontSize: 9, fontWeight: 900, color: "#E0AE2D", letterSpacing: "0.10em", textTransform: "uppercase" }}>
            Best Value
          </div>

          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(224,174,45,0.65)", margin: "0 0 8px" }}>Neeko+</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 28, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.03em" }}>${NEEKO_PRICING.season.price}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>AUD</span>
                </div>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", margin: "2px 0 0" }}>Season Pass — one-time</p>
              </div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>or</span>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                  <span style={{ fontSize: 22, fontWeight: 900, color: "rgba(255,255,255,0.55)", letterSpacing: "-0.03em" }}>${NEEKO_PRICING.weekly.price}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>AUD/week</span>
                </div>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", margin: "2px 0 0" }}>Weekly plan</p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 20 }}>
            {PREMIUM_ITEMS.map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.24)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Check size={8} style={{ color: "#22c55e" }} />
                </div>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>{item}</span>
              </div>
            ))}
          </div>

          <Link to="/neeko-plus" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "15px 20px", borderRadius: 11, minHeight: 52,
            background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
            color: "#130c00", fontSize: 15, fontWeight: 900,
            textDecoration: "none", letterSpacing: "0.01em",
            boxShadow: "0 4px 20px rgba(224,174,45,0.28)",
          }}>
            Get Neeko+ — Full Season Access <ArrowRight size={14} />
          </Link>
          <p style={{ textAlign: "center", fontSize: 10.5, color: "rgba(255,255,255,0.28)", margin: "10px 0 0" }}>
            One-time payment. Access until end of 2026 AFL season.
          </p>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section style={{
        background: "linear-gradient(180deg, #09090b 0%, #050807 100%)",
        padding: "40px 16px 56px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 50% 60%, rgba(34,197,94,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <p style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.60)", marginBottom: 10 }}>Get Started</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.10, marginBottom: 10 }}>
            Ready to explore this round's AFL stat trends?
          </h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", lineHeight: 1.6, marginBottom: 24, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
            Open the Stat Board for free, or unlock the full round with Neeko+.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Link to="/stat-board/players" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
              color: "#f0fff4", fontWeight: 900, fontSize: 15.5,
              padding: "16px 20px", borderRadius: 12, textDecoration: "none",
              boxShadow: "0 6px 28px rgba(34,197,94,0.28)", minHeight: 54,
            }}>
              Open Stat Board Free <ArrowRight size={15} />
            </Link>
            <Link to="/neeko-plus" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              background: "rgba(224,174,45,0.08)", border: "1px solid rgba(224,174,45,0.24)",
              color: "rgba(224,174,45,0.82)", fontWeight: 700, fontSize: 14,
              padding: "13px 20px", borderRadius: 12, textDecoration: "none", minHeight: 48,
            }}>
              Unlock Neeko+
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .live-dot { animation: livePulse 1.8s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>
    </div>
  );
}
