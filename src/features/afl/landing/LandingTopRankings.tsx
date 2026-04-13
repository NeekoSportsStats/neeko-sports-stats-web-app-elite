import { Link } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import type { RankingRow } from "@/features/afl/rankings/components/types";

interface Props {
  loading: boolean;
  rows: RankingRow[];
  freePreview: number;
}

function signalFromRow(row: RankingRow): { label: string; color: string; bg: string } {
  const raw = (row.signal_tag ?? row.action ?? row.signal ?? "").toUpperCase();
  if (raw === "STRONG_START" || raw === "START" || raw === "UP" || raw === "STRONG_UP") {
    return { label: "BUY", color: "#22C55E", bg: "rgba(34,197,94,0.10)" };
  }
  if (raw === "STRONG_SIT" || raw === "SIT" || raw === "DOWN" || raw === "STRONG_DOWN") {
    return { label: "AVOID", color: "#EF4444", bg: "rgba(239,68,68,0.10)" };
  }
  return { label: "HOLD", color: "#E0AE2D", bg: "rgba(224,174,45,0.10)" };
}

const CLEAR_ROWS = 3;
const BLUR_ROWS = 3;

export default function LandingTopRankings({ loading, rows, freePreview }: Props) {
  const displayRows = rows.slice(0, CLEAR_ROWS + BLUR_ROWS);
  const totalCount = rows[0]?.total_count ?? rows.length;

  return (
    <section style={{ background: "#0a0908", padding: "96px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 14 }}>Live Data</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, marginBottom: 14 }}>
            Full Weekly Rankings — Updated Before Lockout
          </h2>
          <p style={{ fontSize: 14, color: "#606060", maxWidth: 440, margin: "0 auto", lineHeight: 1.65 }}>
            See every ranked player — not just the highlights.
          </p>
        </div>

        <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 16, border: "1px solid rgba(224,174,45,0.12)", overflow: "hidden", boxShadow: "0 24px 72px rgba(0,0,0,0.55)" }}>
          {/* Table header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(224,174,45,0.03)" }}>
            <span style={{ width: 28, fontSize: 9, fontWeight: 800, color: "#3A3A3A", textAlign: "right", flexShrink: 0, letterSpacing: "0.10em", textTransform: "uppercase" }}>#</span>
            <span style={{ flex: 1, fontSize: 9, fontWeight: 800, color: "#3A3A3A", letterSpacing: "0.10em", textTransform: "uppercase" }}>Player</span>
            <span style={{ width: 80, fontSize: 9, fontWeight: 800, color: "#3A3A3A", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "center" }}>Action</span>
            <span style={{ width: 52, fontSize: 9, fontWeight: 800, color: "#3A3A3A", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Proj</span>
            <span style={{ width: 20, flexShrink: 0 }} />
          </div>

          <div style={{ padding: "0 24px" }}>
            {loading ? (
              Array.from({ length: CLEAR_ROWS + BLUR_ROWS }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: i >= CLEAR_ROWS ? 0.45 : 1 }}>
                  <div style={{ width: 28, height: 12, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "50%", marginBottom: 5 }} />
                    <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "30%" }} />
                  </div>
                  <div style={{ width: 52, height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 12 }} />
                  <div style={{ width: 40, height: 13, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                  <div style={{ width: 20, flexShrink: 0 }} />
                </div>
              ))
            ) : rows.length === 0 ? (
              <p style={{ padding: "36px 0", textAlign: "center", color: "#3A3A3A", fontSize: 13 }}>Rankings data unavailable.</p>
            ) : (
              displayRows.map((player, i) => {
                const isBlurred = i >= CLEAR_ROWS;
                const sig = signalFromRow(player);
                const proj = player.projection != null ? Math.round(player.projection) : null;

                if (isBlurred) {
                  return (
                    <div
                      key={player.player_id ?? i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        filter: "blur(2px)",
                        opacity: 0.6,
                        userSelect: "none",
                        pointerEvents: "none",
                        transition: "opacity 0.2s ease",
                      }}
                    >
                      <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: "#505050", textAlign: "right", flexShrink: 0 }}>#{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#EAEAEA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.player_name}</p>
                        <p style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{player.position ?? ""}{player.position ? " · " : ""}{player.team}</p>
                      </div>
                      <div style={{ width: 80, display: "flex", justifyContent: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: sig.color, background: sig.bg, padding: "4px 10px", borderRadius: 999, border: `1px solid ${sig.color}28`, letterSpacing: "0.05em" }}>
                          {sig.label}
                        </span>
                      </div>
                      <span style={{ width: 52, fontSize: 14, fontWeight: 900, color: "#E0AE2D", textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                        {proj ?? "—"}
                        <span style={{ fontSize: 9.5, color: "#444", fontWeight: 500 }}> pts</span>
                      </span>
                      <div style={{ width: 20, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                        <Lock size={11} color="rgba(224,174,45,0.55)" strokeWidth={2.5} />
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={player.player_id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: "#3A3A3A", textAlign: "right", flexShrink: 0 }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#EAEAEA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{player.player_name}</p>
                      <p style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{player.position ?? ""}{player.position ? " · " : ""}{player.team}</p>
                    </div>
                    <div style={{ width: 80, display: "flex", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: sig.color, background: sig.bg, padding: "4px 10px", borderRadius: 999, border: `1px solid ${sig.color}28`, letterSpacing: "0.05em" }}>
                        {sig.label}
                      </span>
                    </div>
                    <span style={{ width: 52, fontSize: 14, fontWeight: 900, color: "#E0AE2D", textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
                      {proj ?? "—"}
                      <span style={{ fontSize: 9.5, color: "#444", fontWeight: 500 }}> pts</span>
                    </span>
                    <div style={{ width: 20, flexShrink: 0 }} />
                  </div>
                );
              })
            )}
          </div>

          {/* Mid-table CTA — sits right after blurred rows */}
          {!loading && rows.length > freePreview && (
            <div style={{
              margin: "0 24px 2px",
              padding: "16px 20px",
              borderRadius: 10,
              background: "linear-gradient(135deg, rgba(224,174,45,0.07) 0%, rgba(224,174,45,0.03) 100%)",
              border: "1px solid rgba(224,174,45,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Lock size={14} color="rgba(224,174,45,0.80)" strokeWidth={2.5} />
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", fontWeight: 600, margin: 0, lineHeight: 1.3 }}>
                  <span style={{ color: "#E0AE2D", fontWeight: 800 }}>{totalCount}+ players</span> ranked this week
                </p>
              </div>
              <Link
                to="/sports/afl/rankings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(224,174,45,0.12)",
                  color: "#E0AE2D",
                  fontWeight: 800,
                  fontSize: 12,
                  padding: "8px 18px",
                  borderRadius: 7,
                  textDecoration: "none",
                  border: "1px solid rgba(224,174,45,0.28)",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  transition: "all 0.15s ease",
                }}
              >
                Unlock Full Rankings <ArrowRight size={12} />
              </Link>
            </div>
          )}

          {/* Bottom CTA */}
          {!loading && rows.length > freePreview && (
            <div style={{ padding: "20px 24px 24px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "rgba(224,174,45,0.025)" }}>
              <p style={{ fontSize: 12, color: "#3A3A3A", textAlign: "center", margin: 0 }}>
                Showing {CLEAR_ROWS} of {totalCount}+ players
              </p>
              <Link
                to="/sports/afl/rankings"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  background: "#E0AE2D",
                  color: "#1a0900",
                  fontWeight: 800,
                  fontSize: 13,
                  padding: "11px 26px",
                  borderRadius: 8,
                  textDecoration: "none",
                  boxShadow: "0 4px 20px rgba(224,174,45,0.30)",
                  letterSpacing: "0.02em",
                }}
              >
                Unlock 630+ Players <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
