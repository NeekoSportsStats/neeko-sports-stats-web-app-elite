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
  if (raw === "STRONG_START" || raw === "START" || raw === "UP" || raw === "STRONG_UP" || raw === "BUY") {
    return { label: "BUY", color: "#22C55E", bg: "rgba(34,197,94,0.10)" };
  }
  if (raw === "STRONG_SIT" || raw === "SIT" || raw === "DOWN" || raw === "STRONG_DOWN" || raw === "SELL") {
    return { label: "AVOID", color: "#EF4444", bg: "rgba(239,68,68,0.10)" };
  }
  return { label: "HOLD", color: "#E0AE2D", bg: "rgba(224,174,45,0.10)" };
}

const CLEAR_ROWS = 5;
const GATED_ROWS = 2;

export default function LandingTopRankings({ loading, rows }: Props) {
  const clearRows = rows.slice(0, CLEAR_ROWS);
  const gatedRows = rows.slice(CLEAR_ROWS, CLEAR_ROWS + GATED_ROWS);

  return (
    <section style={{ background: "#05070A", padding: "clamp(80px, 7vw, 120px) clamp(20px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 10 }}>Rankings Depth</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, marginBottom: 10 }}>
            630+ Players Ranked. Every Position. Every Round.
          </h2>
          <p style={{ fontSize: 14, color: "#606060", maxWidth: 520, lineHeight: 1.65 }}>
            Not just the top 50. Every relevant player — ranked by projection, value, and form signal.
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

          {/* Clear rows */}
          <div style={{ padding: "0 24px" }}>
            {loading ? (
              Array.from({ length: CLEAR_ROWS }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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
            ) : clearRows.length === 0 ? (
              <p style={{ padding: "36px 0", textAlign: "center", color: "#3A3A3A", fontSize: 13 }}>Rankings data unavailable.</p>
            ) : (
              clearRows.map((player, i) => {
                const sig = signalFromRow(player);
                const proj = player.projection != null ? Math.round(player.projection) : null;
                return (
                  <div key={player.player_id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: "#3A3A3A", textAlign: "right", flexShrink: 0 }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#EAEAEA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{player.player_name}</p>
                      <p style={{ fontSize: 11, color: "#444", marginTop: 2, margin: 0 }}>{[player.position, player.team].filter(Boolean).join(" · ")}</p>
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

          {/* Gated rows */}
          {!loading && gatedRows.length > 0 && (
            <div style={{ padding: "0 24px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              {gatedRows.map((player, i) => {
                const sig = signalFromRow(player);
                const proj = player.projection != null ? Math.round(player.projection) : null;
                const rowIndex = CLEAR_ROWS + i;
                return (
                  <div
                    key={player.player_id ?? rowIndex}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 0",
                      borderBottom: i < gatedRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      position: "relative",
                    }}
                  >
                    {/* Lock overlay */}
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      gap: 6,
                      zIndex: 2,
                    }}>
                      <Lock size={12} color="rgba(255,255,255,0.28)" strokeWidth={2.5} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.28)" }}>
                        Neeko+ to unlock
                      </span>
                    </div>
                    {/* Blurred content behind overlay */}
                    <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: "#3A3A3A", textAlign: "right", flexShrink: 0, filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>#{rowIndex + 1}</span>
                    <div style={{ flex: 1, minWidth: 0, filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "#EAEAEA", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{player.player_name}</p>
                      <p style={{ fontSize: 11, color: "#444", marginTop: 2, margin: 0 }}>{[player.position, player.team].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div style={{ width: 80, display: "flex", justifyContent: "center", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: sig.color, background: sig.bg, padding: "4px 10px", borderRadius: 999, border: `1px solid ${sig.color}28`, letterSpacing: "0.05em" }}>
                        {sig.label}
                      </span>
                    </div>
                    <span style={{ width: 52, fontSize: 14, fontWeight: 900, color: "#E0AE2D", textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
                      {proj ?? "—"}
                      <span style={{ fontSize: 9.5, color: "#444", fontWeight: 500 }}> pts</span>
                    </span>
                    <div style={{ width: 20, flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom CTA */}
          {!loading && rows.length > 0 && (
            <div style={{
              padding: "20px 24px 24px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              background: "rgba(224,174,45,0.025)",
            }}>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
                Full rankings updated before every round lockout
              </p>
              <Link
                to="/neeko-plus"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  background: "#E0AE2D",
                  color: "#1a0900",
                  fontWeight: 800,
                  fontSize: 13,
                  padding: "11px 22px",
                  borderRadius: 8,
                  textDecoration: "none",
                  boxShadow: "0 4px 20px rgba(224,174,45,0.30)",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                Unlock Full Weekly Rankings <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
