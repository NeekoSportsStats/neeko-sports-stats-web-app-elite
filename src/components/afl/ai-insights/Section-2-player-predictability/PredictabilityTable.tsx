import React, { useEffect, useMemo, useState } from "react";
import { X, ChevronDown, ChevronRight, Target } from "lucide-react";
import { createPortal } from "react-dom";
import type { PredictRow, PremiumMode } from "../data/types";
import type { FixtureMatch } from "@/components/afl/match-center/types";
import { confLabel, volLabel, mean } from "../data/utils";
import { buildPlayerPredictabilityFromFixtures } from "../data/engine";
import { SectionHeader } from "@/components/sports/shared/SectionHeader";

/* -------------------------------------------------------------------------- */
/* TYPES & HELPERS                                                             */
/* -------------------------------------------------------------------------- */

type Chip = "all" | "safe" | "ceiling" | "risky";

const SAFE_TARGET = 8;

const cx = (...c: Array<string | false | undefined>) =>
  c.filter(Boolean).join(" ");

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Confidence-first ordering with volatility penalty */
function blendedScore(r: PredictRow) {
  return r.confidence01 * 0.7 + (1 - r.volatility01) * 0.3;
}

function inferStatKey(statLabel: string) {
  const s = (statLabel || "").toLowerCase();
  if (s.includes("fantasy")) return "fantasy";
  if (s.includes("disposal")) return "disposals";
  if (s.includes("goal")) return "goals";
  return "generic";
}

function whySafeMicrocopy(r: PredictRow) {
  if (r.confidence01 >= 0.75 && r.volatility01 <= 0.35)
    return "High role certainty with tight historical range.";
  if (r.confidence01 >= 0.7)
    return "Repeatable role output with manageable variance.";
  return "Near-safe profile with slightly elevated variability.";
}

function stabilityText(conf01: number, vol01: number) {
  const c = clamp01(conf01);
  const v = clamp01(vol01);

  if (c >= 0.72 && v <= 0.38)
    return "Projection stability: High · Low deviation expected";
  if (c >= 0.62 && v <= 0.5)
    return "Projection stability: Solid · Moderate deviation expected";
  if (v >= 0.7)
    return "Projection stability: Swingy · High deviation expected";
  if (c <= 0.48)
    return "Projection stability: Risky · Role uncertainty elevated";
  return "Projection stability: Moderate · Some deviation expected";
}

function whyThisMatters(statKey: string, conf01: number, vol01: number) {
  if (statKey === "fantasy") {
    return conf01 >= 0.7
      ? "Strong role reliability supports safer fantasy builds."
      : "Fantasy output sensitive to role and tempo shifts.";
  }
  if (statKey === "disposals") {
    return conf01 >= 0.7
      ? "Disposal volume is structurally stable."
      : "Touches fluctuate with rotation and matchup.";
  }
  if (statKey === "goals") {
    return vol01 >= 0.65
      ? "Goal scoring volatile and opportunity driven."
      : "Scoring chances relatively contained.";
  }
  return "Projection reliability reflects recent role context.";
}

function rangeBarStyle(conf01: number, vol01: number) {
  const alpha = 0.35 + clamp01(conf01) * 0.45;
  const warm = 0.12 + clamp01(vol01) * 0.35;

  return {
    background: `linear-gradient(90deg,
      rgba(251,191,36,${alpha}) 0%,
      rgba(251,191,36,${alpha}) 70%,
      rgba(248,113,113,${warm}) 100%)`,
  } as React.CSSProperties;
}

/* 🔒 FAKE DATA FOR LOCKED ROWS — DESKTOP UNCHANGED */
function fakeLockedRow(r: PredictRow): PredictRow {
  const jitter = Math.floor(6 + Math.random() * 12);
  return {
    ...r,
    rangeLow: Math.max(0, (r.rangeLow ?? 80) - jitter),
    rangeHigh: (r.rangeHigh ?? 95) + jitter,
    ai: "Premium insight available with Neeko+.",
  };
}

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                   */
/* -------------------------------------------------------------------------- */

type StatLens = "fantasy" | "disposals" | "goals";

export default function PredictabilityTable({
  fixtures,
  match,
  mode,
  showHeader = true,
}: {
  fixtures: FixtureMatch[];
  match?: FixtureMatch;
  mode: PremiumMode;
  showHeader?: boolean;
}) {
  const locked = mode !== "premium";

  const [statLens, setStatLens] = useState<StatLens>("fantasy");
  const statLabel = statLens === "fantasy" ? "Fantasy" : statLens === "disposals" ? "Disposals" : "Goals";
  const statKey = useMemo(() => inferStatKey(statLabel), [statLabel]);

  const rawPlayerPredict = useMemo(
    () => buildPlayerPredictabilityFromFixtures(fixtures, statLens),
    [fixtures, statLens]
  );

  const rows = useMemo(() => {
    if (!match) return [];
    const home = (match as any).homeTeam;
    const away = (match as any).awayTeam;
    return rawPlayerPredict.filter(
      (p) => p.team === home || p.team === away
    );
  }, [rawPlayerPredict, match]);

  const matchContext = match ? `${(match as any).homeTeam} vs ${(match as any).awayTeam}` : undefined;

  const playerInsight = useMemo(() => {
    if (!rows.length) return "";
    const avgConf = mean(rows.map((r) => r.confidence01));
    return avgConf >= 0.7
      ? `${statLabel} production shows strong role reliability across the matchup.`
      : `${statLabel} output varies by role dependency and matchup conditions.`;
  }, [rows, statLabel]);

  const [chip, setChip] = useState<Chip>("safe");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<PredictRow | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 639px)").matches;

  /* ---------------- GROUP BY TEAM (RESTORED) ---------------- */

  const rowsByTeam = useMemo(() => {
    const map = new Map<string, PredictRow[]>();
    rows.forEach((r) => {
      if (!map.has(r.team)) map.set(r.team, []);
      map.get(r.team)!.push(r);
    });
    return Array.from(map.entries());
  }, [rows]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedTeam, setExpandedTeam] = useState<Record<string, boolean>>({});

  /* ---------------- MOBILE POLISH (ADDITIVE ONLY) ---------------- */
  const [seenTapHint, setSeenTapHint] = useState(false);

  useEffect(() => {
    setChip("safe");
    setExpandedRow(null);

    // Mobile: gently collapse the 2nd team by default to reduce scroll fatigue (only when "safe" is active)
    if (isMobile) {
      setCollapsed((prev) => {
        // If user already has collapse preferences in state, don't override
        if (Object.keys(prev).length) return prev;
        if (rowsByTeam.length < 2) return prev;
        const secondTeam = rowsByTeam[1]?.[0];
        if (!secondTeam) return prev;
        return { ...prev, [secondTeam]: true };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statLens]);

  /* One-time mobile "tap to expand" affordance memory */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem("ai_predict_tap_hint_seen");
      setSeenTapHint(v === "1");
    } catch {
      // ignore
    }
  }, []);

  const markTapHintSeen = () => {
    if (seenTapHint) return;
    setSeenTapHint(true);
    try {
      window.localStorage.setItem("ai_predict_tap_hint_seen", "1");
    } catch {
      // ignore
    }
  };

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <>
      <section className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
        {showHeader && (
          <header className="px-6 pt-5 pb-4 border-b border-white/10">
            <SectionHeader
              eyebrow="AI Prediction Engine"
              title="Player Score Predictability"
              subtitle="Expected scoring ranges, confidence and volatility"
              icon={Target}
              rightSlot={
                <div className="flex gap-1.5">
                {(["fantasy", "disposals", "goals"] as StatLens[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatLens(s)}
                    className={cx(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      statLens === s
                        ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                        : "border-white/10 bg-black/20 text-white/60 hover:bg-white/5"
                    )}
                  >
                    {s === "fantasy" ? "Fantasy" : s === "disposals" ? "Disposals" : "Goals"}
                  </button>
                ))}
                </div>
              }
            />

            {matchContext && (
              <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                {statLabel} predictions adjusted for {matchContext}
              </div>
            )}
          </header>
        )}

        {/* FILTERS */}
        <div className="px-6 pt-4 pb-2 flex gap-2 items-center">
          {(["safe", "all", "ceiling", "risky"] as Chip[]).map((c) => (
            <button
              key={c}
              onClick={() => setChip(c)}
              className={cx(
                "rounded-full px-3 py-1 text-xs border transition",
                chip === c
                  ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                  : "border-white/10 text-white/60 hover:text-white"
              )}
            >
              {c === "safe"
                ? "Safe Picks"
                : c === "all"
                ? "All"
                : c === "ceiling"
                ? "Ceiling Plays"
                : "Risky"}
            </button>
          ))}
        </div>

        <div className="px-6 pb-3 text-[11px] text-white/40">
          Ordered by reliability score (confidence × volatility blend)
        </div>

        {/* TEAMS */}
        <div className="divide-y divide-white/10">
          {rowsByTeam.map(([team, teamRows], teamIndex) => {
            const sorted = [...teamRows].sort(
              (a, b) => blendedScore(b) - blendedScore(a)
            );

            let displayRows = sorted;

            if (chip === "safe") {
              const safe = sorted.filter(
                (r) => r.confidence01 >= 0.7 && r.volatility01 <= 0.4
              );
              const nearSafe = sorted.filter((r) => !safe.includes(r));

              displayRows = [
                ...safe,
                ...nearSafe.slice(0, Math.max(0, SAFE_TARGET - safe.length)),
              ];
            }

            if (chip === "ceiling") {
              displayRows = sorted.filter((r) => r.volatility01 >= 0.65);
            }

            if (chip === "risky") {
              displayRows = sorted.filter((r) => r.confidence01 <= 0.45);
            }

            if (!displayRows.length) return null;

            const isCollapsed = collapsed[team];
            const showAll = expandedTeam[team];
            const rowsToShow =
              chip === "safe" && !showAll
                ? displayRows.slice(0, SAFE_TARGET)
                : displayRows;

            // Mobile-only: show a subtle "Tap for details" hint once (first visible team, first row)
            const shouldShowTapHint =
              isMobile &&
              !seenTapHint &&
              !isCollapsed &&
              teamIndex === 0 &&
              rowsToShow.length > 0;

            return (
              <div key={team}>
                {/* TEAM HEADER (mobile spacing tightened ONLY under sm) */}
                <button
                  onClick={() =>
                    setCollapsed((s) => ({ ...s, [team]: !s[team] }))
                  }
                  className={cx(
                    "w-full px-6 bg-white/5 border-y border-white/10 flex items-center justify-between",
                    // mobile polish only (desktop unchanged)
                    "py-2 sm:py-2",
                    "sm:px-6"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    <span className="text-xs font-semibold tracking-widest text-white/70 uppercase">
                      {team}
                    </span>
                  </div>
                  <span className="text-[11px] text-white/40">
                    {displayRows.length} players
                  </span>
                </button>

                {!isCollapsed && (
                  <>
                    {/* One-time mobile affordance */}
                    {shouldShowTapHint && (
                      <div className="sm:hidden px-6 pt-2 pb-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/60">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300/80" />
                          Tap a player to expand details
                        </div>
                      </div>
                    )}

                    {rowsToShow.map((r, i) => {
                      const rowLocked = locked && i >= 2;
                      const displayRow = rowLocked ? fakeLockedRow(r) : r;
                      const expanded = expandedRow === r.id;

                      return (
                        <div key={r.id}>
                          <div
                            onClick={() => {
                              if (rowLocked) return;

                              // Once user interacts, remove future hints
                              if (isMobile) markTapHintSeen();

                              if (isMobile) {
                                setExpandedRow(expanded ? null : r.id);
                              } else {
                                setActive(displayRow);
                                setOpen(true);
                              }
                            }}
                            className={cx(
                              "px-6 py-3 grid grid-cols-1 sm:grid-cols-[36px_1.1fr_180px_1.4fr] gap-3 sm:gap-4 items-center border-b border-white/10 transition",
                              rowLocked
                                ? "cursor-not-allowed blur-sm"
                                : "cursor-pointer hover:bg-white/[0.04]"
                            )}
                          >
                            <div className="hidden sm:block text-white/30 text-xs">
                              #{i + 1}
                            </div>

                            <div>
                              <div className="text-white font-medium text-sm flex gap-2 items-center">
                                {displayRow.name}

                                {/* Mobile: small chevron affordance (desktop unchanged because hidden on sm+) */}
                                <span
                                  className={cx(
                                    "sm:hidden ml-auto inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/60",
                                    expanded ? "text-amber-200" : ""
                                  )}
                                  aria-hidden="true"
                                >
                                  {expanded ? "Hide" : "Details"}
                                </span>

                                {/* Top Lock badge (unchanged desktop; slightly tighter on mobile via text size only) */}
                                {chip === "safe" && i < 3 && (
                                  <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-2 py-0.5 text-[10px] text-amber-300">
                                    🔒 Top Lock
                                  </span>
                                )}
                              </div>

                              <div className="mt-0.5 flex gap-1.5 items-center">
                                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
                                  {confLabel(displayRow.confidence01)}
                                </span>
                                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
                                  {volLabel(displayRow.volatility01)}
                                </span>
                              </div>
                            </div>

                            <div>
                              <div className="font-semibold text-white text-sm">
                                {displayRow.rangeLow} → {displayRow.rangeHigh}
                              </div>
                              <div className="mt-1 h-1.5 w-full rounded bg-white/10">
                                <div
                                  className="h-1.5 rounded"
                                  style={rangeBarStyle(
                                    displayRow.confidence01,
                                    displayRow.volatility01
                                  )}
                                />
                              </div>
                            </div>

                            <div className="hidden sm:block text-sm text-white/60">
                              {displayRow.ai}
                            </div>
                          </div>

                          {/* MOBILE INLINE EXPAND — improved separation + spacing (sm:hidden only, desktop untouched) */}
                          <div
                            className={cx(
                              "sm:hidden px-6 overflow-hidden transition-all duration-300 ease-out",
                              expanded ? "max-h-80 opacity-100 pb-3" : "max-h-0 opacity-0"
                            )}
                          >
                            <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                              <div className="text-sm text-white/70">
                                {displayRow.ai}
                              </div>

                              {chip === "safe" && (
                                <div className="mt-2 text-[11px] text-amber-300">
                                  {whySafeMicrocopy(displayRow)}
                                </div>
                              )}

                              <div className="mt-2 pt-2 border-t border-white/10 text-[11px] text-white/40">
                                {stabilityText(
                                  displayRow.confidence01,
                                  displayRow.volatility01
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {chip === "safe" &&
                  displayRows.length > SAFE_TARGET &&
                  !isCollapsed && (
                    <button
                      onClick={() =>
                        setExpandedTeam((s) => ({
                          ...s,
                          [team]: !s[team],
                        }))
                      }
                      className="px-6 py-2 text-xs text-amber-300 hover:underline"
                    >
                      {expandedTeam[team] ? "Show less" : "Show full team"}
                    </button>
                  )}
              </div>
            );
          })}
        </div>
      </section>

      {/* DESKTOP MODAL — UNCHANGED */}
      {open &&
        active &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center px-4"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[620px] rounded-2xl bg-[#050912] border border-white/10 p-6 relative"
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute top-4 right-4 text-white/60 hover:text-white"
              >
                <X size={16} />
              </button>

              <h3 className="text-xl font-semibold text-white">{active.name}</h3>
              <p className="text-sm text-white/50 mt-1">{matchContext}</p>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-lg font-semibold">
                    {active.rangeLow} → {active.rangeHigh}
                  </div>
                  <p className="mt-2 text-sm text-white/70">{active.ai}</p>
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
                  <div className="font-medium text-white mb-1">
                    Compared to team average
                  </div>
                  <div className="text-white/70">
                    Confidence:{" "}
                    <strong>{(active.confidence01 * 100).toFixed(0)}%</strong> ·
                    Volatility:{" "}
                    <strong>{(active.volatility01 * 100).toFixed(0)}%</strong>
                  </div>
                </div>

                <div className="text-sm text-amber-200">
                  {whyThisMatters(
                    statKey,
                    active.confidence01,
                    active.volatility01
                  )}
                </div>

                <div className="text-xs text-white/40">
                  {stabilityText(active.confidence01, active.volatility01)}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
