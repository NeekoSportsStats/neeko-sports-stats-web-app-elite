import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, TrendingUp, Target, Users, ChevronRight, Sparkles, Lock, ArrowLeft, Info, Brain } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import FantasyVerdictBadge from "@/components/FantasyVerdictBadge";
import { PremiumGate, PremiumGateCTA } from "@/components/PremiumGate";
import { useAuth } from "@/lib/auth";
import { FREE_TEAM_NAMES, FREE_MATCH_IDS } from "@/config/freemiumConfig";
import { FREE_PLAYER_IDS_BY_TEAM } from "@/config/freePlayers";
import PlayerSelectorDropdown from "@/components/PlayerSelectorDropdown";

interface AIPlayerSummary {
  player_id: number;
  player: string;
  team: string;
  round_number: number;
  season_avg: number | null;
  consistency_score: number | null;
  ceiling_fantasy: number | null;
  floor_fantasy: number | null;
  ai_summary: string | null;
  trend_direction: string | null;
  updated_at: string | null;
  season_context?: string | null;
  opponent?: string | null;
  volatility?: number | null;
  matchup_delta?: number | null;
  matchup_label?: string | null;
  expected_fantasy?: number | null;
  risk_tier?: string | null;
}

interface AIMatchPrediction {
  match_id: number;
  home_team: string;
  away_team: string;
  round_number: number;
  season: number;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  predicted_margin: number | null;
  confidence: string | null;
  ai_summary: string | null;
  prediction_explanation: string | null;
  updated_at: string | null;
}

interface AITeamSummary {
  team: string;
  season: number;
  round_number: number;
  summary: string | null;
  fantasy_verdict: string | null;
  updated_at: string | null;
}

interface AITeamFeatures {
  team: string;
  season_avg: number | null;
  last_5_avg: number | null;
  predicted_score: number | null;
  floor: number | null;
  ceiling: number | null;
  stdev_last_10: number | null;
  confidence_bucket: string | null;
}

interface PlayerProjection {
  player_id: number;
  player_name: string;
  team: string;
  final_projection: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  season_avg_current: number | null;
  avg_last_5: number | null;
  trend_3_vs_10: number | null;
  prob_100_plus: number | null;
  season_context: string | null;
}

type Section = "player" | "team" | "match";

export default function AFLAIInsightsPage() {
  const { isPremium } = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("player");

  // Player Deep Dive state
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerProjection[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<AIPlayerSummary | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [cardVisible, setCardVisible] = useState(false);
  const [showTransparency, setShowTransparency] = useState(false);
  const [projScaled, setProjScaled] = useState(false);
  const [selectedPlayerTeam, setSelectedPlayerTeam] = useState<string | null>(null);
  const [allPlayerTeams, setAllPlayerTeams] = useState<string[]>([]);
  const [teamPlayers, setTeamPlayers] = useState<PlayerProjection[]>([]);
  const [teamPlayersLoading, setTeamPlayersLoading] = useState(false);

  // Team Analysis state
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [teamSummary, setTeamSummary] = useState<AITeamSummary | null>(null);
  const [teamFeatures, setTeamFeatures] = useState<AITeamFeatures | null>(null);
  const [allTeamFeatures, setAllTeamFeatures] = useState<AITeamFeatures[]>([]);
  const [teamSummaryError, setTeamSummaryError] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [showTeamTransparency, setShowTeamTransparency] = useState(false);

  const neekoRating: number | null = React.useMemo(() => {
    const projectedScore = teamFeatures?.predicted_score ?? null;
    const teamsWithProj = allTeamFeatures.filter(t => t.predicted_score !== null);
    const leagueAvgProj = teamsWithProj.length > 0
      ? teamsWithProj.reduce((sum, t) => sum + (t.predicted_score ?? 0), 0) / teamsWithProj.length
      : null;
    if (projectedScore === null || leagueAvgProj === null || leagueAvgProj === 0) return null;
    return Math.round((projectedScore / leagueAvgProj) * 100);
  }, [teamFeatures, allTeamFeatures]);

  // Match Predictions state
  const [matchSummaries, setMatchSummaries] = useState<AIMatchPrediction[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [activeMatchTooltip, setActiveMatchTooltip] = useState<string | null>(null);

  const playerSectionRef = useRef<HTMLDivElement>(null);
  const teamSectionRef = useRef<HTMLDivElement>(null);
  const matchSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchTeams() {
      const { data, error } = isPremium
        ? await supabase
            .schema("afl")
            .from("ai_team_summaries")
            .select("team")
            .eq("season", 2026)
            .order("team", { ascending: true })
        : await supabase
            .from("v_ai_team_summaries_preview")
            .select("team")
            .order("team", { ascending: true });
      if (!error && data) {
        const distinct = Array.from(new Set(data.map((r: { team: string }) => r.team))).sort() as string[];
        setTeams(distinct);
      }
    }
    fetchTeams();
  }, [isPremium]);

  useEffect(() => {
    async function fetchAllTeamFeatures() {
      const { data, error } = await supabase
        .schema("afl")
        .from("v_ai_team_features_2026_next_round")
        .select("team, season_avg, last_5_avg, predicted_score, floor, ceiling, stdev_last_10, confidence_bucket");
      if (!error && data) {
        setAllTeamFeatures(data as AITeamFeatures[]);
      }
    }
    fetchAllTeamFeatures();
  }, []);

  useEffect(() => {
    if (!selectedTeam) {
      setTeamSummary(null);
      setTeamFeatures(null);
      setTeamSummaryError(false);
      return;
    }

    async function fetchTeamSummary() {
      setLoadingTeam(true);
      setTeamSummaryError(false);

      const isFreeTeam = FREE_TEAM_NAMES.includes(selectedTeam);
      const canReadAI = isPremium || isFreeTeam;

      try {
        if (canReadAI) {
          const result2026 = await supabase
            .schema("afl")
            .from("ai_team_summaries")
            .select("team, season, round_number, summary, fantasy_verdict, updated_at")
            .eq("team", selectedTeam)
            .eq("season", 2026)
            .order("round_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (result2026.error) throw result2026.error;

          if (result2026.data) {
            setTeamSummary(result2026.data as AITeamSummary);
          } else {
            const result2025 = await supabase
              .schema("afl")
              .from("ai_team_summaries")
              .select("team, season, round_number, summary, fantasy_verdict, updated_at")
              .eq("team", selectedTeam)
              .eq("season", 2025)
              .order("round_number", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (result2025.error) throw result2025.error;
            setTeamSummary(result2025.data ? (result2025.data as AITeamSummary) : null);
          }
        } else {
          const result = await supabase
            .from("v_ai_team_summaries_preview")
            .select("team, season, round_number, fantasy_verdict, updated_at")
            .eq("team", selectedTeam)
            .order("round_number", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (result.error) throw result.error;
          setTeamSummary(result.data ? { ...(result.data as AITeamSummary), summary: null } : null);
        }

        const featuresResult = await supabase
          .schema("afl")
          .from("v_ai_team_features_2026_next_round")
          .select("team, season_avg, last_5_avg, predicted_score, floor, ceiling, stdev_last_10, confidence_bucket")
          .eq("team", selectedTeam)
          .order("round_number", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!featuresResult.error && featuresResult.data) {
          setTeamFeatures(featuresResult.data as AITeamFeatures);
        } else {
          setTeamFeatures(null);
        }
      } catch (err) {
        console.error("Failed to load team summary:", err);
        setTeamSummaryError(true);
        setTeamSummary(null);
      } finally {
        setLoadingTeam(false);
      }
    }

    fetchTeamSummary();
  }, [selectedTeam, isPremium]);

  useEffect(() => {
    async function loadPlayerTeams() {
      const { data, error } = await supabase
        .schema("afl")
        .from("v_neeko_player_projection")
        .select("team")
        .order("team", { ascending: true });
      if (!error && data) {
        const distinct = Array.from(new Set((data as { team: string }[]).map(r => r.team))).sort() as string[];
        setAllPlayerTeams(distinct);
      }
    }
    loadPlayerTeams();
  }, []);

  useEffect(() => {
    if (!selectedPlayerTeam) {
      setTeamPlayers([]);
      return;
    }
    async function loadTeamPlayers() {
      setTeamPlayersLoading(true);
      const { data, error } = await supabase
        .schema("afl")
        .from("v_neeko_player_projection")
        .select("player_id, player_name, team, final_projection, ceiling_estimate, floor_estimate, season_avg_current, avg_last_5, trend_3_vs_10, prob_100_plus, season_context")
        .eq("team", selectedPlayerTeam)
        .order("final_projection", { ascending: false })
        .limit(40);
      if (!error && data) {
        setTeamPlayers(data as PlayerProjection[]);
      } else {
        setTeamPlayers([]);
      }
      setTeamPlayersLoading(false);
    }
    loadTeamPlayers();
  }, [selectedPlayerTeam]);

  useEffect(() => {
    const query = playerSearch.trim();
    setHighlightedIndex(-1);
    if (!query) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      let q = supabase
        .schema("afl")
        .from("v_neeko_player_projection")
        .select("player_id, player_name, team, final_projection, ceiling_estimate, floor_estimate, season_avg_current, avg_last_5, trend_3_vs_10, prob_100_plus, season_context")
        .ilike("player_name", `%${query}%`)
        .order("final_projection", { ascending: false })
        .limit(10);
      if (selectedPlayerTeam) {
        q = q.eq("team", selectedPlayerTeam);
      }
      const { data, error } = await q;
      if (!error && data) {
        setSearchResults(data as PlayerProjection[]);
      } else {
        setSearchResults([]);
      }
      setSearchLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [playerSearch, selectedPlayerTeam]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = highlightedIndex >= 0 ? searchResults[highlightedIndex] : searchResults[0];
      if (target) handleSearchResultClick(target);
    } else if (e.key === "Escape") {
      setPlayerSearch("");
      setSearchResults([]);
      setHighlightedIndex(-1);
      searchInputRef.current?.blur();
    }
  }, [searchResults, highlightedIndex]);

  const scrollToSection = (section: Section) => {
    setActiveSection(section);
    const refs = { player: playerSectionRef, team: teamSectionRef, match: matchSectionRef };
    refs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSearchResultClick = async (proj: PlayerProjection) => {
    setPlayerSearch("");
    setSearchResults([]);

    const isFreePlayer = FREE_PLAYER_IDS_BY_TEAM[proj.team]?.includes(proj.player_id) ?? false;
    const canReadAI = isPremium || isFreePlayer;

    const selectFields = `player_id, player, team, round_number, season_avg, consistency_score, ceiling_fantasy, floor_fantasy, ai_summary, trend_direction, updated_at, opponent, volatility, matchup_delta, matchup_label, expected_fantasy, risk_tier`;
    const previewFields = `player_id, player, team, round_number, season_avg, consistency_score, ceiling_fantasy, floor_fantasy, trend_direction, updated_at, opponent, volatility, matchup_delta, matchup_label, expected_fantasy, risk_tier`;

    let data: AIPlayerSummary | null = null;
    let error: unknown = null;

    if (canReadAI) {
      const result = await supabase
        .schema("afl")
        .from("ai_player_summaries")
        .select(selectFields)
        .eq("player_id", proj.player_id)
        .eq("season", 2026)
        .order("round_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      data = result.data as AIPlayerSummary | null;
      error = result.error;
    } else {
      const result = await supabase
        .from("v_ai_player_summaries_preview")
        .select(previewFields)
        .eq("player_id", proj.player_id)
        .order("round_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      data = result.data ? { ...(result.data as AIPlayerSummary), ai_summary: null } : null;
      error = result.error;
    }

    const enriched: AIPlayerSummary = data
      ? { ...(data as AIPlayerSummary), season_context: proj.season_context }
      : {
          player_id: proj.player_id,
          player: proj.player_name,
          team: proj.team,
          round_number: 0,
          season_avg: proj.season_avg_current,
          consistency_score: null,
          ceiling_fantasy: proj.ceiling_estimate,
          floor_fantasy: proj.floor_estimate,
          ai_summary: null,
          trend_direction: null,
          updated_at: null,
          season_context: proj.season_context,
        };

    if (!error) {
      setSelectedPlayer(enriched);
      setTimeout(() => {
        playerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  useEffect(() => {
    if (selectedPlayer) {
      setCardVisible(false);
      setShowTransparency(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCardVisible(true);
          setTimeout(() => {
            setProjScaled(true);
            setTimeout(() => setProjScaled(false), 200);
          }, 100);
        });
      });
    } else {
      setCardVisible(false);
    }
  }, [selectedPlayer]);

  const getConsistencyPercentile = (score: number | null): { pct: number; label: string; isTop: boolean } | null => {
    if (score == null) return null;
    const pct = Math.round((score / 10) * 100);
    const topPct = 100 - pct;
    if (topPct <= 12) return { pct: topPct === 0 ? 1 : topPct, label: `Top ${topPct === 0 ? 1 : topPct}%`, isTop: true };
    if (topPct <= 30) return { pct: topPct, label: `Top ${topPct}%`, isTop: true };
    if (pct <= 30) return { pct: 100 - topPct, label: `Bottom ${100 - topPct}%`, isTop: false };
    return { pct: topPct, label: `Top ${topPct}%`, isTop: true };
  };

  const getVolatilityLabel = (vol: number | null): { label: string; color: string } => {
    if (vol == null) return { label: "Unknown", color: "text-neutral-500" };
    if (vol < 12) return { label: "Low", color: "text-emerald-400" };
    if (vol < 22) return { label: "Medium", color: "text-yellow-400" };
    return { label: "High", color: "text-red-400" };
  };

  const getSeasonAvgTier = (avg: number | null, allAvgs: number[]): string => {
    if (avg == null || allAvgs.length === 0) return "";
    const sorted = [...allAvgs].sort((a, b) => b - a);
    const idx = sorted.findIndex(v => v <= avg);
    const pct = idx === -1 ? 0 : (idx / sorted.length) * 100;
    if (pct <= 10) return "Elite";
    if (pct <= 25) return "Strong";
    if (pct <= 50) return "Average";
    return "Risky";
  };

  const getTierColor = (tier: string) => {
    if (tier === "Elite") return "text-[#F5C84C]";
    if (tier === "Strong") return "text-emerald-400";
    if (tier === "Average") return "text-neutral-400";
    return "text-red-400";
  };

  const getRecommendation = (player: AIPlayerSummary): { label: string; color: string; bg: string; border: string } => {
    const expected = player.expected_fantasy ?? player.season_avg ?? 0;
    const consistency = player.consistency_score ?? 0;
    const delta = player.matchup_delta ?? 0;
    if (expected >= 100 && consistency >= 7 && delta >= 0) return { label: "Must Start", color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-400/30" };
    if (expected >= 85 && consistency >= 5) return { label: "Strong Play", color: "text-[#F5C84C]", bg: "bg-yellow-400/10", border: "border-yellow-400/30" };
    if (consistency < 4 || delta < -10) return { label: "Avoid", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-400/30" };
    return { label: "Risky Play", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-400/30" };
  };

  const getMatchupDisplay = (player: AIPlayerSummary): { label: string; color: string; deltaText: string | null } => {
    const label = player.matchup_label ?? null;
    const delta = player.matchup_delta ?? null;
    if (label === "Easy" || (delta !== null && delta >= 5)) return {
      label: "Easy",
      color: "text-emerald-400",
      deltaText: delta !== null ? `+${Math.round(delta)}% vs avg` : null,
    };
    if (label === "Hard" || (delta !== null && delta <= -5)) return {
      label: "Hard",
      color: "text-red-400",
      deltaText: delta !== null ? `${Math.round(delta)}% vs avg` : null,
    };
    return {
      label: "Neutral",
      color: "text-yellow-400",
      deltaText: delta !== null ? `${delta >= 0 ? "+" : ""}${Math.round(delta)}% vs avg` : null,
    };
  };

  const parseSummaryLines = (summary: string | null): { paragraph: string; outlook: string; upside: string; risk: string } | null => {
    if (!summary) return null;
    const hasOutlook = /Outlook\s*:/i.test(summary);
    const hasUpside = /Upside\s*:/i.test(summary);
    const hasRisk = /Risk\s*:/i.test(summary);
    if (!hasOutlook && !hasUpside && !hasRisk) return null;

    const firstSectionIdx = summary.search(/(?:Outlook|Upside|Risk)\s*:/i);
    const paragraph = firstSectionIdx > 0 ? summary.slice(0, firstSectionIdx).trim() : "";

    const extractSection = (key: string): string => {
      const pattern = new RegExp(`${key}\\s*:\\s*([\\s\\S]*?)(?=(?:Outlook|Upside|Risk)\\s*:|$)`, "i");
      const match = summary.match(pattern);
      return match?.[1]?.trim() ?? "";
    };

    return {
      paragraph,
      outlook: extractSection("Outlook"),
      upside: extractSection("Upside"),
      risk: extractSection("Risk"),
    };
  };

  const getConfidenceLevel = (consistency: number | null) => {
    if (consistency == null) return null;
    if (consistency >= 7) return { label: "High", badgeClass: "bg-green-500/10 text-green-400 border-green-400/30", color: "text-green-400" };
    if (consistency >= 4) return { label: "Medium", badgeClass: "bg-yellow-500/10 text-yellow-400 border-yellow-400/30", color: "text-yellow-400" };
    return { label: "Low", badgeClass: "bg-red-500/10 text-red-400 border-red-400/30", color: "text-red-400" };
  };

  const calcPercentile = (avg: number | null) => {
    if (avg == null) return null;
    return Math.min(99, Math.round((avg / 140) * 100));
  };

  const isPreseason = (ctx: string | null | undefined) =>
    ctx === "PRESEASON_2025_BASELINE" || (!!ctx && ctx.includes("2025"));

  useEffect(() => {
    async function loadMatchSummaries() {
      const { data: roundData } = await supabase
        .from("v_ai_match_predictions_preview")
        .select("round_number")
        .order("round_number", { ascending: true })
        .limit(1);

      const currentRound = (roundData as Array<{ round_number: number }>)?.[0]?.round_number ?? 0;

      if (isPremium) {
        const { data } = await supabase
          .schema("afl")
          .from("ai_match_predictions")
          .select("match_id, home_team, away_team, round_number, season, predicted_home_score, predicted_away_score, predicted_margin, confidence, ai_summary, prediction_explanation, updated_at")
          .eq("season", 2026)
          .eq("round_number", currentRound)
          .order("match_id", { ascending: true })
          .limit(10);
        setMatchSummaries((data as AIMatchPrediction[]) || []);
      } else {
        const { data: previewData } = await supabase
          .from("v_ai_match_predictions_preview")
          .select("match_id, home_team, away_team, round_number, season, predicted_home_score, predicted_away_score, predicted_margin, confidence, updated_at")
          .eq("round_number", currentRound)
          .order("match_id", { ascending: true })
          .limit(10);

        const { data: freeData } = await supabase
          .schema("afl")
          .from("ai_match_predictions")
          .select("match_id, ai_summary, prediction_explanation")
          .eq("season", 2026)
          .in("match_id", FREE_MATCH_IDS);

        const freeMap = new Map<number, { ai_summary: string | null; prediction_explanation: string | null }>(
          (freeData || []).map((m: { match_id: number; ai_summary: string | null; prediction_explanation: string | null }) => [m.match_id, m])
        );

        const merged = (previewData || []).map((m: Partial<AIMatchPrediction>) => {
          const free = freeMap.get(m.match_id!);
          return {
            ...m,
            ai_summary: free?.ai_summary ?? null,
            prediction_explanation: free?.prediction_explanation ?? null,
          };
        }) as AIMatchPrediction[];

        setMatchSummaries(merged);
      }
    }
    loadMatchSummaries();
  }, [isPremium]);

  const cleanSummary = (summary: string | null): string => {
    if (!summary) return "";
    return summary
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
  };

  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-black/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-yellow-400/40 bg-yellow-400/10 text-yellow-200 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                AI Insights
              </div>
              {isPremium && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-400/60 bg-amber-400/20 text-amber-200 text-xs font-semibold uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5" />
                  Neeko+ Active
                </div>
              )}
            </div>

            <nav className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => scrollToSection("player")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeSection === "player"
                    ? "bg-yellow-400/20 text-yellow-200 border border-yellow-400/40"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Target className="h-4 w-4" />
                Player Deep Dive
              </button>
              <button
                onClick={() => scrollToSection("team")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeSection === "team"
                    ? "bg-yellow-400/20 text-yellow-200 border border-yellow-400/40"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Users className="h-4 w-4" />
                Team Analysis
              </button>
              <button
                onClick={() => scrollToSection("match")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeSection === "match"
                    ? "bg-yellow-400/20 text-yellow-200 border border-yellow-400/40"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <TrendingUp className="h-4 w-4" />
                Match Projections
              </button>
            </nav>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-12 space-y-16">
        <header className="text-center max-w-3xl mx-auto space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">AFL AI Insights</h1>
          <p className="text-lg text-white/60">
            Deep analytical intelligence powered by advanced metrics. Search any player or select a team to explore AI-driven insights.
          </p>
        </header>

        {/* SECTION 1: Player Deep Dive */}
        <div ref={playerSectionRef} className="scroll-mt-24 space-y-8">
          {/* Section header — Info icon at this level so panel is never clipped */}
          <div className="relative flex items-center gap-3 pb-4 border-b border-white/10">
            <Target className="h-6 w-6 text-yellow-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold">Player Deep Dive</h2>
              <p className="text-sm text-white/60 mt-1">
                Search any AFL player to view detailed AI analysis and projections
              </p>
            </div>
            {selectedPlayer && (
              <button
                onClick={() => setSelectedPlayer(null)}
                className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Clear
              </button>
            )}
          </div>

          {/* Opening Round feature highlight */}
          <div
            className="rounded-xl px-5 py-4 flex items-center gap-4"
            style={{
              background: "linear-gradient(135deg, rgba(245,200,76,0.12) 0%, rgba(245,150,30,0.06) 100%)",
              border: "1px solid rgba(245,200,76,0.25)",
              boxShadow: "0 0 24px rgba(245,200,76,0.06)",
            }}
          >
            <div
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(245,200,76,0.15)", border: "1px solid rgba(245,200,76,0.3)" }}
            >
              <Sparkles className="h-4 w-4 text-[#F5C84C]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F5C84C] leading-tight">Opening Round 2026 — Live Projections</p>
              <p className="text-xs text-white/45 mt-0.5 leading-relaxed">
                AI projections for all 780 Opening Round players, powered by 2025 performance baselines. Updates automatically as games are played.
              </p>
            </div>
          </div>

          {/* Team Filter Pills */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-500" />
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Filter by Team</span>
              {selectedPlayerTeam && (
                <button
                  onClick={() => { setSelectedPlayerTeam(null); setPlayerSearch(""); }}
                  className="ml-auto text-xs text-neutral-500 hover:text-white transition-colors"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {allPlayerTeams.map((team) => {
                const isSelected = selectedPlayerTeam === team;
                return (
                  <button
                    key={team}
                    onClick={() => {
                      setSelectedPlayerTeam(isSelected ? null : team);
                      setPlayerSearch("");
                      setSelectedPlayer(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 ${
                      isSelected
                        ? "bg-yellow-400/20 border-yellow-400/60 text-yellow-200"
                        : "bg-white/5 border-white/10 hover:border-white/25 text-white/70 hover:text-white"
                    }`}
                  >
                    {team}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Player Dropdown Selector — shown when a team filter is active and no search query */}
          {selectedPlayerTeam && !playerSearch && (
            <PlayerSelectorDropdown
              teamName={selectedPlayerTeam}
              players={teamPlayers}
              isPremium={isPremium}
              loading={teamPlayersLoading}
              onSelect={handleSearchResultClick}
            />
          )}

          {/* Player Search */}
          <div className="rounded-xl border border-white/10 bg-[#0b0b0b] p-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={selectedPlayerTeam ? `Search ${selectedPlayerTeam} players...` : "Search any AFL player (eg Marcus Bontempelli, Patrick Cripps, Nick Daicos)"}
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                onKeyDown={handleKeyDown}
                className={`w-full pl-12 pr-4 py-4 bg-white/5 border rounded-lg text-white text-sm placeholder:text-neutral-600 focus:outline-none transition-all duration-150 ${
                  searchFocused
                    ? "border-[#F5C84C]/60 ring-1 ring-[#F5C84C]/40 shadow-[0_0_0_1px_rgba(245,200,76,0.25)]"
                    : "border-white/10"
                }`}
              />
            </div>
            <p className="text-xs text-neutral-500 mt-2 ml-1">
              {selectedPlayerTeam ? `Searching within ${selectedPlayerTeam}` : "Search across all AFL players using Neeko AI projections"}
            </p>

            {playerSearch && (
              <div
                ref={dropdownRef}
                className="mt-2 rounded-xl overflow-hidden border border-[#2a2a2a] bg-[#0b0b0b] shadow-2xl"
                style={{ boxShadow: "0 0 0 1px rgba(245,200,76,0.15), 0 20px 60px rgba(0,0,0,0.8)" }}
              >
                {searchLoading ? (
                  <div className="px-4 py-5 text-center text-xs text-neutral-500 animate-pulse tracking-wide">
                    Loading players...
                  </div>
                ) : searchResults.length > 0 ? (
                  <div>
                    {searchResults.map((proj, idx) => {
                      const isHighlighted = idx === highlightedIndex;
                      const isResultLocked = !isPremium && !(FREE_PLAYER_IDS_BY_TEAM[proj.team]?.includes(proj.player_id) ?? false);
                      return (
                        <button
                          key={proj.player_id}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => handleSearchResultClick(proj)}
                          className={`w-full flex items-center justify-between px-4 py-3 cursor-pointer transition-all duration-150 text-left border-l-2 ${
                            isHighlighted
                              ? "bg-[#1a1a1a] border-[#F5C84C]"
                              : "bg-transparent border-transparent hover:bg-[#151515] hover:border-[#F5C84C]/40"
                          }`}
                        >
                          <div className="flex items-center flex-wrap gap-x-1">
                            <span className="text-sm font-semibold text-white">{proj.player_name}</span>
                            <span className="text-xs text-neutral-400 ml-1">{proj.team}</span>
                            {!isResultLocked && proj.final_projection != null && (
                              <span className="text-xs text-[#F5C84C] font-medium ml-1">
                                · {Number(proj.final_projection).toFixed(0)} proj.
                              </span>
                            )}
                            {isResultLocked && (
                              <span className="inline-flex items-center gap-1 text-xs text-[#F5C84C]/70 ml-1 font-medium">
                                <Lock className="h-3 w-3" />
                                Neeko+
                              </span>
                            )}
                          </div>
                          <ChevronRight
                            className={`h-4 w-4 flex-shrink-0 ml-3 transition-colors duration-150 ${
                              isHighlighted ? "text-[#F5C84C]" : "text-neutral-600"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-center text-sm text-neutral-500">
                    No players found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Player Analysis Card */}
          <div className={selectedPlayer ? "-mt-2" : ""}>
          {selectedPlayer ? (() => {
            const isLockedPlayer = !isPremium && !(FREE_PLAYER_IDS_BY_TEAM[selectedPlayer.team]?.includes(selectedPlayer.player_id) ?? false);
            const conf = getConfidenceLevel(selectedPlayer.consistency_score);
            const matchup = getMatchupDisplay(selectedPlayer);
            const consistencyPct = getConsistencyPercentile(selectedPlayer.consistency_score);
            const volDisplay = getVolatilityLabel(selectedPlayer.volatility ?? null);
            const percentile = calcPercentile(selectedPlayer.season_avg);
            const allSeasonAvgs = allTeamFeatures.map(t => t.season_avg ?? 0).filter(v => v > 0);
            const tier = getSeasonAvgTier(selectedPlayer.season_avg, allSeasonAvgs);
            const tierColor = getTierColor(tier);
            const recommendation = getRecommendation(selectedPlayer);
            const summaryLines = parseSummaryLines(selectedPlayer.ai_summary);

            const consistencyColor = selectedPlayer.consistency_score != null
              ? selectedPlayer.consistency_score >= 7
                ? "text-emerald-400"
                : selectedPlayer.consistency_score >= 4
                  ? "text-yellow-400"
                  : "text-red-400"
              : "text-[#F5C84C]";

            const confTooltipText = conf?.label === "High"
              ? "Consistent scoring, low volatility"
              : conf?.label === "Medium"
                ? "Moderate scoring variance"
                : "High volatility, unpredictable";

            return (
              <div
                className="relative rounded-xl border border-yellow-400/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(245,200,76,0.15)]"
                style={{
                  background: "linear-gradient(180deg, rgba(245,200,76,0.08) 0%, rgba(245,200,76,0.04) 100%)",
                  opacity: cardVisible ? 1 : 0,
                  transform: cardVisible ? "translateY(0)" : "translateY(10px)",
                  transition: "opacity 300ms ease, transform 300ms ease, box-shadow 300ms ease",
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
                  style={{ background: "linear-gradient(90deg, transparent, #F5C84C, transparent)" }}
                />

                <div className="pt-4 md:pt-8 px-4 md:px-8 pb-4 md:pb-6 space-y-4 md:space-y-6">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#F5C84C]/70 uppercase tracking-widest mb-2">
                        Player Fantasy Projection
                        {isLockedPlayer && <Lock className="h-3 w-3 text-[#F5C84C]" />}
                      </div>
                      <h3 className="text-2xl md:text-3xl font-bold text-white">{selectedPlayer.player}</h3>
                      <div className="text-sm text-neutral-300 mt-0.5">{selectedPlayer.team}</div>
                      {selectedPlayer.opponent && (
                        <div className="text-sm font-semibold text-[#F5C84C]/80 mt-1">
                          vs {selectedPlayer.opponent}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {!isLockedPlayer && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${recommendation.color} ${recommendation.bg} ${recommendation.border}`}>
                          {recommendation.label}
                        </span>
                      )}
                      <button
                        onClick={() => setSelectedPlayer(null)}
                        className="text-xs text-neutral-500 hover:text-white transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <PremiumGate isLocked={isLockedPlayer} mode="solid">
                  <>
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    {/* Season Average */}
                    <div className="flex flex-col items-start">
                      <div className="text-xs text-neutral-400">Season Average</div>
                      <div
                        className="text-2xl md:text-4xl font-bold text-[#F5C84C] mt-1"
                        style={{ transition: "transform 300ms ease", transform: projScaled ? "scale(1.05)" : "scale(1)" }}
                      >
                        {selectedPlayer.season_avg != null ? Number(selectedPlayer.season_avg).toFixed(1) : "—"}
                      </div>
                      {tier && (
                        <div className={`text-xs font-semibold mt-1 ${tierColor}`}>
                          Tier: {tier}
                        </div>
                      )}
                      {percentile != null && (
                        <>
                          <div className="text-xs text-neutral-500 mt-1">{percentile}th percentile</div>
                          <div className="w-full max-w-[180px] mt-1.5 h-[5px] rounded-full bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#F5C84C] transition-all duration-500"
                              style={{ width: `${percentile}%` }}
                            />
                          </div>
                        </>
                      )}
                      {selectedPlayer.trend_direction && (
                        <div className={`text-xs mt-2 ${selectedPlayer.trend_direction === "up" ? "text-emerald-400" : selectedPlayer.trend_direction === "down" ? "text-red-400" : "text-neutral-500"}`}>
                          {selectedPlayer.trend_direction === "up" ? "↑ Trending up" : selectedPlayer.trend_direction === "down" ? "↓ Trending down" : "→ Stable"}
                        </div>
                      )}
                    </div>

                    {/* Consistency Score — centre */}
                    <div className="flex flex-col items-start md:items-center">
                      <div className="text-xs text-neutral-400">Consistency Score</div>
                      <div
                        className={`text-2xl md:text-[2.75rem] font-bold mt-1 ${consistencyColor}`}
                        style={{ transition: "transform 300ms ease", transform: projScaled ? "scale(1.05)" : "scale(1)" }}
                      >
                        {selectedPlayer.consistency_score != null ? `${selectedPlayer.consistency_score}/10` : "—"}
                      </div>
                      {consistencyPct && (
                        <div className={`text-xs font-semibold mt-0.5 ${consistencyPct.isTop ? "text-emerald-400" : "text-neutral-400"}`}>
                          {consistencyPct.label} in AFL
                        </div>
                      )}
                      {selectedPlayer.consistency_score != null && (
                        <div className="w-full max-w-[180px] mt-1.5 h-[5px] rounded-full bg-neutral-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              selectedPlayer.consistency_score >= 7
                                ? "bg-emerald-400"
                                : selectedPlayer.consistency_score >= 4
                                  ? "bg-yellow-400"
                                  : "bg-red-400"
                            }`}
                            style={{ width: `${selectedPlayer.consistency_score * 10}%` }}
                          />
                        </div>
                      )}
                      <div className={`text-xs mt-1.5 font-medium ${volDisplay.color}`}>
                        Volatility: {volDisplay.label}
                      </div>
                      <div className="text-xs text-neutral-600 mt-0.5">
                        {isPreseason(selectedPlayer.season_context) ? "Pre-season projection" : "2026 season"}
                      </div>
                    </div>

                    {/* Ceiling Potential */}
                    <div className="flex flex-col items-start md:items-end md:text-right">
                      <div className="text-xs text-neutral-400">Ceiling Potential</div>
                      <div
                        className="text-2xl md:text-4xl font-bold text-[#F5C84C] mt-1"
                        style={{ transition: "transform 300ms ease", transform: projScaled ? "scale(1.05)" : "scale(1)" }}
                      >
                        {selectedPlayer.ceiling_fantasy != null ? `${Number(selectedPlayer.ceiling_fantasy).toFixed(0)}+` : "—"}
                      </div>
                      <div className="text-xs text-neutral-500 mt-1.5">
                        Floor: {selectedPlayer.floor_fantasy != null ? Number(selectedPlayer.floor_fantasy).toFixed(0) : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Matchup + Recommendation Row */}
                  <div className="flex items-center gap-6 pt-1">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-neutral-500">Matchup</span>
                      <span className={`text-sm font-bold ${matchup.color}`}>{matchup.label}</span>
                      {matchup.deltaText && (
                        <span className={`text-xs ${matchup.color} opacity-75`}>{matchup.deltaText}</span>
                      )}
                    </div>
                    {conf && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-neutral-500">Confidence</span>
                        <div className="relative group">
                          <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase tracking-wide cursor-default ${conf.badgeClass}`}>
                            {conf.label}
                          </span>
                          <div
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg p-3 text-xs text-neutral-300 leading-relaxed opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50"
                            style={{ background: "#0b0b0b", boxShadow: "0 0 0 1px rgba(245,200,76,0.2), 0 8px 24px rgba(0,0,0,0.9)" }}
                          >
                            <span className={`font-semibold ${conf.color}`}>{conf.label} confidence</span>
                            <br />
                            {confTooltipText}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Summary Section */}
                  <div className="space-y-4 pt-4 border-t border-[#F5C84C]/15">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-white">AI Insights Summary</h4>
                      <div className="relative">
                        {selectedPlayer.ai_summary && (
                        <button
                          onMouseEnter={() => setShowTransparency(true)}
                          onMouseLeave={() => setShowTransparency(false)}
                          className="p-1.5 text-neutral-500 hover:text-[#F5C84C] transition-colors duration-150"
                          aria-label="How this projection was generated"
                        >
                          <Info className="h-[18px] w-[18px]" />
                        </button>
                        )}
                        {showTransparency && (
                          <div
                            className="absolute right-0 top-7 z-50 w-80 rounded-xl p-4 border border-[#F5C84C]/40"
                            style={{ background: "#0b0b0b", boxShadow: "0 0 0 1px rgba(245,200,76,0.2), 0 20px 60px rgba(0,0,0,0.95)" }}
                            onMouseEnter={() => setShowTransparency(true)}
                            onMouseLeave={() => setShowTransparency(false)}
                          >
                            <p className="text-sm font-semibold text-[#F5C84C] mb-3">
                              {selectedPlayer.player} — Projection Data
                            </p>
                            <ul className="space-y-2 text-xs text-neutral-400">
                              {selectedPlayer.season_avg != null && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Season avg: <span className="text-white">{Number(selectedPlayer.season_avg).toFixed(1)}</span></span></li>
                              )}
                              {selectedPlayer.ceiling_fantasy != null && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Ceiling: <span className="text-white">{Number(selectedPlayer.ceiling_fantasy).toFixed(0)}</span></span></li>
                              )}
                              {selectedPlayer.floor_fantasy != null && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Floor: <span className="text-white">{Number(selectedPlayer.floor_fantasy).toFixed(0)}</span></span></li>
                              )}
                              {selectedPlayer.consistency_score != null && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Consistency: <span className="text-white">{selectedPlayer.consistency_score}/10</span></span></li>
                              )}
                              {selectedPlayer.volatility != null && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Volatility: <span className={volDisplay.color}>{volDisplay.label} ({selectedPlayer.volatility.toFixed(1)})</span></span></li>
                              )}
                              {selectedPlayer.trend_direction && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Trend: <span className={selectedPlayer.trend_direction === "up" ? "text-emerald-400" : selectedPlayer.trend_direction === "down" ? "text-red-400" : "text-white"}>{selectedPlayer.trend_direction === "up" ? "Improving" : selectedPlayer.trend_direction === "down" ? "Declining" : "Stable"}</span></span></li>
                              )}
                              {percentile != null && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Projection percentile: <span className="text-white">{percentile}th</span></span></li>
                              )}
                              <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Matchup: <span className={matchup.color}>{matchup.label}</span></span></li>
                              {isPreseason(selectedPlayer.season_context) && (
                                <li className="flex items-start gap-2"><span className="text-[#F5C84C]/50 mt-0.5">•</span><span>Based on <span className="text-white">2025 baseline data</span></span></li>
                              )}
                            </ul>
                            {conf && (
                              <div className="mt-3 pt-3 border-t border-[#1e1e1e] flex items-center gap-2">
                                <span className="text-xs text-neutral-500">AI Confidence:</span>
                                <span className={`text-xs font-semibold ${conf.color}`}>{conf.label}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Structured AI Summary */}
                    <div className="space-y-3 text-sm leading-relaxed">
                      {selectedPlayer.ai_summary ? (
                        <>
                          {summaryLines ? (
                            <div className="space-y-4">
                              {summaryLines.paragraph && (
                                <p className="text-white/80 leading-relaxed">{summaryLines.paragraph}</p>
                              )}
                              <div className="space-y-3 pt-1">
                                {summaryLines.outlook && (
                                  <div
                                    className="rounded-lg px-4 py-3"
                                    style={{ background: "rgba(245,200,76,0.06)", border: "1px solid rgba(245,200,76,0.15)" }}
                                  >
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-[#F5C84C]/70 mb-1">Outlook</div>
                                    <p className="text-white/80 text-sm leading-relaxed">{summaryLines.outlook}</p>
                                  </div>
                                )}
                                {summaryLines.upside && (
                                  <div
                                    className="rounded-lg px-4 py-3"
                                    style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)" }}
                                  >
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-1">Upside</div>
                                    <p className="text-white/80 text-sm leading-relaxed">{summaryLines.upside}</p>
                                  </div>
                                )}
                                {summaryLines.risk && (
                                  <div
                                    className="rounded-lg px-4 py-3"
                                    style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}
                                  >
                                    <div className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-1">Risk</div>
                                    <p className="text-white/80 text-sm leading-relaxed">{summaryLines.risk}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-white/80">{selectedPlayer.ai_summary}</p>
                          )}
                          {isPremium && (
                            <div className="pt-4 border-t border-[#F5C84C]/15">
                              <p className="text-amber-200 text-sm leading-relaxed">
                                <strong>Neeko+ Exclusive:</strong> Monitor injury reports and team selection in the 24h window before game day. Floor of {selectedPlayer.floor_fantasy != null ? Number(selectedPlayer.floor_fantasy).toFixed(0) : "N/A"} provides strong downside protection.
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div
                          className="rounded-xl p-5"
                          style={{ background: "rgba(245,200,76,0.04)", border: "1px solid rgba(245,200,76,0.12)" }}
                        >
                          <PremiumGateCTA />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end pt-2">
                    <span className="text-xs text-neutral-700">Powered by Neeko AI</span>
                  </div>
                  </>
                  </PremiumGate>
                </div>
              </div>
            );
          })() : (
            <div className="rounded-xl border border-white/10 bg-[#0b0b0b] py-12 text-center">
              <Target className="h-10 w-10 text-neutral-700 mx-auto mb-4" />
              <p className="text-sm text-neutral-500">Search any AFL player above to unlock AI analysis</p>
            </div>
          )}
          </div>
        </div>

        {/* SECTION 2: Team Analysis */}
        <div ref={teamSectionRef} className="scroll-mt-24 space-y-8">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <Users className="h-6 w-6 text-yellow-400" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold">Team Analysis</h2>
              <p className="text-sm text-white/60 mt-1">
                Select any AFL team to explore season trends, tactical insights, and projections
              </p>
            </div>
            {selectedTeam && (
              <button
                onClick={() => setSelectedTeam("")}
                className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Clear
              </button>
            )}
          </div>

          {/* Team Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {teams.map((team) => {
              const isLocked = !isPremium && !FREE_TEAM_NAMES.includes(team);
              return (
                <button
                  key={team}
                  onClick={() => setSelectedTeam(selectedTeam === team ? "" : team)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedTeam === team
                      ? "bg-yellow-400/20 border-yellow-400/60 text-yellow-200"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-sm leading-tight">{team}</span>
                    {isLocked && <Lock className="h-3 w-3 text-[#F5C84C] flex-shrink-0" />}
                  </div>
                  {selectedTeam === team && (
                    <div className="text-xs text-yellow-400/70 mt-0.5">Viewing</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Team AI Summary Card */}
          {selectedTeam && (
            <div
              className="relative rounded-xl border border-yellow-400/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(245,200,76,0.15)]"
              style={{
                background: "linear-gradient(180deg, rgba(245,200,76,0.08) 0%, rgba(245,200,76,0.04) 100%)",
                boxShadow: "0 0 25px rgba(245,200,76,0.18)",
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
                style={{ background: "linear-gradient(90deg, transparent, #F5C84C, transparent)" }}
              />
              <div className="pt-8 px-8 pb-6 space-y-6">

                {/* Card Header */}
                {(() => {
                  const isLockedTeam = !isPremium && !FREE_TEAM_NAMES.includes(selectedTeam);
                  return (
                    <>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#F5C84C]/70 uppercase tracking-widest mb-2">
                          Team Fantasy Projection
                          {isLockedTeam && <Lock className="h-3 w-3 text-[#F5C84C]" />}
                        </div>
                        <h3 className="text-2xl font-bold text-white">{selectedTeam}</h3>
                        {!isLockedTeam && teamSummary && (
                          <div className="text-xs text-neutral-500 mt-1">
                            {teamSummary.season} Season · Round {teamSummary.round_number}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {!isLockedTeam && teamSummary?.fantasy_verdict && (
                          <FantasyVerdictBadge verdict={teamSummary.fantasy_verdict} />
                        )}
                        {!isLockedTeam && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-yellow-400/30 bg-yellow-400/10 text-yellow-300 text-xs font-semibold">
                            <Sparkles className="h-3 w-3" />
                            AI Generated
                          </div>
                        )}
                        {!isLockedTeam && neekoRating !== null && (
                          <div className="flex flex-col items-end gap-0.5 mt-1">
                            <div className="text-xs text-neutral-500">Neeko Rating</div>
                            <div className="font-bold text-2xl text-[#F5C84C] leading-none">{neekoRating}</div>
                            <div className="text-xs text-neutral-600">League avg = 100</div>
                          </div>
                        )}
                      </div>
                    </div>

                    </>
                  );
                })()}

                {/* Intelligence stats — blurred when locked */}
                <PremiumGate isLocked={!isPremium && !FREE_TEAM_NAMES.includes(selectedTeam)}>
                <>
                {/* Intelligence Header Row */}
                {teamSummary && !loadingTeam && (() => {
                  const rnd = teamSummary.round_number ?? 0;

                  const confRaw = teamFeatures?.confidence_bucket ?? null;
                  const confLabel = confRaw === "HIGH" || confRaw === "MEDIUM" || confRaw === "LOW"
                    ? confRaw
                    : rnd >= 15 ? "HIGH" : rnd >= 7 ? "MEDIUM" : "LOW";
                  const confBadgeClass = confLabel === "HIGH"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-400/30"
                    : confLabel === "MEDIUM"
                      ? "bg-yellow-500/10 text-yellow-400 border border-yellow-400/30"
                      : "bg-red-500/10 text-red-400 border border-red-400/30";
                  const confidenceDescriptions: Record<string, string> = {
                    LOW: "High volatility creates unreliable fantasy output.",
                    MEDIUM: "Moderate volatility creates some scoring uncertainty.",
                    HIGH: "Consistent scoring profile with strong reliability.",
                  };
                  const confDescription = confidenceDescriptions[confLabel] ?? confidenceDescriptions["MEDIUM"];

                  const seasonAvg = teamFeatures?.season_avg ?? null;
                  const recentAvg = teamFeatures?.last_5_avg ?? null;
                  const projectedScore = teamFeatures?.predicted_score ?? null;
                  const floorVal = teamFeatures?.floor ?? null;
                  const ceilingVal = teamFeatures?.ceiling ?? null;
                  const stdev = teamFeatures?.stdev_last_10 ?? null;

                  const trendingUp = recentAvg !== null && seasonAvg !== null && recentAvg > seasonAvg;
                  const volLabel = stdev !== null
                    ? stdev < 15 ? "Low" : stdev < 30 ? "Medium" : "High"
                    : rnd >= 15 ? "Low" : rnd >= 7 ? "Medium" : "High";
                  const volColor = volLabel === "Low" ? "text-emerald-400" : volLabel === "Medium" ? "text-yellow-400" : "text-red-400";

                  const fmt = (v: number | null) => v !== null ? Math.round(v).toString() : "—";

                  // League rank and percentile from all teams
                  const teamsWithProj = allTeamFeatures
                    .filter(t => t.predicted_score !== null)
                    .sort((a, b) => (b.predicted_score ?? 0) - (a.predicted_score ?? 0));
                  const totalRanked = teamsWithProj.length;
                  const rankPos = projectedScore !== null && totalRanked > 0
                    ? teamsWithProj.findIndex(t => t.team === selectedTeam) + 1
                    : null;
                  const effectiveRank = rankPos && rankPos > 0 ? rankPos : null;
                  const percentile = effectiveRank && totalRanked > 0
                    ? Math.round(((totalRanked - effectiveRank) / totalRanked) * 100)
                    : null;

                  // Matchup advantage: compare selected team's opponent avg allowed vs league avg
                  // Derived from stdev as a proxy: lower stdev = more predictable = neutral/favorable
                  const matchupAdvantage = stdev !== null
                    ? stdev < 18 ? "Favorable" : stdev < 32 ? "Neutral" : "Difficult"
                    : null;
                  const matchupColor = matchupAdvantage === "Favorable"
                    ? "text-emerald-400"
                    : matchupAdvantage === "Neutral"
                      ? "text-yellow-400"
                      : "text-red-400";

                  // Trend sparkline: last 5 avg vs season avg — compute 5 synthetic values
                  const sparkBars: number[] = (() => {
                    if (recentAvg === null || seasonAvg === null) return [];
                    const delta = recentAvg - seasonAvg;
                    return [
                      Math.max(2, Math.min(24, 12 + delta * 0.2 - 2)),
                      Math.max(2, Math.min(24, 12 + delta * 0.4 - 1)),
                      Math.max(2, Math.min(24, 12 + delta * 0.6)),
                      Math.max(2, Math.min(24, 12 + delta * 0.8 + 1)),
                      Math.max(2, Math.min(24, 12 + delta * 1.0 + 2)),
                    ];
                  })();

                  return (
                    <>
                      <div className="grid grid-cols-6 gap-6 mt-2 items-start">
                        {/* Season Average */}
                        <div className="flex flex-col gap-1 hover:scale-[1.02] transition-all duration-300 cursor-default">
                          <div className="text-xs text-neutral-500">Season Average</div>
                          <div className="text-lg font-semibold text-white">{fmt(seasonAvg)}</div>
                          <div className="text-xs text-neutral-600 mt-0.5">pts</div>
                        </div>

                        {/* Recent Average + sparkline */}
                        <div className="flex flex-col gap-1 hover:scale-[1.02] transition-all duration-300 cursor-default">
                          <div className="text-xs text-neutral-500">Recent Average</div>
                          <div className="text-lg font-semibold text-white">{fmt(recentAvg)}</div>
                          {recentAvg !== null && seasonAvg !== null ? (
                            <div className={`text-xs font-medium mt-0.5 ${trendingUp ? "text-emerald-400" : "text-red-400"}`}>
                              {trendingUp ? "↑ Trending up" : "↓ Trending down"}
                            </div>
                          ) : (
                            <div className="text-xs text-neutral-600 mt-0.5">pts</div>
                          )}
                          {sparkBars.length > 0 && (
                            <div className="flex items-end gap-[3px] h-[20px] mt-1">
                              {sparkBars.map((h, i) => (
                                <div
                                  key={i}
                                  className="w-[4px] rounded-sm bg-[#F5C84C] opacity-80"
                                  style={{ height: `${h}px` }}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Projected Score + league rank + percentile bar */}
                        <div className="flex flex-col gap-1 hover:scale-[1.02] transition-all duration-300 cursor-default">
                          <div className="text-xs text-neutral-500">Projected Score</div>
                          <div className="text-lg font-semibold text-[#F5C84C]">{fmt(projectedScore)}</div>
                          {effectiveRank !== null && totalRanked > 0 && (
                            <div className="text-xs text-neutral-400 mt-0.5">#{effectiveRank} offense</div>
                          )}
                          {percentile !== null && (
                            <div className="mt-1.5 space-y-1">
                              <div className="w-[80px] h-[4px] bg-neutral-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#F5C84C] to-yellow-400 transition-all duration-700 ease-out"
                                  style={{ width: `${percentile}%` }}
                                />
                              </div>
                              <div className="text-xs text-neutral-500">{percentile}th pct</div>
                            </div>
                          )}
                        </div>

                        {/* Floor */}
                        <div className="flex flex-col gap-1 hover:scale-[1.02] transition-all duration-300 cursor-default">
                          <div className="text-xs text-neutral-500">Floor</div>
                          <div className="text-lg font-semibold text-white">{fmt(floorVal)}</div>
                          <div className="text-xs text-neutral-600 mt-0.5">pts</div>
                        </div>

                        {/* Ceiling */}
                        <div className="flex flex-col gap-1 hover:scale-[1.02] transition-all duration-300 cursor-default">
                          <div className="text-xs text-neutral-500">Ceiling</div>
                          <div className="text-lg font-semibold text-white">{fmt(ceilingVal)}</div>
                          <div className="text-xs text-neutral-600 mt-0.5">pts</div>
                        </div>

                        {/* Volatility + matchup */}
                        <div className="flex flex-col gap-1 hover:scale-[1.02] transition-all duration-300 cursor-default">
                          <div className="text-xs text-neutral-500">Volatility</div>
                          <div className="text-lg font-semibold text-white">
                            {stdev !== null ? stdev.toFixed(1) : "—"}
                          </div>
                          <div className={`text-xs mt-0.5 ${volColor}`}>{volLabel}</div>
                          {matchupAdvantage !== null && (
                            <div className={`text-xs mt-1 font-medium ${matchupColor}`}>{matchupAdvantage}</div>
                          )}
                        </div>
                      </div>

                      {/* Confidence badge row */}
                      <div className="flex items-center gap-3 mt-1">
                        <div className="text-xs text-neutral-500">Confidence</div>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${confBadgeClass}`}>
                          {confLabel}
                        </span>
                        <span className="text-xs text-neutral-500">{confDescription}</span>
                      </div>

                      <div className="border-t border-neutral-800" />
                    </>
                  );
                })()}

                {/* AI Summary Narrative */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-white text-sm">AI Projection</h4>
                    <div className="relative">
                      <button
                        onMouseEnter={() => setShowTeamTransparency(true)}
                        onMouseLeave={() => setShowTeamTransparency(false)}
                        className="p-1.5 text-neutral-500 hover:text-[#F5C84C] transition-colors duration-150"
                        aria-label="How this projection was generated"
                      >
                        <Info className="h-[18px] w-[18px]" />
                      </button>

                      {showTeamTransparency && (() => {
                        const _rnd2 = teamSummary?.round_number ?? 0;
                        const _confLabel2 = teamFeatures?.confidence_bucket ?? (_rnd2 >= 15 ? "HIGH" : _rnd2 >= 7 ? "MEDIUM" : "LOW");
                        const _seasonAvg2 = teamFeatures?.season_avg ?? null;
                        const _recentAvg2 = teamFeatures?.last_5_avg ?? null;
                        const _proj2 = teamFeatures?.predicted_score ?? null;
                        const _floor2 = teamFeatures?.floor ?? null;
                        const _ceil2 = teamFeatures?.ceiling ?? null;
                        const _stdev2 = teamFeatures?.stdev_last_10 ?? null;
                        const _volLabel2 = _stdev2 !== null
                          ? _stdev2 < 15 ? "Low" : _stdev2 < 30 ? "Medium" : "High"
                          : "—";
                        return (
                          <div
                            className="absolute right-0 top-full mt-2 z-50 w-[320px] rounded-xl p-4 border border-[#F5C84C]/30"
                            style={{
                              background: "#0b0b0b",
                              boxShadow: "0 0 0 1px rgba(245,200,76,0.2), 0 20px 60px rgba(0,0,0,0.95)",
                            }}
                            onMouseEnter={() => setShowTeamTransparency(true)}
                            onMouseLeave={() => setShowTeamTransparency(false)}
                          >
                            <p className="text-sm font-semibold text-[#F5C84C] mb-3">
                              Neeko AI Team Projection Engine
                            </p>
                            <ul className="space-y-2 text-xs text-neutral-400">
                              {[
                                {
                                  label: "Season Average",
                                  value: _seasonAvg2 != null ? `${Math.round(_seasonAvg2)} pts` : "—",
                                },
                                {
                                  label: "Recent Average",
                                  value: _recentAvg2 != null ? `${Math.round(_recentAvg2)} pts` : "—",
                                },
                                {
                                  label: "Projected Score",
                                  value: _proj2 != null ? `${Math.round(_proj2)} pts` : "—",
                                },
                                {
                                  label: "Floor",
                                  value: _floor2 != null ? `${Math.round(_floor2)} pts` : "—",
                                },
                                {
                                  label: "Ceiling",
                                  value: _ceil2 != null ? `${Math.round(_ceil2)} pts` : "—",
                                },
                                {
                                  label: "Volatility",
                                  value: _stdev2 != null
                                    ? `${_stdev2.toFixed(1)} pts — ${_volLabel2}`
                                    : "—",
                                },
                                {
                                  label: "Confidence",
                                  value: _confLabel2,
                                },
                              ].map(({ label, value }) => (
                                <li key={label} className="flex items-start justify-between gap-2">
                                  <span className="flex items-start gap-2">
                                    <span className="text-[#F5C84C]/50 mt-0.5">•</span>
                                    <span>{label}</span>
                                  </span>
                                  <span className="text-white">{value}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3 pt-3 border-t border-[#1e1e1e] flex flex-col gap-0.5">
                              <span className="text-xs text-neutral-300 font-medium">Powered by Neeko AI</span>
                              <span className="text-xs text-neutral-600">Using official AFL statistics</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="text-sm text-white/80 leading-relaxed space-y-3">
                    {loadingTeam ? (
                      <p className="text-yellow-400/70 animate-pulse">Loading team intelligence...</p>
                    ) : teamSummaryError ? (
                      <p className="text-neutral-500 italic">Unable to load team summary right now.</p>
                    ) : teamSummary?.summary ? (
                      (() => {
                        const lines = parseSummaryLines(teamSummary.summary);
                        return lines ? (
                          <div className="space-y-4">
                            {lines.paragraph && (
                              <p className="text-white/80 leading-relaxed">{lines.paragraph}</p>
                            )}
                            <div className="space-y-3 pt-1">
                              {lines.outlook && (
                                <div
                                  className="rounded-lg px-4 py-3"
                                  style={{ background: "rgba(245,200,76,0.06)", border: "1px solid rgba(245,200,76,0.15)" }}
                                >
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#F5C84C]/70 mb-1">Outlook</div>
                                  <p className="text-white/80 text-sm leading-relaxed">{lines.outlook}</p>
                                </div>
                              )}
                              {lines.upside && (
                                <div
                                  className="rounded-lg px-4 py-3"
                                  style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)" }}
                                >
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/70 mb-1">Upside</div>
                                  <p className="text-white/80 text-sm leading-relaxed">{lines.upside}</p>
                                </div>
                              )}
                              {lines.risk && (
                                <div
                                  className="rounded-lg px-4 py-3"
                                  style={{ background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)" }}
                                >
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-red-400/70 mb-1">Risk</div>
                                  <p className="text-white/80 text-sm leading-relaxed">{lines.risk}</p>
                                </div>
                              )}
                            </div>
                            {teamSummary.season === 2025 && (
                              <p className="text-xs text-yellow-400/50 italic">Showing 2025 baseline summary (pre-season).</p>
                            )}
                          </div>
                        ) : (
                          <>
                            <p>{teamSummary.summary}</p>
                            {teamSummary.season === 2025 && (
                              <p className="text-xs text-yellow-400/50 italic">Showing 2025 baseline summary (pre-season).</p>
                            )}
                          </>
                        );
                      })()
                    ) : !FREE_TEAM_NAMES.includes(selectedTeam) && !isPremium ? (
                      <div
                        className="rounded-xl p-5"
                        style={{ background: "rgba(245,200,76,0.04)", border: "1px solid rgba(245,200,76,0.12)" }}
                      >
                        <PremiumGateCTA />
                      </div>
                    ) : (
                      <p className="text-neutral-500 italic">AI team summary will be generated after Opening Round.</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <span className="text-xs text-neutral-700">Powered by Neeko AI</span>
                </div>
                </>
                </PremiumGate>
              </div>
            </div>
          )}

          {!selectedTeam && (
            <div className="rounded-xl border border-white/10 bg-[#0b0b0b] p-12 text-center">
              <Users className="h-12 w-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/50">Select a team above to view their AI summary</p>
            </div>
          )}
        </div>

        {/* SECTION 3: Match Predictions */}
        <div ref={matchSectionRef} className="scroll-mt-24 space-y-8">
          <div className="flex items-center gap-3 pb-4 border-b border-white/10">
            <TrendingUp className="h-6 w-6 text-yellow-400" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold">Match Fantasy Projections</h2>
              <p className="text-sm text-white/60 mt-1">
                Select a match to access AI-powered predictions and analysis
              </p>
            </div>
            {selectedMatchId !== null && (
              <button
                onClick={() => setSelectedMatchId(null)}
                className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Clear
              </button>
            )}
          </div>

          {matchSummaries.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {matchSummaries.map((match) => {
                const isSelected = selectedMatchId === match.match_id;
                const isLocked = !isPremium && !FREE_MATCH_IDS.includes(match.match_id);
                return (
                  <div key={match.match_id}>
                    <button
                      onClick={() => setSelectedMatchId(isSelected ? null : match.match_id)}
                      className={`w-full p-4 rounded-lg border text-left transition-all duration-300 ${
                        isSelected
                          ? "bg-yellow-400/20 border-yellow-400/60 text-yellow-200 shadow-[0_0_25px_rgba(245,200,76,0.25)]"
                          : "bg-white/5 border-white/10 hover:border-[#F5C84C] hover:shadow-[0_0_25px_rgba(245,200,76,0.25)] text-white"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-white/50">Round {match.round_number}</div>
                          {isLocked && <Lock className="h-3 w-3 text-[#F5C84C] flex-shrink-0" />}
                        </div>
                        <div className="font-semibold text-sm leading-tight">
                          {match.home_team} vs {match.away_team}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#0b0b0b] p-8 text-center">
              <TrendingUp className="h-10 w-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/50 text-sm">Match predictions will appear here once generated</p>
            </div>
          )}

          {(() => {
            const match = matchSummaries.find((m) => m.match_id === selectedMatchId);
            if (!match) return null;

            const isLockedMatch = !isPremium && !FREE_MATCH_IDS.includes(match.match_id);
            const summary = cleanSummary(match.ai_summary);

            const homeScore = Math.round(match.predicted_home_score ?? 0);
            const awayScore = Math.round(match.predicted_away_score ?? 0);
            const combinedScore = homeScore + awayScore;
            const homeWinPct = combinedScore > 0
              ? Math.round((1.0 / (1.0 + Math.exp(-(homeScore - awayScore) / 15.0))) * 100)
              : 50;
            const awayWinPct = 100 - homeWinPct;
            const homeBarPct = Math.round((homeScore / Math.max(homeScore, awayScore, 1)) * 100);
            const awayBarPct = Math.round((awayScore / Math.max(homeScore, awayScore, 1)) * 100);

            const scoreDiff = Math.abs(homeScore - awayScore);
            const volatility = scoreDiff <= 6 ? "Low" : scoreDiff <= 18 ? "Medium" : "High";
            const volatilityColor = volatility === "Low" ? "text-emerald-400" : volatility === "Medium" ? "text-yellow-400" : "text-red-400";

            const matchRating = combinedScore >= 200 ? "Elite" : combinedScore >= 170 ? "High Quality" : "Competitive";
            const ratingColor = matchRating === "Elite" ? "text-[#F5C84C]" : matchRating === "High Quality" ? "text-emerald-400" : "text-neutral-300";

            const confidence = match.confidence ? parseInt(match.confidence, 10) : 60;

            const tooltips: Record<string, string> = {
              projectedScore: "Projected match score derived from each team's average points scored versus the opponent's average points conceded, adjusted for recent form and home advantage.",
              winProbability: "Likelihood of each team winning based on projected scoring differential and matchup strength.",
              matchVolatility: "Measures unpredictability. Higher volatility means a closer, harder-to-call contest.",
              matchRating: "Overall match quality based on projected combined scoring and competitive balance.",
            };

            const FeatureLabel = ({ id, label }: { id: string; label: string }) => (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs text-neutral-500">{label}</span>
                <div
                  className="relative cursor-default"
                  onMouseEnter={() => setActiveMatchTooltip(id)}
                  onMouseLeave={() => setActiveMatchTooltip(null)}
                >
                  <Info className="h-3 w-3 text-neutral-600 hover:text-[#F5C84C] transition-colors duration-150" />
                  {activeMatchTooltip === id && (
                    <div
                      className="absolute left-0 top-full mt-1.5 z-[999] w-[220px] rounded-md border border-[#F5C84C]/25 p-2.5 text-xs text-neutral-300 leading-relaxed pointer-events-none"
                      style={{
                        background: "#0B0B0B",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.9)",
                        animation: "fadeIn 0.15s ease",
                      }}
                    >
                      {tooltips[id]}
                    </div>
                  )}
                </div>
              </div>
            );

            return (
              <div
                className="relative rounded-xl border border-yellow-400/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(245,200,76,0.15)]"
                style={{
                  background: "linear-gradient(180deg, rgba(245,200,76,0.08) 0%, rgba(245,200,76,0.04) 100%)",
                  boxShadow: "0 0 25px rgba(245,200,76,0.18)",
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
                  style={{ background: "linear-gradient(90deg, transparent, #F5C84C, transparent)" }}
                />

                <div className="pt-8 px-8 pb-6 space-y-0">

                  {/* SECTION 1 — Match Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#F5C84C]/70 uppercase tracking-widest mb-2">
                        Match Fantasy Prediction · Round {match.round_number}
                        {isLockedMatch && <Lock className="h-3 w-3 text-[#F5C84C]" />}
                      </div>
                      <h3 className="text-2xl font-bold text-white">
                        {match.home_team} vs {match.away_team}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="flex flex-col items-end gap-1 px-3 py-2 rounded-lg"
                        style={{
                          background: "rgba(245,200,76,0.08)",
                          border: "1px solid rgba(245,200,76,0.25)",
                          borderRadius: "8px",
                          padding: "6px 10px",
                        }}
                      >
                        <span className="text-xs text-neutral-500">Neeko Confidence</span>
                        <span className="text-xl font-bold text-[#F5C84C] leading-none">{confidence}%</span>
                      </div>
                      {match.prediction_explanation && (isPremium || FREE_MATCH_IDS.includes(match.match_id)) && (
                        <div className="relative"
                          onMouseEnter={() => setActiveMatchTooltip("predictionExplanation")}
                          onMouseLeave={() => setActiveMatchTooltip(null)}
                        >
                          <Info className="w-4 h-4 text-[#F5C84C]/50 hover:text-[#F5C84C] cursor-pointer transition-colors duration-200" />
                          {activeMatchTooltip === "predictionExplanation" && (
                            <div
                              className="absolute right-0 top-full mt-2 z-50 max-w-[380px] w-[380px] rounded-lg p-4 text-sm opacity-0 animate-[fadeIn_0.2s_ease_forwards] pointer-events-none"
                              style={{
                                background: "#0b0b0b",
                                border: "1px solid rgba(245,200,76,0.30)",
                                boxShadow: "0 8px 32px rgba(0,0,0,0.9)",
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <Brain className="w-3.5 h-3.5 text-[#F5C84C]" />
                                <span className="text-[#F5C84C] text-xs font-semibold uppercase tracking-wider">
                                  AI Engine Explanation
                                </span>
                              </div>
                              <p className="text-white/80 text-xs leading-relaxed">
                                {match.prediction_explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <PremiumGate isLocked={isLockedMatch}>
                  <>

                  {/* SECTION 2 — Feature Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-[18px]">

                    {/* Projected Score */}
                    <div className="flex flex-col">
                      <FeatureLabel id="projectedScore" label="Projected Score" />
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-400 truncate mr-2">{match.home_team}</span>
                          <span className="text-sm font-bold text-white">{homeScore}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-400 truncate mr-2">{match.away_team}</span>
                          <span className="text-sm font-bold text-white">{awayScore}</span>
                        </div>
                      </div>
                      {/* Comparison bars */}
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-[4px] bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${homeBarPct}%`, background: homeScore >= awayScore ? "#F5C84C" : "rgba(245,200,76,0.3)" }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-[4px] bg-neutral-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${awayBarPct}%`, background: awayScore > homeScore ? "#F5C84C" : "rgba(245,200,76,0.3)" }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Win Probability */}
                    <div className="flex flex-col">
                      <FeatureLabel id="winProbability" label="Win Probability" />
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-400 truncate mr-2">{match.home_team}</span>
                          <span className={`text-sm font-bold ${homeWinPct >= 50 ? "text-[#F5C84C]" : "text-neutral-300"}`}>{homeWinPct}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-400 truncate mr-2">{match.away_team}</span>
                          <span className={`text-sm font-bold ${awayWinPct > 50 ? "text-[#F5C84C]" : "text-neutral-300"}`}>{awayWinPct}%</span>
                        </div>
                      </div>
                      <div className="mt-3 h-[4px] bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${homeWinPct}%`, background: "linear-gradient(90deg, #F5C84C, rgba(245,200,76,0.5))" }}
                        />
                      </div>
                    </div>

                    {/* Match Volatility */}
                    <div className="flex flex-col">
                      <FeatureLabel id="matchVolatility" label="Match Volatility" />
                      <div className={`text-lg font-bold ${volatilityColor}`}>{volatility}</div>
                      <div className="text-xs text-neutral-600 mt-1">Margin: {scoreDiff} pts</div>
                    </div>

                    {/* Match Rating */}
                    <div className="flex flex-col">
                      <FeatureLabel id="matchRating" label="Match Rating" />
                      <div className={`text-lg font-bold ${ratingColor}`}>{matchRating}</div>
                      <div className="text-xs text-neutral-600 mt-1">Combined: {combinedScore} pts</div>
                    </div>

                  </div>

                  {/* SECTION 4 — Neeko Match Analysis */}
                  <div className="pt-[24px] border-t border-[#F5C84C]/15 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#F5C84C]" />
                      <h4 className="font-semibold text-white text-sm">Neeko Match Analysis</h4>
                    </div>
                    <div className="text-sm text-white/80 leading-relaxed">
                      {summary ? (
                        <p>{summary}</p>
                      ) : !FREE_MATCH_IDS.includes(match.match_id) && !isPremium ? (
                        <div
                          className="rounded-xl p-5"
                          style={{ background: "rgba(245,200,76,0.04)", border: "1px solid rgba(245,200,76,0.12)" }}
                        >
                          <PremiumGateCTA />
                        </div>
                      ) : (
                        <p className="text-neutral-600 italic">No AI summary available for this match yet.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <span className="text-xs text-neutral-700">Powered by Neeko AI</span>
                  </div>
                  </>
                  </PremiumGate>

                </div>
              </div>
            );
          })()}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0b0b0b] p-8 text-center">
          <Sparkles className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Want More Insights?</h3>
          <p className="text-white/60 mb-6 max-w-2xl mx-auto">
            Upgrade to Neeko+ for advanced predictive modeling, exclusive metrics, and real-time AI analysis across all players, matches, and teams.
          </p>
          <a
            href="https://www.neekostats.com.au/neeko-plus"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-[#F5C84C] to-[#D4A017] text-black font-semibold hover:brightness-110 transition-all shadow-[0_0_30px_rgba(250,204,21,0.5)]"
          >
            Upgrade to Neeko+
          </a>
        </div>
      </div>
    </div>
  );
}
