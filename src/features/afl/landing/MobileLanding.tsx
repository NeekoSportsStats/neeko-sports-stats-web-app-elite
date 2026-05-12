import { Link } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { ArrowRight, ChevronRight, ChartBar as BarChart2Icon, Target, Zap, Check, Menu, X, Crown, TrendingUp, TriangleAlert as AlertTriangle, Star, TableProperties, Shield, Users, CircleHelp as HelpCircle, FileText, Mail, LogIn, User, LogOut, Lock, Clock as UnlockIcon } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardPlayer, StatBoardMatch, StatLens } from "@/features/afl/stat-board/types";
import { NEEKO_PRICING } from "@/config/neekoPricing";
import { useAuth } from "@/lib/auth";
import { mapRankingRow } from "@/features/afl/rankings/components/mapRankingRow";
import type { RankingRow } from "@/features/afl/rankings/components/types";
import { getCaptainScore, isCaptainEligible } from "@/features/afl/shared/data/captainScoring";

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
          padding: "4px 12px 4px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0,
        }}>
            <Link to="/" onClick={onClose} style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <img src="/logo.png" alt="Neeko Sports Stats" style={{ width: 84, height: "auto", objectFit: "contain", display: "block" }} />
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

      {/* Brand — centred with slight right bias to account for burger width vs Neeko+ width */}
      <Link to="/" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", flex: 1, minWidth: 0, paddingLeft: 8 }}>
        <img src="/logo.png" alt="Neeko Sports Stats" style={{ width: 100, maxWidth: "100%", height: "auto", objectFit: "contain", display: "block" }} />
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
      borderTop: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center",
      padding: "0 4px",
    }}>
      {PRODUCT_NAV.map(({ label, to, icon: Icon }) => (
        <Link
          key={to} to={to}
          style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            height: 40,
            fontSize: 12, fontWeight: 600,
            color: "rgba(255,255,255,0.58)",
            textDecoration: "none", whiteSpace: "nowrap",
            borderRadius: 6, transition: "color 0.12s, background 0.12s",
            minWidth: 0,
          }}
        >
          <Icon size={13} style={{ flexShrink: 0, opacity: 0.65 }} />
          {label}
        </Link>
      ))}
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

// ── Short match label helper ─────────────────────────────────────────────────

const TEAM_ABBREVS: Record<string, string> = {
  "Adelaide Crows": "ADE", "Adelaide": "ADE",
  "Brisbane Lions": "BRI", "Brisbane": "BRI",
  "Carlton": "CAR",
  "Collingwood": "COL",
  "Essendon": "ESS",
  "Fremantle": "FRE",
  "Geelong Cats": "GEE", "Geelong": "GEE",
  "Gold Coast Suns": "GCS", "Gold Coast": "GCS",
  "GWS Giants": "GWS", "Greater Western Sydney": "GWS",
  "Hawthorn": "HAW",
  "Melbourne": "MEL",
  "North Melbourne": "NME",
  "Port Adelaide": "PTA",
  "Richmond": "RIC",
  "St Kilda": "STK",
  "Sydney Swans": "SYD", "Sydney": "SYD",
  "West Coast Eagles": "WCE", "West Coast": "WCE",
  "Western Bulldogs": "WBD", "Footscray": "WBD",
};

function toShortMatchLabel(label: string): string {
  // Handles "Team A v Team B" or "Team A vs Team B"
  const sep = label.includes(" vs ") ? " vs " : " v ";
  const parts = label.split(sep);
  if (parts.length !== 2) return label;
  const a = TEAM_ABBREVS[parts[0].trim()] ?? parts[0].trim().slice(0, 3).toUpperCase();
  const b = TEAM_ABBREVS[parts[1].trim()] ?? parts[1].trim().slice(0, 3).toUpperCase();
  return `${a} v ${b}`;
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
      padding: "13px 14px", gap: 10,
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

  const weekNum = matches[0]?.week ?? null;

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
        {weekNum != null && (
          <span style={{ fontSize: 8.5, color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Week {weekNum}</span>
        )}
      </div>

      {/* Game selector */}
      {matches.length >= 2 && (
        <>
          <div style={{
            display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.02)", gap: 0,
          }}>
            {matches.map((m, idx) => (
              <button
                key={m.match_id}
                onClick={() => setSelectedGameIdx(idx)}
                style={{
                  flex: 1, padding: "10px 8px",
                  background: selectedGameIdx === idx ? "rgba(34,197,94,0.06)" : "none",
                  border: "none", cursor: "pointer",
                  borderBottom: selectedGameIdx === idx ? "2px solid #22c55e" : "2px solid transparent",
                  color: selectedGameIdx === idx ? "#f0f0f0" : "rgba(255,255,255,0.42)",
                  fontSize: 13, fontWeight: selectedGameIdx === idx ? 800 : 500,
                  textAlign: "center", whiteSpace: "nowrap",
                  minHeight: 44, letterSpacing: "0.04em",
                  transition: "color 0.12s, border-color 0.12s, background 0.12s",
                }}
              >
                {toShortMatchLabel(m.match_label)}
              </button>
            ))}
          </div>
          {/* Full selected match name */}
          {selectedMatch && (
            <div style={{
              padding: "9px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(34,197,94,0.03)",
            }}>
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: "rgba(255,255,255,0.62)",
                letterSpacing: "0.01em",
              }}>
                {selectedMatch.match_label}
              </span>
            </div>
          )}
        </>
      )}

      {/* Stat toggle */}
      <div style={{
        display: "flex", gap: 6, padding: "10px 14px",
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
        padding: "7px 14px", gap: 10,
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

// ── Free Game Access module ───────────────────────────────────────────────────

interface FreeGameItem {
  matchId: number;
  matchLabel: string;
}

function useFreeGames(): { games: FreeGameItem[]; loading: boolean } {
  const [games, setGames] = useState<FreeGameItem[]>([]);
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
        }> | null) ?? [];

        setGames(
          rows.filter(r => r.is_free_match).slice(0, 2).map(r => ({
            matchId: r.match_id,
            matchLabel: r.match_label,
          }))
        );
        setLoading(false);
      });
  }, []);

  return { games, loading };
}

function TeamTotalOutlook() {
  const { games, loading } = useFreeGames();

  return (
    <div style={{ borderRadius: 13, border: "1px solid rgba(34,197,94,0.18)", overflow: "hidden", background: "rgba(5,8,11,0.97)" }}>

      {/* Header */}
      <div style={{
        padding: "9px 14px",
        background: "rgba(34,197,94,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <UnlockIcon size={12} style={{ color: "rgba(34,197,94,0.70)", flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 900, color: "rgba(34,197,94,0.75)", letterSpacing: "0.18em", textTransform: "uppercase" }}>Free Game Access</span>
        </div>
        <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(34,197,94,0.55)", letterSpacing: "0.08em", textTransform: "uppercase" }}>2 games this week</span>
      </div>

      {loading ? (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {[0, 1].map(i => (
            <div key={i} style={{ height: 68, borderRadius: 9, background: "rgba(255,255,255,0.025)", animation: "shimmer 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div style={{ padding: "16px 14px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11.5, color: "rgba(255,255,255,0.28)" }}>Free games available closer to lockout.</p>
        </div>
      ) : (
        <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {games.map(g => (
            <Link
              key={g.matchId}
              to="/stat-board/players"
              style={{ textDecoration: "none", display: "block" }}
            >
              <div style={{
                background: "rgba(255,255,255,0.025)",
                borderRadius: 10,
                border: "1px solid rgba(34,197,94,0.14)",
                padding: "12px 13px",
                display: "flex", flexDirection: "column", gap: 8,
                transition: "border-color 0.12s, background 0.12s",
              }}>

                {/* Top row: match name + FREE PREVIEW badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 700,
                    color: "#f0f0f0",
                    lineHeight: 1.3, flex: 1, minWidth: 0,
                  }}>
                    {g.matchLabel}
                  </p>
                  <span style={{
                    flexShrink: 0,
                    fontSize: 8, fontWeight: 800,
                    color: "#4ade80",
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.28)",
                    borderRadius: 4,
                    padding: "3px 7px",
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}>
                    Free Preview
                  </span>
                </div>

                {/* Stats available */}
                <p style={{
                  margin: 0, fontSize: 10.5,
                  color: "rgba(255,255,255,0.40)",
                  letterSpacing: "0.01em",
                }}>
                  Stats available: <span style={{ color: "rgba(255,255,255,0.58)", fontWeight: 600 }}>Disposals · Goals</span>
                </p>

                {/* CTA row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: "#4ade80",
                    letterSpacing: "0.02em",
                  }}>
                    View Free Game
                  </span>
                  <ChevronRight size={13} style={{ color: "#4ade80", opacity: 0.75 }} />
                </div>

              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Locked full round module ──────────────────────────────────────────────────

const LOCKED_PREVIEW_MAX = 3;

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
        padding: "12px 14px 10px",
        background: "linear-gradient(180deg, rgba(224,174,45,0.06) 0%, transparent 100%)",
        borderBottom: "1px solid rgba(224,174,45,0.10)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 7,
            background: "rgba(224,174,45,0.12)",
            border: "1px solid rgba(224,174,45,0.24)",
            flexShrink: 0,
          }}>
            <Lock size={11} style={{ color: "rgba(224,174,45,0.90)" }} />
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
      </div>

      {/* Locked match cards */}
      {lockedMatches.length > 0 && (
        <div style={{ padding: "10px 13px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {lockedMatches.map(m => (
            <div key={m.match_id} style={{
              display: "flex", alignItems: "center",
              background: "rgba(224,174,45,0.03)",
              borderRadius: 9,
              padding: "8px 11px",
              border: "1px solid rgba(224,174,45,0.12)",
              gap: 9,
            }}>
              {/* Lock badge */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, borderRadius: 7,
                background: "rgba(224,174,45,0.08)",
                border: "1px solid rgba(224,174,45,0.18)",
                flexShrink: 0,
              }}>
                <Lock size={11} style={{ color: "rgba(224,174,45,0.65)" }} />
              </div>
              {/* Match info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 12, fontWeight: 700,
                  color: "rgba(255,255,255,0.52)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {m.match_label}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 9, color: "rgba(224,174,45,0.38)", letterSpacing: "0.02em" }}>
                  Disposals · Goals · Full stats
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Extra matches pill */}
      {extraCount > 0 && (
        <div style={{ padding: "8px 13px 0", display: "flex", justifyContent: "center" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 700, color: "rgba(224,174,45,0.58)",
            background: "rgba(224,174,45,0.07)",
            border: "1px solid rgba(224,174,45,0.14)",
            borderRadius: 20, padding: "4px 11px",
          }}>
            <Lock size={9} style={{ color: "rgba(224,174,45,0.50)" }} />
            +{extraCount} more match{extraCount > 1 ? "es" : ""} with Neeko+
          </span>
        </div>
      )}

      {/* CTA */}
      <div style={{ padding: "12px 13px 14px" }}>
        <Link to="/neeko-plus" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "13px 20px", borderRadius: 11, minHeight: 48,
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

interface FantasySlot {
  label: string;
  icon: React.ReactNode;
  color: string;
  playerName: string | null;
  team: string | null;
  projection: number | null;
}

function useFantasyHubPlayers(): { slots: FantasySlot[]; loading: boolean } {
  const [slots, setSlots] = useState<FantasySlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase
      .rpc("get_rankings_safe", { p_user_id: null, p_is_bot: false, p_limit: 200 })
      .then(({ data }) => {
        const players: RankingRow[] = ((data as Record<string, unknown>[] | null) ?? []).map(mapRankingRow);
        const active = players.filter(p => p.projection != null && !p.is_injured && !p.is_bye);
        const byProj = [...active].sort((a, b) => (b.projection ?? 0) - (a.projection ?? 0));

        const target =
          active.filter(p => ["SMASH_START", "START"].includes((p.action_canonical ?? "").toUpperCase()))
            .sort((a, b) => ((b.decision_score ?? 0) - (a.decision_score ?? 0)))[0]
          ?? byProj[0] ?? null;

        const trap =
          active.filter(p => ["HARD_SIT", "SIT"].includes((p.action_canonical ?? "").toUpperCase()))
            .filter(p => p.player_id !== target?.player_id)
            .sort((a, b) => (a.projection ?? 0) - (b.projection ?? 0))[0]
          ?? byProj[byProj.length - 1] ?? null;

        const usedIds = new Set([target?.player_id, trap?.player_id].filter(Boolean));
        const captain =
          active.filter(p => !usedIds.has(p.player_id) && isCaptainEligible(p))
            .sort((a, b) => (b.captain_score ?? getCaptainScore(b)) - (a.captain_score ?? getCaptainScore(a)))[0]
          ?? byProj.find(p => !usedIds.has(p.player_id)) ?? null;

        const usedIds2 = new Set([...usedIds, captain?.player_id].filter(Boolean));
        const value =
          active.filter(p => !usedIds2.has(p.player_id) && (p.category_canonical ?? "").toUpperCase() === "TARGET")
            .sort((a, b) => ((b.decision_score ?? 0) - (a.decision_score ?? 0)))[0]
          ?? byProj.find(p => !usedIds2.has(p.player_id)) ?? null;

        setSlots([
          { label: "Top Target",   icon: <TrendingUp size={11} />,    color: "#22c55e", playerName: target?.player_name ?? null,  team: target?.team ?? null,  projection: target?.projection ?? null },
          { label: "Trap Alert",   icon: <AlertTriangle size={11} />, color: "#f87171", playerName: trap?.player_name ?? null,    team: trap?.team ?? null,    projection: trap?.projection ?? null },
          { label: "Captain Pick", icon: <Star size={11} />,          color: "#E0AE2D", playerName: captain?.player_name ?? null, team: captain?.team ?? null, projection: captain?.projection ?? null },
          { label: "Value Watch",  icon: <Zap size={11} />,           color: "#60a5fa", playerName: value?.player_name ?? null,   team: value?.team ?? null,   projection: value?.projection ?? null },
        ]);
        setLoading(false);
      });
  }, []);

  return { slots, loading };
}

function FantasyHubTeaser() {
  const { slots, loading } = useFantasyHubPlayers();
  const hasData = !loading && slots.some(s => s.playerName);

  return (
    <div style={{ borderRadius: 13, border: "1px solid rgba(244,197,66,0.14)", overflow: "hidden", background: "rgba(5,8,11,0.97)" }}>

      {/* Header */}
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
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.30)", fontStyle: "italic" }}>This week's intel</span>
      </div>

      {/* Tiles grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, padding: "10px 12px 10px" }}>
        {(hasData ? slots : [
          { label: "Top Target",   icon: <TrendingUp size={11} />,    color: "#22c55e", playerName: null, team: null, projection: null },
          { label: "Trap Alert",   icon: <AlertTriangle size={11} />, color: "#f87171", playerName: null, team: null, projection: null },
          { label: "Captain Pick", icon: <Star size={11} />,          color: "#E0AE2D", playerName: null, team: null, projection: null },
          { label: "Value Watch",  icon: <Zap size={11} />,           color: "#60a5fa", playerName: null, team: null, projection: null },
        ]).map(({ label, icon, color, playerName, team, projection }) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.025)", border: `1px solid ${color}22`,
            borderRadius: 10, padding: "10px 10px",
            position: "relative", overflow: "hidden",
          }}>
            {/* top accent line */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.38 }} />

            {/* label row */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
              <span style={{ color, opacity: 0.80 }}>{icon}</span>
              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color }}>{label}</span>
            </div>

            {loading ? (
              <>
                <div style={{ height: 12, width: "75%", borderRadius: 3, background: "rgba(255,255,255,0.07)", marginBottom: 4, animation: "shimmer 1.4s ease-in-out infinite" }} />
                <div style={{ height: 10, width: "45%", borderRadius: 3, background: "rgba(255,255,255,0.04)", animation: "shimmer 1.4s ease-in-out infinite" }} />
              </>
            ) : playerName ? (
              <>
                <p style={{
                  margin: "0 0 2px", fontSize: 12, fontWeight: 700,
                  color: "#f0f0f0",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {playerName}
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {team && (
                    <span style={{ fontSize: 9.5, color: "rgba(255,255,255,0.38)", fontWeight: 500 }}>{team}</span>
                  )}
                  {projection != null && (
                    <span style={{ fontSize: 9.5, fontWeight: 700, color, opacity: 0.85 }}>
                      {Math.round(projection)} proj
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 10, color: "rgba(255,255,255,0.32)", lineHeight: 1.4 }}>
                {label === "Top Target"   ? "Best value plays this week."        :
                 label === "Trap Alert"   ? "Players to avoid this round."       :
                 label === "Captain Pick" ? "Highest scoring projection."        :
                                           "Priced below their output."}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding: "0 12px 12px" }}>
        <Link to="/fantasy" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "10px 14px", borderRadius: 10, minHeight: 40,
          background: "rgba(244,197,66,0.07)",
          border: "1px solid rgba(244,197,66,0.18)",
          color: "rgba(244,197,66,0.85)", fontSize: 12.5, fontWeight: 700,
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

        {/* Primary — season */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 1 }}>
            <span style={{ fontSize: 34, fontWeight: 900, color: "#E0AE2D", letterSpacing: "-0.04em", lineHeight: 1 }}>${NEEKO_PRICING.season.price}</span>
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)" }}>AUD · one-time</span>
          </div>
          <p style={{ margin: 0, fontSize: 10.5, color: "rgba(255,255,255,0.38)" }}>Full season · best value</p>
        </div>

        {/* Secondary — weekly */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 8, padding: "8px 12px",
          marginBottom: 13,
        }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.65)", letterSpacing: "-0.02em" }}>
              ${NEEKO_PRICING.weekly.price}
            </span>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>/week</span>
          </div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontStyle: "italic" }}>
            Weekly · flexible option
          </span>
        </div>

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

      {/* Fixed header + nav wrapper — mobile only */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(7,10,14,0.88)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid rgba(255,255,255,0.13)",
        boxShadow: "0 1px 0 0 rgba(255,255,255,0.04), 0 4px 24px 0 rgba(0,0,0,0.55)",
      }}>
        <MobileHeader onMenuOpen={() => setDrawerOpen(true)} isPremium={isPremium} />
        <ProductNav />
      </div>

      {/* ─── HERO ─── */}
      {/* paddingTop offsets the fixed header: 62px MobileHeader + 40px ProductNav = 102px */}
      {/* paddingBottom extends the image area below the content without adding blank space —
          the content sits naturally, the image layer fills the extra height underneath */}
      <section style={{
        position: "relative",
        paddingTop: "calc(102px + 28px)",
        paddingBottom: 36,
        backgroundImage: `url('/images/Fantasy_sports_war_room_setup.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center 78%",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "scroll",
      }}>

        {/* Overlay — stays transparent through the CTA area, fades only at the very bottom */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(5,8,12,0.38) 40%, rgba(7,9,13,0.55) 68%, rgba(7,9,13,0.82) 84%, rgba(7,9,13,0.97) 94%, #07090d 100%)",
        }} />

        <div style={{ position: "relative", zIndex: 2, padding: "0 16px" }}>
          {roundLabel && (
            <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.38em", textTransform: "uppercase", color: "rgba(34,197,94,0.65)", marginBottom: 10, textAlign: "center" }}>
              AFL · {roundLabel}
            </p>
          )}

          <h1 style={{
            fontSize: "clamp(1.4rem, 7vw, 1.82rem)",
            fontWeight: 900, lineHeight: 1.16, letterSpacing: "-0.028em",
            color: "#ffffff", marginBottom: 12, textAlign: "center",
          }}>
            Find AFL players most likely to{" "}
            <span style={{ color: "#22c55e" }}>hit key stats</span>{" "}
            this round.
          </h1>

          <p style={{
            fontSize: 13.5, color: "rgba(255,255,255,0.60)", lineHeight: 1.55,
            textAlign: "center", marginBottom: 22,
            maxWidth: 310, marginLeft: "auto", marginRight: "auto",
          }}>
            Pick a match, choose a stat, and instantly see projections, form and hit rates.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
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
      <section style={{ padding: "36px 14px 0" }}>
        <FreeRoundPreview />
      </section>

      {/* ─── FREE GAME ACCESS ─── */}
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
      <section style={{ padding: "36px 14px 0" }}>
        <FantasyHubTeaser />
      </section>

      {/* ─── EXPLORE PRODUCT TILES ─── */}
      <section style={{ padding: "36px 14px 0" }}>
        <p style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.35em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 14, textAlign: "center" }}>
          Explore Neeko
        </p>
        <ExploreProductTiles />
      </section>

      {/* ─── PRICING ─── */}
      <section style={{ padding: "36px 14px 0" }}>
        <PricingBlock />
      </section>

      {/* ─── FOOTER ─── */}
      <section style={{
        padding: `36px 14px max(36px, calc(24px + env(safe-area-inset-bottom, 0px)))`,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        marginTop: 36,
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
