import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
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

export default function LandingTopRankings({ loading, rows, freePreview }: Props) {
  return (
    <section style={{ background: "#0a0908", padding: "96px clamp(16px, 5vw, 40px)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.40em", textTransform: "uppercase", color: "rgba(224,174,45,0.60)", marginBottom: 14 }}>Live Data</p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#F5F5F5", lineHeight: 1.1, marginBottom: 14 }}>
            This Week's Edge
          </h2>
          <p style={{ fontSize: 14, color: "#606060", maxWidth: 440, margin: "0 auto", lineHeight: 1.65 }}>
            Ranked by the canonical projection engine — updated before every round lockout.
          </p>
        </div>

        <div style={{ background: "rgba(255,255,255,0.025)", borderRadius: 16, border: "1px solid rgba(224,174,45,0.12)", overflow: "hidden", boxShadow: "0 24px 72px rgba(0,0,0,0.55)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(224,174,45,0.03)" }}>
            <span style={{ width: 28, fontSize: 9, fontWeight: 800, color: "#3A3A3A", textAlign: "right", flexShrink: 0, letterSpacing: "0.10em", textTransform: "uppercase" }}>#</span>
            <span style={{ flex: 1, fontSize: 9, fontWeight: 800, color: "#3A3A3A", letterSpacing: "0.10em", textTransform: "uppercase" }}>Player</span>
            <span style={{ width: 80, fontSize: 9, fontWeight: 800, color: "#3A3A3A", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "center" }}>Action</span>
            <span style={{ width: 52, fontSize: 9, fontWeight: 800, color: "#3A3A3A", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}>Proj</span>
          </div>

          <div style={{ padding: "0 24px" }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ width: 28, height: 12, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "50%", marginBottom: 5 }} />
                    <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "30%" }} />
                  </div>
                  <div style={{ width: 52, height: 20, background: "rgba(255,255,255,0.05)", borderRadius: 12 }} />
                  <div style={{ width: 40, height: 13, background: "rgba(255,255,255,0.05)", borderRadius: 3 }} />
                </div>
              ))
            ) : rows.length === 0 ? (
              <p style={{ padding: "36px 0", textAlign: "center", color: "#3A3A3A", fontSize: 13 }}>Rankings data unavailable.</p>
            ) : (
              rows.map((player, i) => {
                const locked = i >= freePreview;
                const sig = signalFromRow(player);
                const proj = player.projection != null ? Math.round(player.projection) : null;

                if (locked) {
                  return (
                    <div key={player.player_id ?? i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
                      <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: "#3A3A3A", textAlign: "right", flexShrink: 0 }}>#{i + 1}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ height: 13, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: "55%" }} />
                        <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, width: "35%", marginTop: 4 }} />
                      </div>
                      <div style={{ width: 52, height: 20, background: "rgba(255,255,255,0.06)", borderRadius: 12 }} />
                      <div style={{ width: 40, height: 13, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
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
                  </div>
                );
              })
            )}
          </div>

          {!loading && rows.length > freePreview && (
            <div style={{ padding: "22px 24px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "rgba(224,174,45,0.025)" }}>
              <p style={{ fontSize: 12, color: "#3A3A3A", textAlign: "center" }}>
                Showing {freePreview} of {rows[0].total_count ?? rows.length}+ players
              </p>
              <Link to="/sports/afl/rankings" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#E0AE2D", color: "#1a0900", fontWeight: 800, fontSize: 13, padding: "11px 26px", borderRadius: 8, textDecoration: "none", boxShadow: "0 4px 20px rgba(224,174,45,0.30)", letterSpacing: "0.02em" }}>
                Unlock All 630+ Weekly Rankings <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
