import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowRight, ChevronRight, ChartBar as BarChart2Icon, Target,
  Zap, Check, Menu, X, Crown, TrendingUp, TriangleAlert as AlertTriangle,
  Star, TableProperties, Shield, Users, CircleHelp as HelpCircle,
  FileText, Mail, LogIn, User, LogOut, Lock,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardPlayer, StatBoardMatch, StatLens } from "@/features/afl/stat-board/types";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import { useAuth } from "@/lib/auth";

interface Props {
  isPremium: boolean;
}

// ── Left drawer ───────────────────────────────────────────────────────────────

const DRAWER_MAIN = [
  { label: "Stats Hub",   to: "/stat-board/players", icon: TableProperties },
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
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
        aria-hidden="true"
      />
      <div
        role="dialog" aria-modal="true" aria-label="Navigation menu"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, width: 276,
          zIndex: 201, background: "#070a0e",
          borderRight: "1px solid rgba(255,255,255,0.09)",
          display: "flex", flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.26s cubic-bezier(0.22,1,0.36,1)",
          willChange: "transform",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0,
        }}>
          <Link to="/" onClick={onClose} style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
            <img src="/logo.png" alt="Neeko Sports" style={{ height: 38, width: "auto" }} />
          </Link>
          <button
            onClick={onClose} aria-label="Close menu"
            style={{
              width: 40, height: 40, background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9,
              color: "rgba(255,255,255,0.55)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.12s",
            }}
          >
            <X size={17} />
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: "auto", padding: "18px 12px 12px" }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", margin: "0 0 8px 10px" }}>
            Main
          </p>
          {DRAWER_MAIN.filter(l => !(l.gold && isPremium)).map(({ label, to, icon: Icon, gold }) => (
            <Link
              key={to} to={to} onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "13px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none",
                color: gold ? "#E0AE2D" : "rgba(255,255,255,0.80)",
                fontSize: 14.5, fontWeight: gold ? 800 : 600,
                background: gold ? "rgba(224,174,45,0.07)" : "transparent",
                border: gold ? "1px solid rgba(224,174,45,0.18)" : "1px solid transparent",
                transition: "background 0.12s", minHeight: 48,
              }}
            >
              <Icon size={17} style={{ color: gold ? "#E0AE2D" : "rgba(255,255,255,0.38)", flexShrink: 0 }} />
              {label}
              {gold && (
                <span style={{
                  marginLeft: "auto", fontSize: 9, fontWeight: 900,
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "#E0AE2D", background: "rgba(224,174,45,0.12)",
                  border: "1px solid rgba(224,174,45,0.24)",
                  padding: "2px 7px", borderRadius: 999,
                }}>
                  Upgrade
                </span>
              )}
            </Link>
          ))}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "14px 4px" }} />

          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.30em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", margin: "0 0 8px 10px" }}>
            Info
          </p>
          {DRAWER_INFO.map(({ label, to, icon: Icon }) => (
            <Link
              key={to} to={to} onClick={onClose}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "11px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none", color: "rgba(255,255,255,0.50)",
                fontSize: 13.5, fontWeight: 500, minHeight: 44,
                transition: "background 0.12s",
              }}
            >
              <Icon size={15} style={{ color: "rgba(255,255,255,0.28)", flexShrink: 0 }} />
              {label}
            </Link>
          ))}
        </nav>

        <div style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {authLoading && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 16px", borderRadius: 11,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.28)", fontSize: 12.5, fontWeight: 500, minHeight: 48,
            }}>
              Checking session…
            </div>
          )}
          {!authLoading && !user && (
            <Link to="/auth" onClick={onClose} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "13px 16px", borderRadius: 11,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.60)", fontSize: 13.5, fontWeight: 600,
              textDecoration: "none", minHeight: 48,
            }}>
              <LogIn size={15} /> Sign In
            </Link>
          )}
          {!authLoading && user && (
            <>
              <Link to="/account" onClick={onClose} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 16px", borderRadius: 11,
                background: isPremium ? "rgba(224,174,45,0.08)" : "rgba(255,255,255,0.05)",
                border: isPremium ? "1px solid rgba(224,174,45,0.22)" : "1px solid rgba(255,255,255,0.10)",
                color: isPremium ? "#E0AE2D" : "rgba(255,255,255,0.75)",
                fontSize: 13.5, fontWeight: 600, textDecoration: "none", minHeight: 48,
              }}>
                {isPremium ? <Crown size={14} /> : <User size={14} />}
                Account
              </Link>
              <button
                onClick={() => { signOut(); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "11px 16px", borderRadius: 11, background: "none",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.32)", fontSize: 12.5, fontWeight: 500,
                  cursor: "pointer", minHeight: 44, width: "100%",
                }}
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
      display: "flex", alignItems: "center",
      padding: "0 14px 0 12px", height: 62,
      gap: 12,
    }}>
      {/* Burger */}
      <button
        onClick={onMenuOpen} aria-label="Open navigation menu"
        style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, color: "rgba(255,255,255,0.80)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, width: 42, height: 42,
        }}
      >
        <Menu size={20} />
      </button>

      {/* Brand — logo + name text */}
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", flex: 1, minWidth: 0 }}>
        <img
          src="/logo.png"
          alt="Neeko Sports"
          style={{ height: 46, width: "auto", maxHeight: 46, flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <span style={{
            display: "block",
            fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em",
            color: "#f0f0f0", lineHeight: 1.1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            Neeko Sports
          </span>
          <span style={{
            display: "block",
            fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
            color: "rgba(255,255,255,0.38)", lineHeight: 1.2,
            textTransform: "uppercase",
          }}>
            Stats
          </span>
        </div>
      </Link>

      {/* Neeko+ / Plus badge */}
      {!isPremium && (
        <Link to="/neeko-plus" style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 14px", height: 40, borderRadius: 10,
          background: "linear-gradient(160deg,#fad52a 0%,#e09600 100%)",
          color: "#130c00", fontSize: 13, fontWeight: 900,
          textDecoration: "none", letterSpacing: "0.01em", flexShrink: 0,
          boxShadow: "0 2px 10px rgba(224,174,45,0.22)",
        }}>
          <Crown size={14} /> Neeko+
        </Link>
      )}
      {isPremium && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 12px", height: 38, borderRadius: 10,
          background: "rgba(224,174,45,0.10)",
          border: "1px solid rgba(224,174,45,0.28)",
          color: "#E0AE2D", fontSize: 12, fontWeight: 800, flexShrink: 0,
        }}>
          <Crown size={13} /> Plus
        </div>
      )}
    </header>
  );
}

// ── Product nav ───────────────────────────────────────────────────────────────

const PRODUCT_NAV = [
  { label: "Stats Hub", to: "/stat-board/players", icon: BarChart2Icon },
  { label: "Fantasy",   to: "/fantasy",            icon: Star           },
  { label: "Players",   to: "/sports/afl/players", icon: Users          },
  { label: "Teams",     to: "/sports/afl/teams",   icon: Shield         },
] as const;

function ProductNav() {
  return (
    <div style={{
      overflowX: "auto",
      scrollbarWidth: "none",
      WebkitOverflowScrolling: "touch",
      borderTop: "1px solid rgba(255,255,255,0.06)",
    } as React.CSSProperties}>
      <div style={{
        display: "flex", alignItems: "center",
        padding: "0 10px", gap: 0,
        width: "max-content", minWidth: "100%",
      }}>
        {PRODUCT_NAV.map(({ label, to, icon: Icon }) => (
          <Link
            key={to} to={to}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 13px", height: 42,
              fontSize: 13, fontWeight: 600,
              color: "rgba(255,255,255,0.60)",
              textDecoration: "none", whiteSpace: "nowrap",
              borderRadius: 7, transition: "color 0.12s, background 0.12s",
            }}
          >
            <Icon size={14} style={{ flexShrink: 0, opacity: 0.70 }} />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Data hook — free round preview ───────────────────────────────────────────

interface FreeRoundData {
  matches: StatBoardMatch[];
  loading: boolean;
}

function useFreeRoundData(): FreeRoundData {
  const [matches, setMatches] = useState<StatBoardMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase
      .rpc("get_stat_board_matches", { p_season: 2026, p_round: null })
      .then(({ data }) => {
        const all = (data as StatBoardMatch[] | null) ?? [];
        // Take the first two free matches
        const free = all.filter(m => m.is_free_match).slice(0, 2);
        setMatches(free.length > 0 ? free : all.slice(0, 2));
        setLoading(false);
      });
  }, []);

  return { matches, loading };
}

// ── Profile text helper ───────────────────────────────────────────────────────

// Normalise a rate value to 0-1 regardless of whether the source is 0-1 or 0-100.
function normaliseRate(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

function profileText(player: StatBoardPlayer): string {
  const { stat_lens, all_threshold_hit_rates, projection, hit_rate_last_10 } = player;

  if (stat_lens === "disposals") {
    const hr25 = all_threshold_hit_rates?.["25"];
    const hr20 = all_threshold_hit_rates?.["20"];
    if (hr25 && normaliseRate(hr25.rate) >= 0.65) return "strong 25+ profile";
    if (hr20 && normaliseRate(hr20.rate) >= 0.65) return "strong 20+ profile";
    if (hr20 && normaliseRate(hr20.rate) >= 0.45) return "solid 20+ profile";
    return "disposal contributor";
  }

  // goals
  const hr2 = all_threshold_hit_rates?.["2"];
  const hr1 = all_threshold_hit_rates?.["1"];
  if ((projection ?? 0) >= 1.8) return "2+ goal ceiling";
  if (hr2 && normaliseRate(hr2.rate) >= 0.55) return "2+ goal upside";
  if (hr1 && normaliseRate(hr1.rate) >= 0.70) return "anytime goal profile";
  const rawRate = hit_rate_last_10 != null ? hit_rate_last_10 : (hr1?.rate ?? 0);
  if (normaliseRate(rawRate) >= 0.50) return "consistent scorer";
  return "goal threat";
}

// ── Player preview row ────────────────────────────────────────────────────────

function PlayerPreviewRow({ player }: { player: StatBoardPlayer }) {
  const profile = profileText(player);
  const hitData =
    player.stat_lens === "disposals"
      ? (player.all_threshold_hit_rates?.["20"] ?? null)
      : (player.all_threshold_hit_rates?.["1"] ?? null);
  const hitFrac = hitData ? `${hitData.hits}/${hitData.games}` : null;
  // rate may be 0-1 (fraction) or 0-100 (percent) depending on the RPC version.
  // Normalise: if > 1, treat as already 0-100; otherwise multiply by 100.
  const hitPct = hitData?.rate != null
    ? Math.min(100, Math.round(hitData.rate > 1 ? hitData.rate : hitData.rate * 100))
    : null;
  const proj = player.projection;

  const confColor =
    player.confidence_label === "HIGH" ? "#4ade80"
    : player.confidence_label === "MEDIUM" ? "#fcd34d"
    : "rgba(255,255,255,0.38)";

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "11px 14px", gap: 10,
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    }}>
      {/* Name + profile */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "#f0f0f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.player_name}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "rgba(255,255,255,0.40)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.team_name} · <span style={{ color: "rgba(255,255,255,0.28)", fontStyle: "italic" }}>{profile}</span>
        </p>
      </div>

      {/* Projection */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 34 }}>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: "#f5f5f5", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {proj != null ? proj : "—"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 7.5, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.06em" }}>proj</p>
      </div>

      {/* Hit rate */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 36 }}>
        {hitFrac ? (
          <>
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: hitPct != null && hitPct >= 70 ? "#4ade80" : "#f0f0f0", fontVariantNumeric: "tabular-nums" }}>
              {hitFrac}
            </p>
            {hitPct != null && (
              <p style={{ margin: "1px 0 0", fontSize: 9, color: hitPct >= 70 ? "#4ade80" : hitPct >= 50 ? "#fcd34d" : "rgba(255,255,255,0.35)", fontWeight: 600 }}>
                {hitPct}%
              </p>
            )}
          </>
        ) : <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.22)" }}>—</p>}
        <p style={{ margin: "1px 0 0", fontSize: 7.5, color: "rgba(255,255,255,0.24)", textTransform: "uppercase", letterSpacing: "0.06em" }}>hit</p>
      </div>

      {/* Confidence */}
      <div style={{ flexShrink: 0, minWidth: 36, textAlign: "right" }}>
        {player.confidence_label ? (
          <span style={{
            display: "inline-block",
            fontSize: 8, fontWeight: 700, color: confColor,
            background: `${confColor}15`,
            border: `1px solid ${confColor}30`,
            padding: "2px 5px", borderRadius: 999,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>
            {player.confidence_label === "HIGH" ? "High" : player.confidence_label === "MEDIUM" ? "Med" : "Low"}
          </span>
        ) : <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 10 }}>—</span>}
      </div>
    </div>
  );
}

// ── Free round preview module ─────────────────────────────────────────────────

function FreeRoundPreview() {
  const { matches, loading: matchesLoading } = useFreeRoundData();
  const [selectedGameIdx, setSelectedGameIdx] = useState(0);
  const [lens, setLens] = useState<StatLens>("disposals");
  const [players, setPlayers] = useState<StatBoardPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const selectedMatch = matches[selectedGameIdx] ?? null;

  const fetchPlayers = useCallback(async (matchId: number, l: StatLens) => {
    if (!supabase) return;
    setPlayersLoading(true);
    const threshold = l === "disposals" ? 20 : 1;
    const { data } = await supabase.rpc("get_stat_board_players", {
      p_season: 2026, p_round: null,
      p_match_id: matchId,
      p_lens: l, p_threshold: threshold,
      p_limit: 6, p_offset: 0,
    });
    const rows = (data as StatBoardPlayer[] | null) ?? [];
    setPlayers(rows.filter(p => p.projection != null).slice(0, 4));
    setPlayersLoading(false);
  }, []);

  useEffect(() => {
    if (selectedMatch) fetchPlayers(selectedMatch.match_id, lens);
  }, [selectedMatch, lens, fetchPlayers]);

  if (matchesLoading) {
    return (
      <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 58, borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(255,255,255,0.025)", animation: "shimmer 1.4s ease-in-out infinite" }} />
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", padding: "20px 16px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.30)" }}>Preview updates before each round. Check back closer to lockout.</p>
      </div>
    );
  }

  const roundLabel = matches[0]?.round ?? null;

  return (
    <div style={{ borderRadius: 13, border: "1px solid rgba(34,197,94,0.22)", overflow: "hidden", background: "rgba(5,8,11,0.97)" }}>

      {/* Module header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 14px",
        background: "rgba(34,197,94,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 900, color: "rgba(34,197,94,0.80)", letterSpacing: "0.18em", textTransform: "uppercase" }}>Free Round Preview</span>
        </div>
        {roundLabel && (
          <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{roundLabel}</span>
        )}
      </div>

      {/* Game selector */}
      {matches.length >= 2 && (
        <div style={{
          display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)", gap: 0,
        }}>
          {matches.map((m, idx) => (
            <button
              key={m.match_id}
              onClick={() => setSelectedGameIdx(idx)}
              style={{
                flex: 1, padding: "11px 12px",
                background: selectedGameIdx === idx ? "rgba(34,197,94,0.06)" : "none",
                border: "none", cursor: "pointer",
                borderBottom: selectedGameIdx === idx ? "2px solid #22c55e" : "2px solid transparent",
                color: selectedGameIdx === idx ? "#f0f0f0" : "rgba(255,255,255,0.42)",
                fontSize: 12, fontWeight: selectedGameIdx === idx ? 700 : 500,
                textAlign: "center", whiteSpace: "nowrap", overflow: "hidden",
                textOverflow: "ellipsis", minHeight: 44,
                transition: "color 0.12s, border-color 0.12s, background 0.12s",
              }}
            >
              {m.match_label}
            </button>
          ))}
        </div>
      )}

      {/* Stat toggle */}
      <div style={{
        display: "flex", gap: 6, padding: "8px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {(["disposals", "goals"] as StatLens[]).map(l => (
          <button
            key={l}
            onClick={() => setLens(l)}
            style={{
              padding: "5px 14px", borderRadius: 7,
              background: lens === l ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.04)",
              border: lens === l ? "1px solid rgba(34,197,94,0.32)" : "1px solid rgba(255,255,255,0.08)",
              color: lens === l ? "#4ade80" : "rgba(255,255,255,0.45)",
              fontSize: 11.5, fontWeight: 700, cursor: "pointer",
              transition: "all 0.12s", minHeight: 32,
              textTransform: "capitalize",
            }}
          >
            {l === "disposals" ? "Disposals" : "Goals"}
          </button>
        ))}
        {playersLoading && (
          <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(34,197,94,0.30)", borderTopColor: "#22c55e", animation: "spin 0.7s linear infinite" }} />
          </div>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "5px 14px", gap: 10,
        background: "rgba(255,255,255,0.015)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <span style={{ flex: 1, fontSize: 7.5, color: "rgba(255,255,255,0.20)", textTransform: "uppercase", letterSpacing: "0.09em" }}>Player · Profile</span>
        <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.20)", textTransform: "uppercase", letterSpacing: "0.09em", minWidth: 34, textAlign: "right" }}>Proj</span>
        <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.20)", textTransform: "uppercase", letterSpacing: "0.09em", minWidth: 36, textAlign: "right" }}>Hit</span>
        <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.20)", textTransform: "uppercase", letterSpacing: "0.09em", minWidth: 36, textAlign: "right" }}>Conf</span>
      </div>

      {/* Player rows */}
      {!playersLoading && players.length === 0 ? (
        <div style={{ padding: "18px 14px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.28)" }}>
            No data yet for this game. Check back closer to lockout.
          </p>
        </div>
      ) : (
        players.map(p => <PlayerPreviewRow key={p.player_id} player={p} />)
      )}

      {/* CTA */}
      <Link
        to="/stat-board/players"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "11px 14px",
          fontSize: 12.5, fontWeight: 700, color: "#4ade80",
          textDecoration: "none",
          background: "rgba(34,197,94,0.06)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        Open Free Game <ChevronRight size={11} />
      </Link>
    </div>
  );
}

// ── Match Outlook module ──────────────────────────────────────────────────────

interface MatchOutlookItem {
  matchLabel: string;
  tempoLabel: string | null;
}

function useMatchOutlook(): { matches: MatchOutlookItem[]; loading: boolean } {
  const [matches, setMatches] = useState<MatchOutlookItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase
      .rpc("get_stat_board_matches", { p_season: 2026, p_round: null })
      .then(({ data }) => {
        const rows = (data as Array<{
          match_id: number;
          match_label: string;
          is_free_match: boolean;
          scoring_environment_label?: string | null;
        }> | null) ?? [];

        const free = rows
          .filter(r => r.is_free_match)
          .slice(0, 2)
          .map(r => ({
            matchLabel: r.match_label,
            tempoLabel: r.scoring_environment_label ?? null,
          }));

        setMatches(free);
        setLoading(false);
      });
  }, []);

  return { matches, loading };
}

function TeamTotalOutlook() {
  const { matches, loading } = useMatchOutlook();

  return (
    <div style={{ borderRadius: 13, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", background: "rgba(5,8,11,0.97)" }}>
      {/* Header */}
      <div style={{
        padding: "9px 14px",
        background: "rgba(255,255,255,0.025)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 7,
      }}>
        <BarChart2Icon size={13} style={{ color: "rgba(255,255,255,0.40)", flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.55)", letterSpacing: "0.18em", textTransform: "uppercase" }}>Match Outlook</span>
      </div>

      {loading ? (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1].map(i => (
            <div key={i} style={{ height: 64, borderRadius: 8, background: "rgba(255,255,255,0.025)", animation: "shimmer 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div style={{ padding: "16px 14px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.28)" }}>Match data not yet available for this round.</p>
        </div>
      ) : (
        <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {matches.map((m, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.02)", borderRadius: 9,
              padding: "11px 13px", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              {/* Match name */}
              <p style={{
                margin: "0 0 7px", fontSize: 12.5, fontWeight: 700,
                color: "rgba(255,255,255,0.75)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {m.matchLabel}
              </p>

              {/* Meta row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 10, color: "rgba(255,255,255,0.34)",
                  letterSpacing: "0.02em",
                }}>
                  Stats available: Disposals · Goals
                </span>
                {m.tempoLabel && (
                  <span style={{
                    fontSize: 9, fontWeight: 600,
                    color: "rgba(96,165,250,0.70)",
                    background: "rgba(96,165,250,0.08)",
                    border: "1px solid rgba(96,165,250,0.15)",
                    borderRadius: 4, padding: "2px 7px",
                    whiteSpace: "nowrap",
                  }}>
                    {m.tempoLabel}
                  </span>
                )}
              </div>

              {/* Free preview badge */}
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", opacity: 0.85 }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(34,197,94,0.70)", letterSpacing: "0.02em" }}>
                  Free preview available
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Locked full round module ──────────────────────────────────────────────────

const LOCKED_PREVIEW_MAX = 4;

function LockedFullRound({ allMatches }: { allMatches: StatBoardMatch[] }) {
  const allLocked = allMatches.filter(m => !m.is_free_match);
  const lockedMatches = allLocked.slice(0, LOCKED_PREVIEW_MAX);
  const extraCount = allLocked.length - LOCKED_PREVIEW_MAX;

  return (
    <div style={{
      borderRadius: 14,
      border: "1px solid rgba(224,174,45,0.22)",
      overflow: "hidden",
      background: "rgba(5,8,11,0.98)",
      boxShadow: "0 0 0 1px rgba(224,174,45,0.06) inset, 0 8px 32px rgba(0,0,0,0.30)",
    }}>
      {/* Gold top accent bar */}
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent 0%, rgba(224,174,45,0.55) 40%, rgba(224,174,45,0.55) 60%, transparent 100%)" }} />

      {/* Header */}
      <div style={{
        padding: "14px 16px 12px",
        background: "linear-gradient(180deg, rgba(224,174,45,0.06) 0%, transparent 100%)",
        borderBottom: "1px solid rgba(224,174,45,0.10)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 7,
            background: "rgba(224,174,45,0.12)",
            border: "1px solid rgba(224,174,45,0.24)",
            flexShrink: 0,
          }}>
            <Lock size={12} style={{ color: "rgba(224,174,45,0.90)" }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 900, color: "rgba(224,174,45,0.92)", letterSpacing: "-0.01em" }}>
            Unlock Every Match
          </span>
          <span style={{
            marginLeft: "auto",
            fontSize: 8, fontWeight: 800, color: "rgba(224,174,45,0.60)",
            letterSpacing: "0.14em", textTransform: "uppercase",
            background: "rgba(224,174,45,0.10)", border: "1px solid rgba(224,174,45,0.18)",
            borderRadius: 4, padding: "2px 6px",
          }}>
            Neeko+
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.5 }}>
          Free users get two match previews. Neeko+ unlocks the full round.
        </p>
      </div>

      {/* Locked match cards */}
      {lockedMatches.length > 0 && (
        <div style={{ padding: "12px 14px 0", display: "flex", flexDirection: "column", gap: 7 }}>
          {lockedMatches.map(m => (
            <div key={m.match_id} style={{
              display: "flex", alignItems: "center",
              background: "rgba(224,174,45,0.03)",
              borderRadius: 9,
              padding: "10px 12px",
              border: "1px solid rgba(224,174,45,0.12)",
              gap: 10,
            }}>
              {/* Lock badge */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8,
                background: "rgba(224,174,45,0.08)",
                border: "1px solid rgba(224,174,45,0.18)",
                flexShrink: 0,
              }}>
                <Lock size={12} style={{ color: "rgba(224,174,45,0.65)" }} />
              </div>
              {/* Match info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 12.5, fontWeight: 700,
                  color: "rgba(255,255,255,0.52)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {m.match_label}
                </p>
                <p style={{ margin: "3px 0 0", fontSize: 9.5, color: "rgba(224,174,45,0.40)", letterSpacing: "0.02em" }}>
                  Disposals · Goals · Match outlooks
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Extra matches pill */}
      {extraCount > 0 && (
        <div style={{ padding: "10px 14px 0", display: "flex", justifyContent: "center" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 700, color: "rgba(224,174,45,0.60)",
            background: "rgba(224,174,45,0.07)",
            border: "1px solid rgba(224,174,45,0.14)",
            borderRadius: 20, padding: "5px 12px",
          }}>
            <Lock size={9} style={{ color: "rgba(224,174,45,0.50)" }} />
            +{extraCount} more match{extraCount > 1 ? "es" : ""} unlocked with Neeko+
          </span>
        </div>
      )}

      {/* CTA */}
      <div style={{ padding: "14px 14px 16px" }}>
        <Link to="/neeko-plus" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "14px 20px", borderRadius: 11, minHeight: 50,
          background: "linear-gradient(155deg, #fad52a 0%, #e09600 100%)",
          color: "#130c00", fontSize: 14, fontWeight: 900,
          textDecoration: "none", letterSpacing: "0.01em",
          boxShadow: "0 4px 22px rgba(224,174,45,0.28), 0 1px 0 rgba(255,255,255,0.18) inset",
        }}>
          Unlock Full Round <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

// ── Fantasy Hub teaser ────────────────────────────────────────────────────────

function FantasyHubTeaser() {
  return (
    <div style={{ borderRadius: 13, border: "1px solid rgba(244,197,66,0.14)", overflow: "hidden", background: "rgba(5,8,11,0.97)" }}>
      <div style={{
        padding: "9px 14px",
        background: "rgba(244,197,66,0.04)",
        borderBottom: "1px solid rgba(244,197,66,0.10)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Star size={12} style={{ color: "rgba(244,197,66,0.70)", flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 900, color: "rgba(244,197,66,0.72)", letterSpacing: "0.18em", textTransform: "uppercase" }}>Fantasy Hub</span>
        </div>
        <Link to="/fantasy" style={{
          display: "flex", alignItems: "center", gap: 4,
          fontSize: 11, fontWeight: 700, color: "rgba(244,197,66,0.70)",
          textDecoration: "none", letterSpacing: "0.03em",
        }}>
          View all <ChevronRight size={10} />
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, padding: "10px 12px 12px" }}>
        {[
          { label: "Top Target",   icon: <TrendingUp size={11} />,    color: "#22c55e", desc: "Best value plays." },
          { label: "Trap Alert",   icon: <AlertTriangle size={11} />, color: "#f87171", desc: "Avoid these players." },
          { label: "Captain Pick", icon: <Star size={11} />,          color: "#E0AE2D", desc: "Top scoring projection." },
          { label: "Value Watch",  icon: <Zap size={11} />,           color: "#60a5fa", desc: "Priced below output." },
        ].map(({ label, icon, color, desc }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.025)", border: `1px solid ${color}18`,
            borderRadius: 10, padding: "10px 10px",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.40 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
              <span style={{ color, opacity: 0.80 }}>{icon}</span>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color }}>{label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.38)", lineHeight: 1.4 }}>{desc}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: "0 12px 12px" }}>
        <Link to="/fantasy" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "10px 14px", borderRadius: 10, minHeight: 40,
          background: "rgba(244,197,66,0.07)",
          border: "1px solid rgba(244,197,66,0.16)",
          color: "rgba(244,197,66,0.80)", fontSize: 12.5, fontWeight: 700,
          textDecoration: "none",
        }}>
          Open Fantasy Hub <ChevronRight size={11} />
        </Link>
      </div>
    </div>
  );
}

// ── Explore product tiles ─────────────────────────────────────────────────────

const PRODUCT_TILES = [
  { label: "Stats Hub",    to: "/stat-board/players", icon: BarChart2Icon, desc: "Disposals, goals and team outlooks.", color: "#22c55e" },
  { label: "Fantasy",      to: "/fantasy",            icon: Star,           desc: "Targets, traps, captains and value picks.", color: "#E0AE2D" },
  { label: "Players",      to: "/sports/afl/players", icon: Users,          desc: "Player profiles, projections and history.", color: "#60a5fa" },
  { label: "Teams",        to: "/sports/afl/teams",   icon: Shield,         desc: "Team pages, fixtures and matchup context.", color: "#f87171" },
] as const;

function ExploreProductTiles() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {PRODUCT_TILES.map(({ label, to, icon: Icon, desc, color }) => (
        <Link
          key={to} to={to}
          style={{
            display: "block", textDecoration: "none",
            background: "rgba(255,255,255,0.025)",
            border: `1px solid ${color}18`,
            borderRadius: 12, padding: "13px 13px",
            position: "relative", overflow: "hidden",
            transition: "background 0.12s",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.45 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: `${color}14`, border: `1px solid ${color}24`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color, flexShrink: 0,
            }}>
              <Icon size={14} />
            </div>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#E4E4E4" }}>{label}</span>
          </div>
          <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.36)", lineHeight: 1.45 }}>{desc}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 7 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color }}>Open</span>
            <ChevronRight size={10} style={{ color }} />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── Pricing block ─────────────────────────────────────────────────────────────

function PricingBlock() {
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.35em", textTransform: "uppercase", color: "rgba(224,174,45,0.55)", marginBottom: 5 }}>Pricing</p>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 900, letterSpacing: "-0.022em", color: "#F0F0F0", lineHeight: 1.2, margin: "0 0 4px" }}>
          Unlock Neeko+
        </h2>
        <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.38)", margin: 0 }}>Get the full round before lockout.</p>
      </div>

      {/* Free vs Neeko+ comparison */}
      <div className="pricing-compare" style={{
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12, overflow: "hidden", marginBottom: 12,
      }}>
        <div className="pricing-col pricing-col-free" style={{ padding: "13px 15px", background: "rgba(255,255,255,0.015)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Free</p>
          {[
            "Two match previews",
            "Limited player signals",
            "Sample stat board access",
          ].map(item => (
            <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 5 }}>
              <Check size={9} style={{ color: "#4ade80", flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.46)", lineHeight: 1.4 }}>{item}</span>
            </div>
          ))}
        </div>
        <div className="pricing-col pricing-col-premium" style={{ padding: "13px 15px", background: "rgba(224,174,45,0.03)" }}>
          <p style={{ margin: "0 0 8px", fontSize: 9.5, fontWeight: 800, color: "#E0AE2D", letterSpacing: "0.10em", textTransform: "uppercase" }}>Neeko+</p>
          {[
            "Every match",
            "Full disposal board",
            "Full goal board",
            "Team total outlooks",
            "Fantasy Hub",
            "Player and team profiles",
          ].map(item => (
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
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
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
            <span style={{ fontSize: 34, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.04em", lineHeight: 1 }}>${NEEKO_PRICING.season.price}</span>
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)" }}>AUD · one-time</span>
          </div>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.32)" }}>Season Pass · full 2026 season.</p>
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
          Unlock Neeko+ <ArrowRight size={13} />
        </Link>
        <Link to="/stat-board/players" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "10px 16px", marginTop: 8,
          fontSize: 11.5, color: "rgba(255,255,255,0.30)", fontWeight: 500,
          textDecoration: "none", textAlign: "center",
        }}>
          Keep using free preview
        </Link>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MobileLanding({ isPremium }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, loading: authLoading, signOut } = useAuth();

  // Fetch all matches once for LockedFullRound
  const [allMatches, setAllMatches] = useState<StatBoardMatch[]>([]);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .rpc("get_stat_board_matches", { p_season: 2026, p_round: null })
      .then(({ data }) => setAllMatches((data as StatBoardMatch[] | null) ?? []));
  }, []);

  const roundLabel = allMatches[0]?.round ?? null;

  return (
    <div style={{ background: "#07090d", minHeight: "100dvh" }}>

      <LeftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        isPremium={isPremium}
        user={user}
        authLoading={authLoading}
        signOut={signOut}
      />

      {/* Sticky header + nav wrapper — mobile only */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(7,10,14,0.96)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(255,255,255,0.09)",
      }}>
        <MobileHeader onMenuOpen={() => setDrawerOpen(true)} isPremium={isPremium} />
        <ProductNav />
      </div>

      {/* ─── HERO ─── */}
      <section style={{
        position: "relative",
        padding: "32px 16px 36px",
        overflow: "hidden",
        backgroundImage: `
          linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(5,8,12,0.48) 55%, rgba(7,9,13,0.92) 100%),
          url('/images/Fantasy_sports_war_room_setup.png')
        `,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundRepeat: "no-repeat",
      }}>

        <div style={{ position: "relative", zIndex: 2 }}>
          {roundLabel && (
            <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.65)", marginBottom: 6, textAlign: "center" }}>
              AFL · {roundLabel}
            </p>
          )}

          <h1 style={{
            fontSize: "clamp(1.5rem, 7.5vw, 1.95rem)",
            fontWeight: 900, lineHeight: 1.10, letterSpacing: "-0.030em",
            color: "#ffffff", marginBottom: 8, textAlign: "center",
          }}>
            Find AFL players most likely to{" "}
            <span style={{ color: "#22c55e" }}>hit key stats</span>{" "}
            this round.
          </h1>

          <p style={{
            fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.5,
            textAlign: "center", marginBottom: 16,
            maxWidth: 290, marginLeft: "auto", marginRight: "auto",
          }}>
            Pick a match, choose a stat, and instantly see projections, form and hit rates.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <Link to="/stat-board/players" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(160deg, #22c55e 0%, #16a34a 100%)",
              color: "#f0fff4", fontWeight: 900, fontSize: 15,
              padding: "14px 20px", borderRadius: 11, textDecoration: "none",
              boxShadow: "0 4px 18px rgba(34,197,94,0.32)", minHeight: 50,
              letterSpacing: "0.01em",
            }}>
              Open Stats Hub Free <ArrowRight size={15} />
            </Link>
            <Link to="/neeko-plus" style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.65)", fontWeight: 600, fontSize: 13,
              padding: "10px 20px", borderRadius: 11, textDecoration: "none", minHeight: 40,
            }}>
              Unlock Full Round <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FREE ROUND PREVIEW ─── */}
      <section style={{ padding: "32px 14px 0" }}>
        <FreeRoundPreview />
      </section>

      {/* ─── MATCH OUTLOOK ─── */}
      <section style={{ padding: "36px 14px 0" }}>
        <TeamTotalOutlook />
      </section>

      {/* ─── LOCKED FULL ROUND ─── */}
      {allMatches.some(m => !m.is_free_match) && (
        <section style={{ padding: "36px 14px 0" }}>
          <LockedFullRound allMatches={allMatches} />
        </section>
      )}

      {/* ─── FANTASY HUB ─── */}
      <section style={{ padding: "40px 14px 0" }}>
        <FantasyHubTeaser />
      </section>

      {/* ─── EXPLORE PRODUCT TILES ─── */}
      <section style={{ padding: "40px 14px 0" }}>
        <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.35em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 14, textAlign: "center" }}>
          Explore Neeko
        </p>
        <ExploreProductTiles />
      </section>

      {/* ─── PRICING ─── */}
      <section style={{ padding: "40px 14px 0" }}>
        <PricingBlock />
      </section>

      {/* ─── FOOTER ─── */}
      <section style={{
        padding: `32px 14px max(40px, calc(28px + env(safe-area-inset-bottom, 0px)))`,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        marginTop: 32,
      }}>
        <p style={{ textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.22)", lineHeight: 1.5, margin: 0 }}>
          Free to start. Upgrade any time.
        </p>
      </section>

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.28; } }
        .live-dot { animation: livePulse 1.8s ease-in-out infinite; }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Pricing comparison: stacked on <390px, side-by-side on wider */
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
