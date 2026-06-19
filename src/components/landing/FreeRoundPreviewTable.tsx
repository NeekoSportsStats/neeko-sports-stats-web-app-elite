import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { supabase } from "@/lib/supabaseClient";
import type { StatBoardMatch, StatBoardPlayer } from "@/features/afl/stat-board/types";

interface PreviewRow {
  name: string;
  pos: string;
  hits: [string, string, string, string];
  highlight: [boolean, boolean, boolean, boolean];
}

type PreviewStatus = "loading" | "ready" | "fallback";

const SEASON = 2026;

function formatRatio(hits: number, games: number): string {
  return `${hits}/${games}`;
}

function isHighlighted(hits: number, games: number): boolean {
  return games > 0 && hits / games >= 0.7;
}

function posLabel(positionGroup: string | null): string {
  if (!positionGroup) return "MID";
  const p = positionGroup.toUpperCase();
  if (p === "RUC") return "RUC";
  if (p === "FWD") return "FWD";
  if (p === "DEF") return "DEF";
  return "MID";
}

async function fetchPreviewRows(): Promise<PreviewRow[]> {
  if (!supabase) throw new Error("Supabase not initialised");

  const { data: matchData, error: matchErr } = await supabase.rpc("get_stat_board_matches", {
    p_season: SEASON,
    p_round: null,
  });
  if (matchErr) throw matchErr;

  const matches = (matchData as StatBoardMatch[]) ?? [];
  const freeMatch = matches.find((m) => m.is_free_match && !m.is_locked);
  if (!freeMatch) throw new Error("No free match available");

  const { data: playerData, error: playerErr } = await supabase.rpc("get_stat_board_players", {
    p_season: SEASON,
    p_round: null,
    p_match_id: freeMatch.match_id,
    p_lens: "disposals",
    p_threshold: 20,
    p_limit: 5,
    p_offset: 0,
  });
  if (playerErr) throw playerErr;

  const players = (playerData as StatBoardPlayer[]) ?? [];
  if (players.length === 0) throw new Error("No players returned");

  return players.map((p) => {
    const thr = p.season_threshold_hit_rates ?? p.all_threshold_hit_rates ?? {};
    const g15 = thr["15"] ?? { hits: 0, games: 0 };
    const g20 = thr["20"] ?? { hits: 0, games: 0 };
    const g25 = thr["25"] ?? { hits: 0, games: 0 };
    const g30 = thr["30"] ?? { hits: 0, games: 0 };
    const games = g20.games || g15.games || 1;
    return {
      name: p.player_name,
      pos: posLabel(p.position_group),
      hits: [
        formatRatio(g15.hits, g15.games || games),
        formatRatio(g20.hits, g20.games || games),
        formatRatio(g25.hits, g25.games || games),
        formatRatio(g30.hits, g30.games || games),
      ] as [string, string, string, string],
      highlight: [
        isHighlighted(g15.hits, g15.games || games),
        isHighlighted(g20.hits, g20.games || games),
        isHighlighted(g25.hits, g25.games || games),
        isHighlighted(g30.hits, g30.games || games),
      ] as [boolean, boolean, boolean, boolean],
    };
  });
}

function posColor(pos: string): { text: string; bg: string; border: string } {
  switch (pos) {
    case "DEF": return { text: "rgba(167,139,250,0.75)", bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.18)" };
    case "FWD": return { text: "rgba(251,146,60,0.80)", bg: "rgba(234,88,12,0.10)",   border: "rgba(234,88,12,0.18)"  };
    case "RUC": return { text: "rgba(52,211,153,0.80)", bg: "rgba(5,150,105,0.10)",   border: "rgba(5,150,105,0.18)"  };
    default:    return { text: "rgba(96,165,250,0.75)", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.18)" };
  }
}

export interface FreeRoundPreviewTableProps {
  utms: Record<string, string>;
  cleanPagePath: string;
  previewLoadedEvent: string;
  previewErrorEvent: string;
}

export function FreeRoundPreviewTable({
  utms,
  cleanPagePath,
  previewLoadedEvent,
  previewErrorEvent,
}: FreeRoundPreviewTableProps) {
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("loading");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchPreviewRows()
      .then((rows) => {
        if (cancelled) return;
        setPreviewRows(rows);
        setPreviewStatus("ready");
        posthog.capture(previewLoadedEvent, {
          clean_page_path: cleanPagePath,
          row_count: rows.length,
          ...utms,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewStatus("fallback");
        const msg = err instanceof Error ? err.message : String(err);
        posthog.capture(previewErrorEvent, {
          clean_page_path: cleanPagePath,
          error_message: msg,
          ...utms,
        });
        posthog.capture("preview_fallback_shown", {
          clean_page_path: cleanPagePath,
          reason: msg,
          ...utms,
        });
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{
        padding: "12px 16px 11px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <p style={{
            margin: 0, fontSize: 12, fontWeight: 800,
            color: "rgba(255,255,255,0.70)", letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {previewStatus === "fallback" ? "AFL Stat Board Example" : "Free Round Preview"}
          </p>
          <p style={{
            margin: "2px 0 0", fontSize: 10,
            color: "rgba(255,255,255,0.28)",
          }}>
            {previewStatus === "ready"
              ? "Live sample from this week's free games"
              : previewStatus === "fallback"
              ? "Example layout only"
              : "Loading live data\u2026"}
          </p>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: previewStatus === "ready" ? "rgba(34,197,94,0.70)" : "rgba(224,174,45,0.60)",
          background: previewStatus === "ready" ? "rgba(34,197,94,0.08)" : "rgba(224,174,45,0.08)",
          border: `1px solid ${previewStatus === "ready" ? "rgba(34,197,94,0.18)" : "rgba(224,174,45,0.15)"}`,
          borderRadius: 5,
          padding: "3px 7px",
          flexShrink: 0,
          marginLeft: 10,
        }}>
          {previewStatus === "ready" ? "Live" : "Preview"}
        </span>
      </div>

      {/* Loading skeleton */}
      {previewStatus === "loading" && (
        <div style={{ padding: "12px 16px 16px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              height: 36,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 6,
              marginBottom: i < 3 ? 8 : 0,
              animation: "pulse 1.4s ease-in-out infinite",
            }} />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }`}</style>
        </div>
      )}

      {/* Fallback message */}
      {previewStatus === "fallback" && (
        <div style={{ padding: "20px 16px", textAlign: "center" }}>
          <p style={{
            fontSize: 12, color: "rgba(255,255,255,0.32)",
            margin: 0, lineHeight: 1.5,
          }}>
            Board preview unavailable right now.
          </p>
          <p style={{
            fontSize: 11, color: "rgba(255,255,255,0.18)",
            margin: "4px 0 0",
          }}>
            Open the stat board to see live data.
          </p>
        </div>
      )}

      {/* Live table */}
      {previewStatus === "ready" && previewRows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <th style={{
                  padding: "9px 16px 9px",
                  textAlign: "left",
                  fontSize: 10, fontWeight: 700,
                  color: "rgba(255,255,255,0.28)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}>Player</th>
                {["15+", "20+", "25+", "30+"].map((col) => (
                  <th key={col} style={{
                    padding: "9px 10px 9px",
                    textAlign: "center",
                    fontSize: 10, fontWeight: 700,
                    color: "rgba(255,255,255,0.28)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, ri) => {
                const pc = posColor(row.pos);
                return (
                  <tr key={ri} style={{
                    borderBottom: ri < previewRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}>
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          color: pc.text,
                          background: pc.bg,
                          border: `1px solid ${pc.border}`,
                          borderRadius: 4,
                          padding: "2px 5px",
                          letterSpacing: "0.05em",
                        }}>{row.pos}</span>
                        <span style={{
                          fontSize: 11.5, fontWeight: 700,
                          color: "rgba(255,255,255,0.72)",
                          whiteSpace: "nowrap",
                        }}>{row.name}</span>
                      </div>
                    </td>
                    {row.hits.map((hit, ci) => (
                      <td key={ci} style={{ padding: "10px 10px", textAlign: "center" }}>
                        <span style={{
                          fontSize: 12, fontWeight: 800,
                          color: row.highlight[ci] ? "#22c55e" : "rgba(255,255,255,0.32)",
                        }}>{hit}</span>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Table footer */}
      {previewStatus !== "loading" && (
        <div style={{
          padding: "9px 16px 12px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          <p style={{
            fontSize: 10, color: "rgba(255,255,255,0.20)", margin: 0,
            fontStyle: "italic",
          }}>
            {previewStatus === "ready"
              ? "Ratios show games hit / games played this season. Disposals stat."
              : "Open the stat board to see this round's live player data."}
          </p>
        </div>
      )}
    </div>
  );
}
