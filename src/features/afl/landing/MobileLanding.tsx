import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  ArrowRight, ChevronRight, ChartBar as BarChart2Icon, Target,
  Zap, Check, Menu, X, Crown, TrendingUp, TriangleAlert as AlertTriangle,
  Star, TableProperties, Shield, Users, CircleHelp as HelpCircle,
  FileText, Mail, LogIn, User, LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardPlayer, StatBoardMatch } from "@/features/afl/stat-board/types";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import { useAuth } from "@/lib/auth";

interface Props {
  isPremium: boolean;
}

// ── Left drawer ───────────────────────────────────────────────────────────────

const DRAWER_MAIN = [
  { label: "Stat Board",  to: "/stat-board/players", icon: TableProperties },
  { label: "Fantasy Hub", to: "/fantasy",             icon: Star            },
  { label: "Players",     to: "/sports/afl/players",  icon: Users           },
  { label: "Teams",       to: "/sports/afl/teams",    icon: Shield          },
  { label: "Neeko+",      to: "/neeko-plus",          icon: Crown, gold: true },
] as const;

const DRAWER_INFO = [
  { label: "About",    to: "/about",    icon: Users      },
  { label: "FAQ",      to: "/faq",      icon: HelpCircle },
  { label: "Policies", to: "/policies", icon: FileText   },
  { label: "Contact",  to: "/contact",  icon: Mail       },
] as const;

function LeftDrawer({
  open, onClose, isPremium, user, authLoading, signOut,
}: {
  open: boolean;
  onClose: () => void;
  isPremium: boolean;
  user: ReturnType<typeof useAuth>["user"];
  authLoading: boolean;
  signOut: () => Promise<void>;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.70)",
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease",
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
          width: 272,
          zIndex: 201,
          background: "#080b0f",
          borderRight: "1px solid rgba(255,255,255,0.09)",
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.26s cubic-bezier(0.22,1,0.36,1)",
          willChange: "transform",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Header — logo + close */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <Link to="/" onClick={onClose} style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <img src="/logo.png" alt="Neeko Sports" style={{ height: 36, width: "auto" }} />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 40, height: 40,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 9,
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.12s ease",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable nav body */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "20px 12px 12px" }}>
          <p style={{
            fontSize: 9, fontWeight: 900, letterSpacing: "0.30em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            margin: "0 0 8px 10px",
          }}>
            Main
          </p>
          {DRAWER_MAIN.filter(l => !(l.gold && isPremium)).map(({ label, to, icon: Icon, gold }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "13px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none",
                color: gold ? "#E0AE2D" : "rgba(255,255,255,0.78)",
                fontSize: 14.5, fontWeight: gold ? 800 : 600,
                background: gold ? "rgba(224,174,45,0.07)" : "transparent",
                border: gold ? "1px solid rgba(224,174,45,0.18)" : "1px solid transparent",
                transition: "background 0.12s ease, border-color 0.12s ease",
                minHeight: 48,
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = gold ? "rgba(224,174,45,0.12)" : "rgba(255,255,255,0.05)";
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = gold ? "rgba(224,174,45,0.07)" : "transparent";
              }}
            >
              <Icon
                size={17}
                style={{ color: gold ? "#E0AE2D" : "rgba(255,255,255,0.38)", flexShrink: 0 }}
              />
              {label}
              {gold && (
                <span style={{
                  marginLeft: "auto",
                  fontSize: 9, fontWeight: 900, letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#E0AE2D",
                  background: "rgba(224,174,45,0.12)",
                  border: "1px solid rgba(224,174,45,0.24)",
                  padding: "2px 7px", borderRadius: 999,
                }}>
                  Upgrade
                </span>
              )}
            </Link>
          ))}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "16px 4px" }} />

          <p style={{
            fontSize: 9, fontWeight: 900, letterSpacing: "0.30em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            margin: "0 0 8px 10px",
          }}>
            Info
          </p>
          {DRAWER_INFO.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "11px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none",
                color: "rgba(255,255,255,0.50)",
                fontSize: 13.5, fontWeight: 500,
                transition: "background 0.12s ease",
                minHeight: 44,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <Icon size={15} style={{ color: "rgba(255,255,255,0.28)", flexShrink: 0 }} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Footer — auth actions */}
        <div style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          {authLoading && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 16px", borderRadius: 11,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.28)",
              fontSize: 12.5, fontWeight: 500,
              minHeight: 48,
            }}>
              Checking session…
            </div>
          )}

          {!authLoading && !user && (
            <Link
              to="/auth"
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 16px", borderRadius: 11,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.60)",
                fontSize: 13.5, fontWeight: 600,
                textDecoration: "none",
                minHeight: 48,
                transition: "background 0.12s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
            >
              <LogIn size={15} /> Sign In
            </Link>
          )}

          {!authLoading && user && (
            <>
              <Link
                to="/account"
                onClick={onClose}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "13px 16px", borderRadius: 11,
                  background: isPremium ? "rgba(224,174,45,0.08)" : "rgba(255,255,255,0.05)",
                  border: isPremium ? "1px solid rgba(224,174,45,0.22)" : "1px solid rgba(255,255,255,0.10)",
                  color: isPremium ? "#E0AE2D" : "rgba(255,255,255,0.75)",
                  fontSize: 13.5, fontWeight: 600,
                  textDecoration: "none",
                  minHeight: 48,
                  transition: "background 0.12s ease",
                }}
              >
                {isPremium ? <Crown size={14} /> : <User size={14} />}
                Account
              </Link>
              <button
                onClick={() => { signOut(); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "11px 16px", borderRadius: 11,
                  background: "none",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.32)",
                  fontSize: 12.5, fontWeight: 500,
                  cursor: "pointer",
                  minHeight: 44,
                  transition: "background 0.12s ease",
                  width: "100%",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
              >
                <LogOut size={13} /> Sign Out
              </button>
            </>
          )}
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
      padding: "0 16px", height: 52,
      background: "rgba(8,10,14,0.94)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      gap: 8,
    }}>
      <button
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
        style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 8, color: "rgba(255,255,255,0.70)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, width: 38, height: 38,
        }}
      >
        <Menu size={17} />
      </button>

      <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flex: 1 }}>
        <img src="/logo.png" alt="Neeko Sports" style={{ height: 32, width: "auto", maxHeight: 32 }} />
      </Link>

      {!isPremium && (
        <Link
          to="/neeko-plus"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "7px 11px", borderRadius: 8, height: 34,
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

// ── Live preview card ─────────────────────────────────────────────────────────

function CompactPreviewRow({ player }: { player: StatBoardPlayer }) {
  const hitData = player.all_threshold_hit_rates?.["20"] ?? player.all_threshold_hit_rates?.["1"];
  const hitFrac = hitData ? `${hitData.hits}/${hitData.games}` : null;
  const hitPct = hitData ? hitData.rate : player.hit_rate_last_10 != null ? Math.round(player.hit_rate_last_10 * 100) : null;
  const proj = player.projection;

  const confColor =
    player.confidence_label === "HIGH" ? "#4ade80"
    : player.confidence_label === "MEDIUM" ? "#fcd34d"
    : "rgba(255,255,255,0.38)";

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "9px 12px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      gap: 10,
    }}>
      {/* Name + team */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#f0f0f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.player_name}
        </p>
        <p style={{ margin: "1px 0 0", fontSize: 10, color: "rgba(255,255,255,0.38)" }}>
          {player.team_name}
        </p>
      </div>

      {/* Projection */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 32 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#f5f5f5", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {proj != null ? proj : "—"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 8, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.05em" }}>proj</p>
      </div>

      {/* Hit rate */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 36 }}>
        {hitFrac ? (
          <>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>{hitFrac}</p>
            {hitPct != null && (
              <p style={{ margin: "1px 0 0", fontSize: 9, color: hitPct >= 70 ? "#4ade80" : hitPct >= 50 ? "#fcd34d" : "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                {hitPct}%
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.22)" }}>—</p>
        )}
        <p style={{ margin: "1px 0 0", fontSize: 8, color: "rgba(255,255,255,0.26)", textTransform: "uppercase", letterSpacing: "0.05em" }}>hit</p>
      </div>

      {/* Confidence label */}
      <div style={{ flexShrink: 0, minWidth: 38, textAlign: "right" }}>
        {player.confidence_label ? (
          <span style={{
            display: "inline-block",
            fontSize: 8, fontWeight: 700,
            color: confColor,
            background: `${confColor}18`,
            border: `1px solid ${confColor}30`,
            padding: "2px 5px", borderRadius: 999,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            {player.confidence_label}
          </span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.20)", fontSize: 10 }}>—</span>
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
      <div style={{ borderRadius: 11, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 48, background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)", backgroundSize: "200% 100%", backgroundPosition: "-200% 0", animation: "shimmer 1.3s ease-in-out infinite", borderBottom: "1px solid rgba(255,255,255,0.04)" }} />
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div style={{ borderRadius: 11, border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden", background: "rgba(6,8,12,0.95)", padding: "16px 14px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.28)", lineHeight: 1.55 }}>
          Preview updates before each round.<br />
          <span style={{ color: "rgba(255,255,255,0.16)" }}>Check back closer to lockout.</span>
        </p>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 11,
      border: "1px solid rgba(34,197,94,0.20)",
      overflow: "hidden",
      background: "rgba(5,7,10,0.96)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(34,197,94,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ fontSize: 8.5, fontWeight: 800, color: "rgba(34,197,94,0.72)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Live Preview
          </span>
        </div>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.26)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {match?.match_label ?? "Disposals 20+"}
        </span>
      </div>

      {/* Column header */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "5px 12px",
        gap: 10,
        background: "rgba(255,255,255,0.02)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <span style={{ flex: 1, fontSize: 8, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Player</span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 32, textAlign: "right" }}>Proj</span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 36, textAlign: "right" }}>Hit</span>
        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 38, textAlign: "right" }}>Conf</span>
      </div>

      {players.map(p => <CompactPreviewRow key={p.player_id} player={p} />)}

      <Link
        to="/stat-board/players"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          padding: "9px 12px",
          fontSize: 11.5, fontWeight: 700, color: "#4ade80",
          textDecoration: "none",
          background: "rgba(34,197,94,0.05)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          letterSpacing: "0.02em",
        }}
      >
        Open Stat Board Free <ChevronRight size={10} />
      </Link>
    </div>
  );
}

// ── How it works steps ────────────────────────────────────────────────────────

const HOW_STEPS = [
  {
    num: "01", icon: <BarChart2Icon size={14} />,
    title: "Pick this round's match",
    copy: "Select any fixture. Free access includes the first match — Neeko+ unlocks all of them.",
  },
  {
    num: "02", icon: <Target size={14} />,
    title: "Choose the stat that matters",
    copy: "Disposals or goals. Set a threshold like 20+ and see every player ranked against it.",
  },
  {
    num: "03", icon: <Zap size={14} />,
    title: "See the trend instantly",
    copy: "Last 10 games, hit rate, projection and consistency — all on one screen before lockout.",
  },
] as const;

// ── Free vs Neeko+ comparison ─────────────────────────────────────────────────

const FREE_ITEMS = [
  "First match preview",
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
  "Top Targets + Trap Alerts",
  "Full player history",
];

// ── Main component ────────────────────────────────────────────────────────────

export default function MobileLanding({ isPremium }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();

  return (
    <div style={{ background: "#09090b", overflowX: "hidden", minHeight: "100dvh" }}>

      <LeftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isPremium={isPremium}
        user={user}
        authLoading={authLoading}
        signOut={signOut}
      />
      <MobileHeader onMenuOpen={() => setDrawerOpen(true)} isPremium={isPremium} />

      {/* ─── HERO ─── */}
      <section style={{
        position: "relative",
        padding: "20px 16px 16px",
        overflow: "hidden",
        backgroundImage: `
          linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(6,10,8,0.90) 55%, rgba(9,9,11,1) 100%),
          url('/images/Fantasy_sports_war_room_setup.png')
        `,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
      }}>
        <div style={{
          position: "absolute", top: -50, left: "50%", transform: "translateX(-50%)",
          width: 260, height: 140, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,197,94,0.05) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 2 }}>
          {/* Eyebrow */}
          <p style={{
            fontSize: 8, fontWeight: 900, letterSpacing: "0.38em",
            textTransform: "uppercase", color: "rgba(34,197,94,0.68)",
            marginBottom: 6, textAlign: "center",
          }}>
            AFL Stat Board
          </p>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(1.45rem, 7vw, 1.85rem)",
            fontWeight: 900, lineHeight: 1.12, letterSpacing: "-0.028em",
            color: "#ffffff", marginBottom: 8, textAlign: "center",
          }}>
            Find AFL players most likely to{" "}
            <span style={{ color: "#22c55e" }}>hit key stats</span>{" "}
            this round.
          </h1>

          {/* Subcopy */}
          <p style={{
            fontSize: 12.5, color: "rgba(255,255,255,0.50)", lineHeight: 1.5,
            textAlign: "center", marginBottom: 14,
            maxWidth: 290, marginLeft: "auto", marginRight: "auto",
          }}>
            Pick a match, choose a stat, see form and hit rates in seconds.
          </p>

          {/* CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 10 }}>
            <Link to="/stat-board/players" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
              color: "#f0fff4", fontWeight: 900, fontSize: 15,
              padding: "14px 20px", borderRadius: 11, textDecoration: "none",
              boxShadow: "0 4px 18px rgba(34,197,94,0.30)", minHeight: 50,
              letterSpacing: "0.01em",
            }}>
              Open Stat Board Free <ArrowRight size={15} />
            </Link>
            <Link to="/neeko-plus" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "rgba(224,174,45,0.07)", border: "1px solid rgba(224,174,45,0.20)",
              color: "rgba(224,174,45,0.82)", fontWeight: 600, fontSize: 13,
              padding: "10px 20px", borderRadius: 11, textDecoration: "none", minHeight: 42,
            }}>
              <Crown size={12} /> Get Neeko+ — ${NEEKO_PRICING.season.price} Full Season
            </Link>
          </div>

          {/* Trust chips */}
          <div style={{
            display: "flex", gap: 5, justifyContent: "center", flexWrap: "wrap", marginBottom: 14,
          }}>
            {[
              { icon: <Zap size={8} />, text: "Updated before lockout" },
              { icon: <Check size={8} />, text: "Free preview" },
              { icon: <BarChart2Icon size={8} />, text: "600+ players" },
            ].map(({ icon, text }) => (
              <div key={text} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 999,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 500,
              }}>
                <span style={{ color: "rgba(34,197,94,0.55)" }}>{icon}</span>
                {text}
              </div>
            ))}
          </div>

          {/* Live preview */}
          <div>
            <p style={{
              textAlign: "center", fontSize: 8.5, color: "rgba(255,255,255,0.22)",
              marginBottom: 6, letterSpacing: "0.10em", textTransform: "uppercase",
            }}>
              Disposals · 20+ · current round
            </p>
            <MobileCompactPreview />
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section style={{ background: "#0b0d0b", padding: "16px 16px 18px" }}>
        <p style={{
          fontSize: 8, fontWeight: 900, letterSpacing: "0.35em",
          textTransform: "uppercase", color: "rgba(34,197,94,0.50)",
          marginBottom: 10, textAlign: "center",
        }}>
          How it works
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {HOW_STEPS.map(({ num, icon, title, copy }, i) => (
            <div key={num} style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              padding: "10px 4px",
              borderBottom: i < HOW_STEPS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, paddingTop: 1 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.16)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#22c55e",
                }}>
                  {icon}
                </div>
                <span style={{ fontSize: 9, fontWeight: 900, color: "rgba(34,197,94,0.25)", letterSpacing: "-0.01em" }}>{num}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 800, color: "#E4E4E4", letterSpacing: "-0.01em" }}>{title}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.36)", lineHeight: 1.5 }}>{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── STAT LENSES ─── */}
      <section style={{ background: "#09090b", padding: "14px 16px 16px" }}>
        <p style={{
          fontSize: 8, fontWeight: 900, letterSpacing: "0.35em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.25)",
          marginBottom: 9, textAlign: "center",
        }}>
          Stats available now
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {[
            { icon: <BarChart2Icon size={14} />, title: "Disposals", color: "#22c55e", pills: ["15+", "20+", "25+", "30+"] },
            { icon: <Target size={14} />, title: "Goals", color: "#f59e0b", pills: ["1+", "2+", "3+", "4+"] },
          ].map(({ icon, title, color, pills }) => (
            <div key={title} style={{
              background: "rgba(255,255,255,0.025)", border: `1px solid ${color}18`,
              borderRadius: 11, padding: "11px 11px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: `${color}12`, border: `1px solid ${color}22`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                  {icon}
                </div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#e8e8e8" }}>{title}</p>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {pills.map(pill => (
                  <span key={pill} style={{
                    fontSize: 9, fontWeight: 700,
                    color: color === "#22c55e" ? "rgba(74,222,128,0.75)" : "rgba(253,211,77,0.75)",
                    background: color === "#22c55e" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                    border: `1px solid ${color === "#22c55e" ? "rgba(34,197,94,0.16)" : "rgba(245,158,11,0.16)"}`,
                    padding: "2px 6px", borderRadius: 4,
                  }}>{pill}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FANTASY HUB TEASER ─── */}
      <section style={{ background: "#0b0d0b", padding: "16px 16px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 11, gap: 8 }}>
          <div>
            <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.35em", textTransform: "uppercase", color: "rgba(244,197,66,0.55)", margin: "0 0 3px" }}>Fantasy Hub</p>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 900, letterSpacing: "-0.020em", color: "#E4E4E4", lineHeight: 1.15, margin: 0 }}>
              Make smarter picks.
            </h2>
          </div>
          <Link to="/fantasy" style={{
            display: "flex", alignItems: "center", gap: 4,
            fontSize: 11.5, fontWeight: 700, color: "rgba(244,197,66,0.75)",
            textDecoration: "none", border: "1px solid rgba(244,197,66,0.18)",
            padding: "6px 11px", borderRadius: 8,
            background: "rgba(244,197,66,0.04)", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            View all <ChevronRight size={10} />
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {[
            { label: "Top Target",   icon: <TrendingUp size={11} />,    color: "#22c55e", desc: "Best value plays." },
            { label: "Trap Alert",   icon: <AlertTriangle size={11} />, color: "#f87171", desc: "Avoid these players." },
            { label: "Captain Pick", icon: <Star size={11} />,          color: "#E0AE2D", desc: "Top scoring projection." },
            { label: "Value Pick",   icon: <Zap size={11} />,           color: "#E8855A", desc: "Priced below output." },
          ].map(({ label, icon, color, desc }) => (
            <div key={label} style={{
              background: "rgba(10,12,16,0.80)",
              border: `1px solid ${color}18`,
              borderRadius: 10, padding: "10px 10px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.45 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ color, opacity: 0.80 }}>{icon}</span>
                <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color }}>{label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.40)", lineHeight: 1.4 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FREE vs NEEKO+ ─── */}
      <section style={{ background: "#09090b", padding: "18px 16px 22px" }}>
        <div style={{ textAlign: "center", marginBottom: 13 }}>
          <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.35em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", marginBottom: 4 }}>Pricing</p>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 900, letterSpacing: "-0.020em", color: "#F0F0F0", lineHeight: 1.2, margin: 0 }}>
            Free to start. Neeko+ for the full picture.
          </h2>
        </div>

        {/* Free vs premium comparison */}
        <div className="pricing-compare" style={{
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 11, overflow: "hidden",
          marginBottom: 12,
        }}>
          <div className="pricing-col pricing-col-free" style={{ padding: "13px 15px", background: "rgba(255,255,255,0.015)" }}>
            <p style={{ margin: "0 0 7px", fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Free</p>
            {FREE_ITEMS.map(item => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                <Check size={9} style={{ color: "#4ade80", flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.48)", lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
          <div className="pricing-col pricing-col-premium" style={{ padding: "13px 15px", background: "rgba(224,174,45,0.03)" }}>
            <p style={{ margin: "0 0 7px", fontSize: 9.5, fontWeight: 800, color: "#E0AE2D", letterSpacing: "0.10em", textTransform: "uppercase" }}>Neeko+</p>
            {PREMIUM_ITEMS.map(item => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
                <Check size={9} style={{ color: "#E0AE2D", flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Neeko+ card */}
        <div style={{
          background: "linear-gradient(160deg, #1c1507 0%, #110e04 100%)",
          border: "1px solid rgba(224,174,45,0.28)", borderRadius: 13, padding: "15px 16px",
          position: "relative", overflow: "hidden",
          boxShadow: "0 8px 28px rgba(0,0,0,0.48)",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(to right, transparent, rgba(224,174,45,0.75), transparent)" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.32em", textTransform: "uppercase", color: "rgba(224,174,45,0.68)", margin: 0 }}>Neeko+</p>
            <span style={{ background: "rgba(224,174,45,0.12)", border: "1px solid rgba(224,174,45,0.28)", borderRadius: 999, padding: "2px 8px", fontSize: 8.5, fontWeight: 900, color: "#E0AE2D", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              Best Value
            </span>
          </div>

          <div style={{ marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.04em", lineHeight: 1 }}>${NEEKO_PRICING.season.price}</span>
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)" }}>AUD · one-time</span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.32)" }}>
              Season Pass · full 2026 season.
            </p>
          </div>
          <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.26)", margin: "0 0 12px", fontStyle: "italic" }}>
            Or ${NEEKO_PRICING.weekly.price}/week — pay as you go, cancel any time.
          </p>

          <Link to="/neeko-plus" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "13px 16px", borderRadius: 11, minHeight: 48, width: "100%", boxSizing: "border-box",
            background: "linear-gradient(160deg, #fad52a 0%, #e09600 100%)",
            color: "#130c00", fontSize: 14.5, fontWeight: 900,
            textDecoration: "none", letterSpacing: "0.01em",
            boxShadow: "0 4px 16px rgba(224,174,45,0.26)",
          }}>
            Get Neeko+ — ${NEEKO_PRICING.season.price} Full Season <ArrowRight size={13} />
          </Link>
          <p style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.24)", margin: "7px 0 0" }}>
            One-time payment. No subscription.
          </p>
        </div>
      </section>

      {/* ─── FOOTER CTA ─── */}
      <section style={{
        background: "#050807",
        padding: `16px 16px max(28px, calc(16px + env(safe-area-inset-bottom, 0px)))`,
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}>
        <p style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.30)", lineHeight: 1.5, marginBottom: 12 }}>
          Free to start. Upgrade any time.
        </p>
        <Link to="/stat-board/players" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
          color: "#f0fff4", fontWeight: 900, fontSize: 15,
          padding: "14px 20px", borderRadius: 11, textDecoration: "none",
          boxShadow: "0 4px 18px rgba(34,197,94,0.22)", minHeight: 50,
        }}>
          Open Stat Board Free <ArrowRight size={15} />
        </Link>
      </section>

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .live-dot { animation: livePulse 1.8s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

        /* Pricing comparison: stack on narrow, side-by-side on wider */
        .pricing-compare { display: flex; flex-direction: column; }
        .pricing-col-free { border-bottom: 1px solid rgba(255,255,255,0.07); }
        @media (min-width: 390px) {
          .pricing-compare { flex-direction: row; }
          .pricing-col { flex: 1; min-width: 0; }
          .pricing-col-free { border-bottom: none; border-right: 1px solid rgba(255,255,255,0.07); }
        }
      `}</style>
    </div>
  );
}
