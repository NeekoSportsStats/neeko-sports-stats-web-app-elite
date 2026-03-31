import { useState, useRef, useCallback, useEffect, createElement, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useAdminUIState } from "@/features/admin/state/AdminUIStateContext";
import { buildGraphicRenderConfig, draftToDbRow } from "@/features/admin/marketing/contentEngineDraft";

const AdminMediaLibraryPanel = lazy(() => import("./AdminMediaLibrary"));
import { toPng } from "html-to-image";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, RefreshCw, Copy, Check, Sparkles, Zap, LayoutTemplate, ChevronDown, Image as ImageIcon, Layers, Palette, Type, Calendar, Video, Play, Shuffle, ChartBar as BarChart2, CalendarPlus, Smartphone, Square, SlidersHorizontal, Upload, Library, Save } from "lucide-react";
import { VideoGeneratorPanel, type VideoPreviewState } from "../marketing/VideoGeneratorPanel";
import {
  GraphicCanvas,
  CarouselTitleSlide,
  CarouselPlayerSlide,
  resolveAccentColor,
  type ContentPlayer,
  type StatAngle,
  type LayoutEngine,
  type BackgroundTheme,
  type BackgroundSource,
  type GraphicOptions,
  type LogoPosition,
  type AccentColourMode,
  type RankHighlight,
  type CtaPosition,
  type LayoutOffsets,
  DEFAULT_LAYOUT_OFFSETS,
} from "../marketing/GraphicTemplates";
import { AIMediaPicker, getBackgroundSourceLabel, loadAIMedia } from "../marketing/AIMediaPicker";
import { getPublicStorageUrl } from "@/lib/storage/getPublicStorageUrl";
import { AIMediaPackGenerator } from "../marketing/AIMediaPackGenerator";
import { exportCarouselSlides } from "../marketing/CarouselExport";
import { AddToPlannerModal } from "../marketing/AddToPlannerModal";
import { PlayerSelectorPanel } from "../marketing/PlayerSelectorPanel";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ExportSize {
  id: string;
  label: string;
  w: number;
  h: number;
}

type ContentMode = "graphic" | "video" | "media";

// ─── Constants ─────────────────────────────────────────────────────────────────

const EXPORT_SIZES: ExportSize[] = [
  { id: "instagram",  label: "Instagram Square (1080×1080)",  w: 1080, h: 1080 },
  { id: "portrait",   label: "Portrait / Reels (1080×1350)",  w: 1080, h: 1350 },
  { id: "landscape",  label: "Landscape / Banner (1920×1080)", w: 1920, h: 1080 },
  { id: "twitter",    label: "Twitter / X (1200×675)",         w: 1200, h: 675  },
  { id: "story",      label: "Story / TikTok (1080×1920)",     w: 1080, h: 1920 },
  { id: "carousel",   label: "Carousel Slides (1080×1080)",    w: 1080, h: 1080 },
];

const LOGO_POSITIONS: { id: LogoPosition; label: string }[] = [
  { id: "none",          label: "None"          },
  { id: "top_left",      label: "Top Left"      },
  { id: "top_center",    label: "Top Centre"    },
  { id: "bottom_center", label: "Bottom Centre" },
  { id: "watermark",     label: "Watermark (subtle)" },
];

const ACCENT_MODES: { id: AccentColourMode; label: string; color: string }[] = [
  { id: "neeko_gold",  label: "Neeko Gold",   color: "#F59E0B" },
  { id: "team_colour", label: "Team Colour",  color: "#60A5FA" },
  { id: "white",       label: "White",        color: "#FFFFFF" },
  { id: "custom",      label: "Custom",       color: "#EF4444" },
];

const RANK_HIGHLIGHTS: { id: RankHighlight; label: string }[] = [
  { id: "top_player", label: "Top Player Only" },
  { id: "top_3",      label: "Top 3"           },
  { id: "all",        label: "All Rows"        },
  { id: "none",       label: "None"            },
];

const CTA_POSITIONS: { id: CtaPosition; label: string }[] = [
  { id: "bottom_center", label: "Bottom Centre" },
  { id: "bottom_right",  label: "Bottom Right"  },
  { id: "hidden",        label: "Hidden"        },
];

const AUTO_HASHTAGS = "#aflfantasy #aflfantasy2026 #fantasyfooty #aflstats #fantasysports";

const LAYOUTS: { id: LayoutEngine; label: string; description: string; icon: string; group: "core" | "template" }[] = [
  { id: "leaderboard",        label: "Leaderboard",         description: "Ranked player list",          icon: "🏆", group: "core"     },
  { id: "stat_card",          label: "Stat Card",           description: "Big stat · single player",    icon: "⭐", group: "core"     },
  { id: "battle",             label: "Player Battle",       description: "Head-to-head comparison",     icon: "⚔️", group: "core"     },
  { id: "captain_pick",       label: "Captain Pick",        description: "Big projection · hero layout", icon: "🎯", group: "template" },
  { id: "breakout_alert",     label: "Breakout Alert",      description: "Improvement + upside value",  icon: "🚀", group: "template" },
  { id: "trade_target",       label: "Trade Target",        description: "Projection score + value",    icon: "📈", group: "template" },
  { id: "avoid_player",       label: "Avoid Player",        description: "Warning · low projection",    icon: "⚠️", group: "template" },
  { id: "matchup_advantage",  label: "Matchup Advantage",   description: "Matchup rating · stat insight", icon: "🔥", group: "template" },
];

const BACKGROUNDS: { id: BackgroundTheme; label: string }[] = [
  { id: "dark_gradient",  label: "Dark Gradient"      },
  { id: "stadium",        label: "Stadium Lights"      },
  { id: "grass",          label: "Grass Texture"       },
  { id: "team_colour",    label: "Team Colour"         },
  { id: "analytics_grid", label: "Analytics Grid"      },
];

const fmt    = (n: number | null, suffix = "") => n != null ? `${Math.round(Number(n))}${suffix}` : "—";
const fmtDec = (n: number | null, dp = 1, suffix = "") => n != null ? `${Number(n).toFixed(dp)}${suffix}` : "—";

// ─── Stat Angles ───────────────────────────────────────────────────────────────

const STAT_ANGLES: StatAngle[] = [
  {
    id: "top_projections", label: "Top Projections",
    title: "Top 10 AFL Fantasy Projections", subtitle: "Round Projections · Neeko Analytics",
    orderBy: "projection_final", orderDir: "desc", limit: 10,
    statLabel: "Proj", statFn: (p) => fmt(p.projection_final, " pts"),
    accentColor: "#F59E0B", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `STAT INSIGHT\n\n${top.player_name} is the #1 projected player this round with ${proj} pts.\n\nIs he your captain this week?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "breakout_players", label: "Breakout Players",
    title: "Top Breakout Players 2026", subtitle: "Upside Model · Neeko Analytics",
    orderBy: "upside_rating", orderDir: "desc", limit: 8,
    statLabel: "Upside", statFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    accentColor: "#34D399", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const upside = Number(top.upside_rating ?? 0).toFixed(1);
      return `STAT INSIGHT\n\n${top.player_name} has the highest upside rating of ${upside}/10 on our Breakout Model.\n\nThis player is primed for a massive score.\n\nAre they in your team?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "underpriced_players", label: "Underpriced Players",
    title: "Most Underpriced Players", subtitle: "Value Model · Neeko Analytics",
    orderBy: "upside_rating", orderDir: "desc", limit: 8,
    statLabel: "Upside", statFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    accentColor: "#60A5FA", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const upside = Number(top.upside_rating ?? 0).toFixed(1);
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `STAT INSIGHT\n\n${top.player_name} is the most underpriced player right now.\n\nUpside rating: ${upside}/10 — projecting ${proj} pts.\n\nThis is a trade-in target.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "highest_ceilings", label: "Highest Ceilings",
    title: "Highest Ceiling Players", subtitle: "Ceiling Model · Neeko Analytics",
    orderBy: "ceiling_estimate", orderDir: "desc", limit: 8,
    statLabel: "Ceiling", statFn: (p) => fmt(p.ceiling_estimate, " pts"),
    accentColor: "#A78BFA", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const ceil = Math.round(Number(top.ceiling_estimate ?? 0));
      const floor = Math.round(Number(top.floor_estimate ?? 0));
      return `STAT INSIGHT\n\n${top.player_name} has the highest ceiling in AFL Fantasy — ${ceil} pts.\n\nFloor: ${floor} pts. When he goes big, he goes MASSIVE.\n\nIs the risk worth the reward?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "safe_floor_players", label: "Safe Floor Players",
    title: "Safest Floor Players", subtitle: "Floor Model · Neeko Analytics",
    orderBy: "floor_estimate", orderDir: "desc", limit: 8,
    statLabel: "Floor", statFn: (p) => fmt(p.floor_estimate, " pts"),
    accentColor: "#10B981", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const floor = Math.round(Number(top.floor_estimate ?? 0));
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `STAT INSIGHT\n\n${top.player_name} has the highest floor in AFL Fantasy — ${floor} pts.\n\nProjected: ${proj} pts. Set and forget.\n\nIs he locked in your team?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "captain_picks", label: "Captain Picks",
    title: "Top Captain Picks This Round", subtitle: "Captain Score Model · Neeko Analytics",
    orderBy: "captain_score", orderDir: "desc", limit: 8,
    statLabel: "Capt", statFn: (p) => fmt(p.captain_score),
    accentColor: "#FBBF24", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const score = Math.round(Number(top.captain_score ?? 0));
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `STAT INSIGHT\n\n${top.player_name} leads the Neeko captain model with a score of ${score}.\n\nProjected: ${proj} pts — the safest captain choice in AFL Fantasy.\n\nDo you agree?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "most_consistent", label: "Most Consistent",
    title: "Most Consistent Players", subtitle: "Consistency Model · Neeko Analytics",
    orderBy: "consistency_score", orderDir: "desc", limit: 8,
    statLabel: "Consistency", statFn: (p) => fmtDec(p.consistency_score, 0, "%"),
    accentColor: "#06B6D4", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const cons = Math.round(Number(top.consistency_score ?? 0));
      return `STAT INSIGHT\n\n${top.player_name} is the most consistent player in AFL Fantasy.\n\nConsistency score: ${cons}%\n\nThis is the player you set and forget every week.\n\nIs he in your team?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "high_risk_reward", label: "High Risk / High Reward",
    title: "High Risk — High Reward", subtitle: "Risk Model · Neeko Analytics",
    orderBy: "risk_rating", orderDir: "desc", limit: 8,
    statLabel: "Risk", statFn: (p) => fmtDec(p.risk_rating, 0, " / 100"),
    accentColor: "#EF4444", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const risk = Math.round(Number(top.risk_rating ?? 0));
      const ceil = Math.round(Number(top.ceiling_estimate ?? 0));
      return `VOLATILITY ALERT\n\n${top.player_name} is the highest risk AFL Fantasy player this round.\n\nRisk score: ${risk}/100 — ceiling: ${ceil} pts.\n\nBoom or bust? Would you start him?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "best_value_picks", label: "Best Value Picks",
    title: "Best Value Picks This Round", subtitle: "Value + Upside Model · Neeko Analytics",
    orderBy: "upside_rating", orderDir: "desc", limit: 8,
    statLabel: "Upside", statFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    accentColor: "#84CC16", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const upside = Number(top.upside_rating ?? 0).toFixed(1);
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `VALUE PICK\n\n${top.player_name} is our best value pick this round.\n\nUpside: ${upside}/10 — projecting ${proj} pts.\n\nDon't sleep on this one.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "form_players", label: "Form Players (Hot Streak)",
    title: "Hottest Form Players", subtitle: "Form Model · Neeko Analytics",
    orderBy: "consistency_score", orderDir: "desc", limit: 8,
    statLabel: "Consistency", statFn: (p) => fmtDec(p.consistency_score, 0, "%"),
    accentColor: "#F97316", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const cons = Math.round(Number(top.consistency_score ?? 0));
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `HOT STREAK\n\n${top.player_name} is in red-hot form right now.\n\nConsistency score: ${cons}% — projecting ${proj} pts this round.\n\nThis is the player you want in your team.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "projection_risers", label: "Biggest Projection Risers",
    title: "Biggest Projection Risers", subtitle: "Projection Engine · Neeko Analytics",
    orderBy: "projection_final", orderDir: "desc", limit: 8,
    statLabel: "Proj", statFn: (p) => fmt(p.projection_final, " pts"),
    accentColor: "#22D3EE", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `RISING STAR\n\n${top.player_name} has the biggest projection lift heading into this round — ${proj} pts.\n\nThis player is surging. Have you traded them in yet?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "differential_picks", label: "Differential Picks",
    title: "Differential Picks — Low Ownership", subtitle: "Upside Model · Neeko Analytics",
    orderBy: "upside_rating", orderDir: "desc", limit: 8,
    statLabel: "Upside", statFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    accentColor: "#E879F9", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const upside = Number(top.upside_rating ?? 0).toFixed(1);
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `DIFFERENTIAL PICK\n\n${top.player_name} is our top differential this round.\n\nUpside: ${upside}/10 — projecting ${proj} pts at low ownership.\n\nThis could be the week they go massive.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "best_matchups", label: "Best Matchups",
    title: "Best Matchups This Round", subtitle: "Matchup Rating Model · Neeko Analytics",
    orderBy: "matchup_rating", orderDir: "desc", limit: 8,
    statLabel: "Matchup", statFn: (p) => `${fmt(p.matchup_rating)} / 100`,
    accentColor: "#A3E635", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const matchup = Math.round(Number(top.matchup_rating ?? 0));
      return `MATCHUP ALERT\n\n${top.player_name} has the best matchup rating this round — ${matchup}/100.\n\nThis is the draw you want your players facing.\n\nIs this player in your starting 22?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "worst_matchups", label: "Worst Matchups",
    title: "Worst Matchups — Players to Avoid", subtitle: "Matchup Rating Model · Neeko Analytics",
    orderBy: "matchup_rating", orderDir: "asc", limit: 8,
    statLabel: "Matchup", statFn: (p) => `${fmt(p.matchup_rating)} / 100`,
    accentColor: "#F87171", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const matchup = Math.round(Number(top.matchup_rating ?? 0));
      return `MATCHUP WARNING\n\n${top.player_name} faces the toughest matchup this round — ${matchup}/100.\n\nThink twice before starting this player.\n\nWho are you benching this week?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "rookie_watch", label: "Rookie Watch",
    title: "Rookie Watch — Rising Stars", subtitle: "Projection Engine · Neeko Analytics",
    orderBy: "projection_final", orderDir: "desc", limit: 8,
    statLabel: "Proj", statFn: (p) => fmt(p.projection_final, " pts"),
    accentColor: "#FCD34D", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `ROOKIE WATCH\n\n${top.player_name} is the top rookie to watch this round — projecting ${proj} pts.\n\nEarly rookie cash generation could be the key to winning your league.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "trade_targets", label: "Trade Targets",
    title: "Top Trade Targets This Round", subtitle: "Value + Upside Model · Neeko Analytics",
    orderBy: "upside_rating", orderDir: "desc", limit: 8,
    statLabel: "Upside", statFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    accentColor: "#34D399", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const upside = Number(top.upside_rating ?? 0).toFixed(1);
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `TRADE TARGET\n\n${top.player_name} is our #1 trade target this week.\n\nUpside: ${upside}/10 — projecting ${proj} pts.\n\nIf you haven't traded them in, you're missing out.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "avoid_players", label: "Avoid Players",
    title: "Players to Avoid This Round", subtitle: "Risk + Matchup Model · Neeko Analytics",
    orderBy: "risk_rating", orderDir: "desc", limit: 8,
    statLabel: "Risk", statFn: (p) => fmtDec(p.risk_rating, 0, " / 100"),
    accentColor: "#DC2626", layoutHint: "leaderboard",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const risk = Math.round(Number(top.risk_rating ?? 0));
      return `AVOID ALERT\n\n${top.player_name} is the player to avoid this round.\n\nRisk score: ${risk}/100 — the numbers don't stack up.\n\nWho are you leaving on the bench?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "mid_priced_breakouts", label: "Mid-Priced Breakouts",
    title: "Mid-Priced Breakout Players", subtitle: "Upside Model · Neeko Analytics",
    orderBy: "upside_rating", orderDir: "desc", limit: 8,
    statLabel: "Upside", statFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    accentColor: "#FB923C", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const upside = Number(top.upside_rating ?? 0).toFixed(1);
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `MID-PRICED BREAKOUT\n\n${top.player_name} is our top mid-priced breakout candidate.\n\nUpside: ${upside}/10 — projecting ${proj} pts at a bargain price.\n\nThe perfect POD trade target.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "pod_picks", label: "POD Picks",
    title: "POD Picks — Points of Difference", subtitle: "Upside Model · Neeko Analytics",
    orderBy: "upside_rating", orderDir: "desc", limit: 8,
    statLabel: "Upside", statFn: (p) => fmtDec(p.upside_rating, 1, " / 10"),
    accentColor: "#C084FC", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const upside = Number(top.upside_rating ?? 0).toFixed(1);
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `POD PICK\n\n${top.player_name} is our top POD (Point of Difference) pick.\n\nUpside: ${upside}/10 — projecting ${proj} pts at very low ownership.\n\nThis is the player that could win you the week.\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
  {
    id: "fantasy_sleepers", label: "Fantasy Sleepers",
    title: "Fantasy Sleepers — Under the Radar", subtitle: "Projection Engine · Neeko Analytics",
    orderBy: "projection_final", orderDir: "desc", limit: 8,
    statLabel: "Proj", statFn: (p) => fmt(p.projection_final, " pts"),
    accentColor: "#818CF8", layoutHint: "stat_card",
    insightFn: (players) => {
      const top = players[0]; if (!top) return "";
      const proj = Math.round(Number(top.projection_final ?? 0));
      return `SLEEPER ALERT\n\n${top.player_name} is this round's biggest fantasy sleeper — projecting ${proj} pts under the radar.\n\nDon't let this one slip through your hands.\n\nIs this player in your team?\n\nData by Neeko Sports Stats — neekostats.com.au`;
    },
  },
];

// ─── Player cache ──────────────────────────────────────────────────────────────

const playerCache = new Map<string, ContentPlayer[]>();

// ─── Step Accordion ────────────────────────────────────────────────────────────

function StepSection({
  step, title, icon, children, openStep, setOpenStep, accentColor,
}: {
  step: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  openStep: string | null;
  setOpenStep: (s: string | null) => void;
  accentColor: string;
}) {
  const open = openStep === step;
  return (
    <div
      className="rounded-xl border overflow-hidden transition-colors"
      style={{ borderColor: open ? `${accentColor}40` : "hsl(var(--border))" }}
    >
      <button
        onClick={() => setOpenStep(open ? null : step)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        style={{ background: open ? `${accentColor}0a` : undefined }}
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={
            open
              ? { background: accentColor, color: "#000" }
              : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
          }
        >
          {step}
        </span>
        <span style={{ color: open ? accentColor : undefined }}>{icon}</span>
        <span className="text-xs font-semibold flex-1" style={{ color: open ? accentColor : undefined }}>{title}</span>
        <ChevronDown
          className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border/40">{children}</div>}
    </div>
  );
}

// ─── Dropdown helper ───────────────────────────────────────────────────────────

function DropSelect<T extends string>({
  value, options, onChange, accentColor,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background text-xs font-medium transition-colors hover:bg-muted/40"
      >
        <span className="truncate">{selected?.label ?? value}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-2 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-xl z-30 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors"
              style={opt.id === value ? { color: accentColor } : {}}
            >
              <span className="font-medium">{opt.label}</span>
              {opt.id === value && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AdminContentEngine() {
  const { toast } = useToast();
  const { state, setContentEngine, setDraft, resetDraft, loadDraftFromRow } = useAdminUIState();
  const ce = state.contentEngine;
  const draft = state.draft;
  const [searchParams] = useSearchParams();
  const plannerId = searchParams.get("plannerId");
  const [plannerSaving, setPlannerSaving] = useState(false);
  const plannerLoadedRef = useRef<string | null>(null);

  // ── Context-backed setters (legacy CE state — kept for backward compat) ──
  const setContentMode        = (v: ContentMode)         => setContentEngine((p) => ({ ...p, contentMode: v }));
  const setSelectedAngleId    = (v: string)              => { setContentEngine((p) => ({ ...p, selectedAngleId: v })); setDraft((p) => ({ ...p, statAngleId: v })); };
  const setSelectedLayout     = (v: LayoutEngine)        => { setContentEngine((p) => ({ ...p, selectedLayout: v })); setDraft((p) => ({ ...p, template: v })); };
  const setSelectedBackground = (v: BackgroundTheme)     => { setContentEngine((p) => ({ ...p, selectedBackground: v })); setDraft((p) => ({ ...p, selectedBackground: v })); };
  const setBackgroundSource   = (v: BackgroundSource)    => { setContentEngine((p) => ({ ...p, backgroundSource: v })); setDraft((p) => ({ ...p, backgroundSource: v })); };
  const setBackgroundMediaUrl = (v: string | null)       => { setContentEngine((p) => ({ ...p, backgroundMediaUrl: v })); setDraft((p) => ({ ...p, backgroundMediaUrl: v })); };
  const setCustomUploadUrl    = (v: string)              => { setContentEngine((p) => ({ ...p, customUploadUrl: v })); setDraft((p) => ({ ...p, customUploadUrl: v })); };
  const setShowTeamAccent     = (v: boolean)             => { setContentEngine((p) => ({ ...p, showTeamAccent: v })); setDraft((p) => ({ ...p, showTeamAccent: v })); };
  const setPlayerImageUrl     = (v: string)              => { setContentEngine((p) => ({ ...p, playerImageUrl: v })); setDraft((p) => ({ ...p, playerImageUrl: v })); };
  const setLogoUrl            = (v: string)              => { setContentEngine((p) => ({ ...p, logoUrl: v })); setDraft((p) => ({ ...p, logoUrl: v })); };
  const setLogoPosition       = (v: LogoPosition)        => { setContentEngine((p) => ({ ...p, logoPosition: v })); setDraft((p) => ({ ...p, logoPosition: v })); };
  const setRoundLabel         = (v: string)              => { setContentEngine((p) => ({ ...p, roundLabel: v })); setDraft((p) => ({ ...p, roundLabel: v })); };
  const setStatHighlight      = (v: string)              => { setContentEngine((p) => ({ ...p, statHighlight: v })); setDraft((p) => ({ ...p, statHighlight: v })); };
  const setCtaText            = (v: string)              => { setContentEngine((p) => ({ ...p, ctaText: v })); setDraft((p) => ({ ...p, ctaText: v })); };
  const setCtaPosition        = (v: CtaPosition)         => { setContentEngine((p) => ({ ...p, ctaPosition: v })); setDraft((p) => ({ ...p, ctaPosition: v })); };
  const setAccentMode         = (v: AccentColourMode)    => { setContentEngine((p) => ({ ...p, accentMode: v })); setDraft((p) => ({ ...p, accentMode: v })); };
  const setCustomAccent       = (v: string)              => { setContentEngine((p) => ({ ...p, customAccent: v })); setDraft((p) => ({ ...p, customAccent: v })); };
  const setAutoTeamAccent     = (v: boolean)             => { setContentEngine((p) => ({ ...p, autoTeamAccent: v })); setDraft((p) => ({ ...p, autoTeamAccent: v })); };
  const setRankHighlight      = (v: RankHighlight)       => { setContentEngine((p) => ({ ...p, rankHighlight: v })); setDraft((p) => ({ ...p, rankHighlight: v })); };
  const setAppendHashtags     = (v: boolean)             => { setContentEngine((p) => ({ ...p, appendHashtags: v })); setDraft((p) => ({ ...p, appendHashtags: v })); };
  const setPlayerMode         = (v: "auto" | "manual")  => { setContentEngine((p) => ({ ...p, playerMode: v })); setDraft((p) => ({ ...p, playerMode: v })); };
  const setSelectedExportSize = (v: ExportSize)          => { setContentEngine((p) => ({ ...p, exportSizeId: v.id })); setDraft((p) => ({ ...p, exportSizeId: v.id })); };

  // Derived from context
  const contentMode        = ce.contentMode as ContentMode;
  const selectedAngle      = STAT_ANGLES.find((a) => a.id === ce.selectedAngleId) ?? STAT_ANGLES[0];
  const selectedLayout     = ce.selectedLayout as LayoutEngine;
  const selectedBackground = ce.selectedBackground as BackgroundTheme;
  const backgroundSource   = ce.backgroundSource as BackgroundSource;
  const backgroundMediaUrl = ce.backgroundMediaUrl;
  const customUploadUrl    = ce.customUploadUrl;
  const showTeamAccent     = ce.showTeamAccent;
  const playerImageUrl     = ce.playerImageUrl;
  const logoUrl            = ce.logoUrl;
  const logoPosition       = ce.logoPosition as LogoPosition;
  const roundLabel         = ce.roundLabel;
  const statHighlight      = ce.statHighlight;
  const ctaText            = ce.ctaText;
  const ctaPosition        = ce.ctaPosition as CtaPosition;
  const accentMode         = ce.accentMode as AccentColourMode;
  const customAccent       = ce.customAccent;
  const autoTeamAccent     = ce.autoTeamAccent;
  const rankHighlight      = ce.rankHighlight as RankHighlight;
  const appendHashtags     = ce.appendHashtags;
  const playerMode         = ce.playerMode as "auto" | "manual";
  const selectedExportSize = EXPORT_SIZES.find((s) => s.id === ce.exportSizeId) ?? EXPORT_SIZES[0];

  // ── Ephemeral state (OK to reset on tab switch) ──────────────────────────
  const [players, setPlayers]               = useState<ContentPlayer[]>([]);
  const [dataLoading, setDataLoading]       = useState(false);

  // Layout editor (ephemeral — visual tool, not persisted)
  const [layoutEditorOpen, setLayoutEditorOpen] = useState(false);
  const [layoutOffsets, setLayoutOffsets]       = useState<LayoutOffsets>({ ...DEFAULT_LAYOUT_OFFSETS });

  // Export
  const [downloading, setDownloading]                 = useState(false);
  const [carouselProgress, setCarouselProgress]       = useState<{ done: number; total: number } | null>(null);

  // AI Analysis overlay
  const [includeAIAnalysis, setIncludeAIAnalysis] = useState(false);
  const [aiAnalysisText, setAIAnalysisText]       = useState("");
  const [aiAnalysisLoading, setAIAnalysisLoading] = useState(false);

  // Content
  const [insight, setInsight]               = useState("");
  const [caption, setCaption]               = useState("");
  const [captionLoading, setCaptionLoading] = useState(false);

  // Copy feedback
  const [copiedInsight, setCopiedInsight] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedPost, setCopiedPost]       = useState(false);

  // Planner modal
  const [plannerModalOpen, setPlannerModalOpen] = useState(false);
  const [plannerMediaUrl, setPlannerMediaUrl]   = useState<string | null>(null);

  // Video preview state (lifted from VideoGeneratorPanel)
  const [videoPreviewState, setVideoPreviewState] = useState<VideoPreviewState | null>(null);

  // Manual player selection
  const [manualPlayer1, setManualPlayer1] = useState<ContentPlayer | null>(null);
  const [manualPlayer2, setManualPlayer2] = useState<ContentPlayer | null>(null);

  // Accordion open step (null = all closed)
  const [openStep, setOpenStep] = useState<string | null>("1");

  // Row selection — click to pin players in preview
  const [selectedPlayerKeys, setSelectedPlayerKeys] = useState<string[]>([]);

  // Media library refresh counter — increment to force AIMediaPicker to reload
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  const handleMediaSynced = () => setMediaRefreshKey((k) => k + 1);

  const togglePlayerSelection = (key: string) => {
    setSelectedPlayerKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const clearPlayerSelection = () => setSelectedPlayerKeys([]);

  const previewRef = useRef<HTMLDivElement>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);

  // ── Restore scroll position on mount ────────────────────────────────────
  useEffect(() => {
    const scrollY = ce.scrollY ?? 0;
    if (scrollY > 0) {
      const restore = () => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollY, behavior: "instant" });
        } else {
          requestAnimationFrame(restore);
        }
      };
      requestAnimationFrame(restore);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist window scroll position ─────────────────────────────────────
  useEffect(() => {
    const saved = sessionStorage.getItem("adminContentEngineScroll");
    if (saved) {
      window.scrollTo({ top: Number(saved), behavior: "instant" });
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem("adminContentEngineScroll", window.scrollY.toString());
    };
    window.addEventListener("scroll", handleScroll);
    return () => { window.removeEventListener("scroll", handleScroll); };
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isCarouselMode  = selectedExportSize.id === "carousel";
  const effectiveLayout = isCarouselMode ? "leaderboard" : selectedLayout;

  const rawMediaUrl = backgroundSource === "upload"
    ? (customUploadUrl.trim() || undefined)
    : (backgroundMediaUrl ?? undefined);
  const resolvedMediaUrl = rawMediaUrl
    ? (getPublicStorageUrl(rawMediaUrl) ?? rawMediaUrl)
    : undefined;

  const graphicOptions: GraphicOptions = {
    layout: effectiveLayout,
    background: selectedBackground,
    backgroundSource,
    backgroundMediaUrl: resolvedMediaUrl,
    showTeamAccent,
    playerImageUrl: playerImageUrl.trim() || undefined,
    logoUrl: logoUrl.trim() || undefined,
    logoPosition: logoPosition !== "none" ? logoPosition : undefined,
    roundLabel:    roundLabel.trim()    || undefined,
    statHighlight: statHighlight.trim() || undefined,
    ctaText:       ctaText.trim()       || undefined,
    ctaPosition:   ctaText.trim() ? ctaPosition : "hidden",
    accentColourMode:   accentMode,
    customAccentColour: accentMode === "custom" ? customAccent : undefined,
    rankHighlight,
    layoutOffsets: layoutEditorOpen ? layoutOffsets : undefined,
    autoTeamAccent,
    aiAnalysisText: includeAIAnalysis && aiAnalysisText
      ? (aiAnalysisText.length > 180 ? aiAnalysisText.slice(0, 180) + "…" : aiAnalysisText)
      : undefined,
  };

  const accentColor = resolveAccentColor(selectedAngle, graphicOptions, undefined, players[0]?.team);

  const exportW  = selectedExportSize.w;
  const exportH  = selectedExportSize.h;

  // When in manual mode, inject selected players at the front of the list
  const basePlayers: ContentPlayer[] = playerMode === "manual"
    ? [
        ...(manualPlayer1 ? [manualPlayer1] : []),
        ...(manualPlayer2 ? [manualPlayer2] : []),
        ...players.filter((p) =>
          p.player_name !== manualPlayer1?.player_name &&
          p.player_name !== manualPlayer2?.player_name
        ),
      ]
    : players;

  // Row-selection filtering: if rows are pinned, show only those in the preview
  const effectivePlayers: ContentPlayer[] = selectedPlayerKeys.length > 0
    ? basePlayers.filter((p) => selectedPlayerKeys.includes(p.player_name))
    : basePlayers;

  // Build canonical render config from draft (used for export parity)
  const canonicalRenderConfig = (() => {
    const syncedDraft = {
      ...draft,
      statAngleId:        selectedAngle.id,
      template:           selectedLayout as import("../marketing/GraphicTemplates").LayoutEngine,
      selectedBackground: selectedBackground as import("../marketing/GraphicTemplates").BackgroundTheme,
      backgroundSource:   backgroundSource  as import("../marketing/GraphicTemplates").BackgroundSource,
      backgroundMediaUrl: backgroundMediaUrl,
      customUploadUrl:    customUploadUrl,
      accentMode:         accentMode        as import("../marketing/GraphicTemplates").AccentColourMode,
      customAccent,
      autoTeamAccent,
      showTeamAccent,
      logoUrl,
      logoPosition:       logoPosition      as import("../marketing/GraphicTemplates").LogoPosition,
      playerImageUrl,
      roundLabel,
      statHighlight,
      ctaText,
      ctaPosition:        ctaPosition       as import("../marketing/GraphicTemplates").CtaPosition,
      rankHighlight:      rankHighlight     as import("../marketing/GraphicTemplates").RankHighlight,
      exportSizeId:       selectedExportSize.id,
      includeAiAnalysis:  includeAIAnalysis,
    };
    return buildGraphicRenderConfig(
      syncedDraft,
      selectedAngle,
      effectivePlayers,
      selectedExportSize.id,
      layoutEditorOpen ? layoutOffsets : undefined,
    );
  })();

  // ── Reset all persisted state ─────────────────────────────────────────────

  const handleResetState = () => {
    setContentEngine(() => ({
      contentMode:        "graphic",
      selectedAngleId:    "top_projections",
      selectedLayout:     "leaderboard",
      selectedBackground: "dark_gradient",
      backgroundSource:   "gradient",
      backgroundMediaUrl: null,
      customUploadUrl:    "",
      logoUrl:            "",
      logoPosition:       "none",
      roundLabel:         "",
      statHighlight:      "",
      ctaText:            "",
      ctaPosition:        "bottom_center",
      playerImageUrl:     "",
      accentMode:         "neeko_gold",
      customAccent:       "#F59E0B",
      rankHighlight:      "top_player",
      playerMode:         "auto",
      exportSizeId:       "instagram",
      appendHashtags:     true,
      autoTeamAccent:     false,
      showTeamAccent:     false,
      scrollY:            0,
    }));
    resetDraft();
    setInsight("");
    setCaption("");
    toast({ title: "Content Engine reset", description: "All settings restored to defaults." });
  };

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchPlayers = useCallback(async (angle: StatAngle, force = false) => {
    if (!force && playerCache.has(angle.id)) {
      setPlayers(playerCache.get(angle.id)!);
      return;
    }
    setDataLoading(true);
    setInsight("");
    setCaption("");
    try {
      const { data, error } = await supabase
        .from("v_rankings_content_engine")
        .select("player_id, player_name, team, position, projection_final, ceiling_estimate, floor_estimate, captain_score, matchup_rating, upside_rating, consistency_score, risk_rating")
        .order(angle.orderBy as string, { ascending: angle.orderDir === "asc", nullsFirst: false })
        .limit(angle.limit);
      if (error) throw error;
      const result = (data ?? []) as ContentPlayer[];
      playerCache.set(angle.id, result);
      setPlayers(result);
    } catch (err) {
      toast({ title: "Failed to load players", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDataLoading(false);
    }
  }, [toast]);

  const hasLoaded = useRef(false);
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    fetchPlayers(STAT_ANGLES[0]);
    loadAIMedia().catch(() => { /* background pre-warm — ignore errors */ });
  }, [fetchPlayers]);

  // ── Load from content_planner_posts when plannerId is present ───────────
  useEffect(() => {
    if (!plannerId) return;
    if (plannerLoadedRef.current === plannerId) return;
    plannerLoadedRef.current = plannerId;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("content_planner_posts")
          .select("*")
          .eq("id", plannerId)
          .maybeSingle();
        if (error) throw error;
        if (!data) return;

        const row = data as Record<string, unknown>;

        loadDraftFromRow(row);

        const statAngle = (row.stat_angle as string) || "";
        const caption   = (row.caption as string) || "";

        setContentEngine((p) => ({
          ...p,
          selectedAngleId:    statAngle    || p.selectedAngleId,
          selectedLayout:     ((row.template as string)      || p.selectedLayout)     as typeof p.selectedLayout,
          selectedBackground: ((row.background as string)    || p.selectedBackground) as typeof p.selectedBackground,
          backgroundSource:   ((row.background_type as string) || p.backgroundSource) as typeof p.backgroundSource,
          exportSizeId:       (row.export_format as string)  || p.exportSizeId,
          accentMode:         "custom" as typeof p.accentMode,
          customAccent:       (row.accent_color as string)   || p.customAccent,
        }));

        if (caption) setCaption(caption);

        const matchedAngle = STAT_ANGLES.find((a) => a.id === statAngle);
        if (matchedAngle) fetchPlayers(matchedAngle);

        toast({ title: "Loaded from planner", description: `Editing ${statAngle.replace(/_/g, " ")}` });
      } catch (err) {
        toast({ title: "Failed to load planner post", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerId, fetchPlayers]);

  // ── Save to content_planner_posts ────────────────────────────────────────
  const handleSaveToPlanner = async () => {
    setPlannerSaving(true);
    try {
      const updatedDraft = {
        ...draft,
        statAngleId:        selectedAngle.id,
        template:           selectedLayout,
        selectedBackground,
        backgroundSource,
        customAccent:       accentColor,
        socialCaption:      caption,
        appendHashtags,
        exportSizeId:       selectedExportSize.id,
      };

      const payload = draftToDbRow(updatedDraft);

      if (plannerId) {
        const { error } = await supabase
          .from("content_planner_posts")
          .update(payload)
          .eq("id", plannerId);
        if (error) throw error;
        setDraft(() => ({ ...updatedDraft, lastSavedAt: new Date().toISOString() }));
        toast({ title: "Planner post updated", description: "Changes saved." });
      } else {
        const today = new Date();
        const dayIdx = today.getDay();
        const diff = today.getDate() - dayIdx + (dayIdx === 0 ? -6 : 1);
        today.setDate(diff);
        const weekStart = today.toISOString().split("T")[0];
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const currentDay = dayNames[new Date().getDay()] ?? "Monday";

        const { error } = await supabase
          .from("content_planner_posts")
          .insert({ ...payload, week_start: weekStart, day: currentDay, status: "draft" });
        if (error) throw error;
        setDraft(() => ({ ...updatedDraft, lastSavedAt: new Date().toISOString() }));
        toast({ title: "Saved to planner", description: "New draft post created." });
      }
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setPlannerSaving(false);
    }
  };

  const handleAngleSelect = (angle: StatAngle) => {
    setSelectedAngleId(angle.id);
    setInsight("");
    setCaption("");
    setSelectedPlayerKeys([]);
    if (angle.layoutHint && !isCarouselMode) setSelectedLayout(angle.layoutHint as LayoutEngine);
    fetchPlayers(angle);
  };

  // Fetch AI summary whenever top effective player changes
  useEffect(() => {
    const topPlayer = effectivePlayers[0]?.player_name;
    if (topPlayer) fetchAISummary(topPlayer);
    else setAIAnalysisText("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePlayers[0]?.player_name]);

  const handleShuffleTemplate = () => {
    const all = LAYOUTS.map((l) => l.id);
    const next = all[(all.indexOf(effectiveLayout) + 1) % all.length];
    setSelectedLayout(next);
  };

  const handleShuffleAngle = () => {
    const idx = STAT_ANGLES.findIndex((a) => a.id === selectedAngle.id);
    const next = STAT_ANGLES[(idx + 1) % STAT_ANGLES.length];
    handleAngleSelect(next);
  };

  // ── AI Analysis helpers ────────────────────────────────────────────────────

  const truncateText = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + "…" : text;

  const fetchAISummary = useCallback(async (playerName: string) => {
    if (!playerName) return;
    setAIAnalysisLoading(true);
    try {
      const { data, error } = await supabase
        .schema("afl")
        .from("ai_player_summaries")
        .select("ai_summary")
        .eq("player_name", playerName)
        .maybeSingle();
      if (error) throw error;
      setAIAnalysisText(data?.ai_summary ?? "");
    } catch {
      setAIAnalysisText("");
    } finally {
      setAIAnalysisLoading(false);
    }
  }, []);

  const effectiveAIText = includeAIAnalysis && aiAnalysisText
    ? truncateText(aiAnalysisText, contentMode === "video" ? 350 : 180)
    : undefined;

  // ── Content handlers ───────────────────────────────────────────────────────

  const handleGenerateInsight = () => {
    if (effectivePlayers.length === 0) return;
    setInsight(selectedAngle.insightFn(effectivePlayers));
  };

  const handleGenerateCaption = async () => {
    if (effectivePlayers.length === 0) return;
    setCaptionLoading(true);
    setCaption("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-marketing-caption`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ angle_name: selectedAngle.label, players: effectivePlayers.slice(0, 5) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const result = await res.json() as { caption: string };
      const base = result.caption ?? "";
      setCaption(appendHashtags ? `${base}\n\n${AUTO_HASHTAGS}` : base);
    } catch (err) {
      toast({ title: "Caption generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setCaptionLoading(false);
    }
  };

  // ── Export handlers ────────────────────────────────────────────────────────

  const handleDownloadGraphic = async () => {
    if (isCarouselMode) { await handleDownloadCarousel(); return; }
    if (!previewRef.current || effectivePlayers.length === 0) return;
    setDownloading(true);
    try {
      const inner = previewRef.current.firstElementChild as HTMLElement | null;
      if (!inner) throw new Error("Preview not ready");
      const { w, h } = selectedExportSize;
      const dataUrl = await toPng(inner, { width: w, height: h, pixelRatio: 1, style: { transform: "none" } });
      const link = document.createElement("a");
      link.download = `neeko-${selectedAngle.id}-${effectiveLayout}-${selectedExportSize.id}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Graphic downloaded", description: `${w}×${h}px PNG` });
    } catch (err) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCarousel = async () => {
    if (effectivePlayers.length === 0) return;
    setDownloading(true);
    setCarouselProgress({ done: 0, total: effectivePlayers.length + 1 });
    try {
      const { w, h } = selectedExportSize;
      const opts = canonicalRenderConfig.options;
      const slides = [
        {
          filename: `neeko-carousel-${selectedAngle.id}-00-title.png`,
          w, h,
          element: createElement(CarouselTitleSlide, { angle: selectedAngle, w, h, options: opts, totalPlayers: effectivePlayers.length }),
        },
        ...effectivePlayers.map((player, i) => ({
          filename: `neeko-carousel-${selectedAngle.id}-${String(i + 1).padStart(2, "0")}-${player.player_name.replace(/\s+/g, "_")}.png`,
          w, h,
          element: createElement(CarouselPlayerSlide, { angle: selectedAngle, player, rank: i + 1, w, h, options: opts }),
        })),
      ];
      await exportCarouselSlides(slides, (done, total) => setCarouselProgress({ done, total }));
      toast({ title: "Carousel exported", description: `${slides.length} PNG files downloaded` });
    } catch (err) {
      toast({ title: "Carousel export failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDownloading(false);
      setCarouselProgress(null);
    }
  };

  const handleCopyInsight = () => {
    if (!insight) return;
    navigator.clipboard.writeText(insight).then(() => {
      setCopiedInsight(true);
      setTimeout(() => setCopiedInsight(false), 2000);
    });
  };

  const handleCopyCaption = () => {
    if (!caption) return;
    navigator.clipboard.writeText(caption).then(() => {
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    });
  };

  const handleCopyPost = () => {
    const parts = [insight, caption].filter(Boolean).join("\n\n---\n\n");
    if (!parts) return;
    navigator.clipboard.writeText(parts).then(() => {
      setCopiedPost(true);
      toast({ title: "Full post copied" });
      setTimeout(() => setCopiedPost(false), 2000);
    });
  };

  const handleAddToPlanner = async () => {
    if (isCarouselMode || !previewRef.current || effectivePlayers.length === 0) {
      setPlannerMediaUrl(null);
      setPlannerModalOpen(true);
      return;
    }
    try {
      const inner = previewRef.current.firstElementChild as HTMLElement | null;
      if (inner) {
        const { w, h } = selectedExportSize;
        const dataUrl = await toPng(inner, { width: w, height: h, pixelRatio: 1, style: { transform: "none" } });
        setPlannerMediaUrl(dataUrl);
      } else {
        setPlannerMediaUrl(null);
      }
    } catch {
      setPlannerMediaUrl(null);
    }
    setPlannerModalOpen(true);
  };

  const accentStyle = { color: accentColor };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>

      {/* ── TOP BAR ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 space-y-3 pb-3 border-b border-border">

        {/* Title row */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4" style={accentStyle} />
              Content Engine
              {plannerId && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#22C55E20", color: "#22C55E" }}>
                  Editing Planner Post
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {plannerId ? "Changes will update the planner post when you click Update." : "Build a graphic in 5 steps, then download."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleResetState}
              className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/40"
              title="Reset all settings to defaults"
            >
              <RefreshCw className="h-3 w-3" />
              Reset
            </button>
            {(insight || caption) && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCopyPost}>
                {copiedPost ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                Copy Post
              </Button>
            )}
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30 border border-border w-fit">
          {(["graphic", "video", "media"] as ContentMode[]).map((mode) => {
            const icons: Record<ContentMode, React.ReactNode> = {
              graphic: <LayoutTemplate className="h-3.5 w-3.5" />,
              video:   <Video className="h-3.5 w-3.5" />,
              media:   <Library className="h-3.5 w-3.5" />,
            };
            const labels: Record<ContentMode, string> = {
              graphic: "Graphic",
              video:   "Video",
              media:   "Media Library",
            };
            return (
              <button
                key={mode}
                onClick={() => setContentMode(mode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={
                  contentMode === mode
                    ? { background: accentColor, color: "#000" }
                    : { color: "hsl(var(--muted-foreground))" }
                }
              >
                {icons[mode]}
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MEDIA LIBRARY MODE ─────────────────────────────────────────────── */}
      {contentMode === "media" && (
        <div className="flex-1 overflow-y-auto p-6" style={{ minHeight: 0 }}>
          <Suspense fallback={<div className="flex items-center justify-center py-24"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <AdminMediaLibraryPanel />
          </Suspense>
        </div>
      )}

      {/* ── WORKSPACE ──────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 overflow-hidden${contentMode === "media" ? " hidden" : ""}`}
        style={{ display: contentMode === "media" ? "none" : "grid", gridTemplateColumns: "420px 1fr", minHeight: 0 }}
      >

        {/* ── LEFT COLUMN — Step Accordion ─────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="border-r border-border overflow-y-auto"
          style={{ scrollbarWidth: "thin" } as Record<string, string>}
        >
          <div className="p-4 space-y-2">

            {contentMode === "graphic" ? (
              <>

                {/* STEP 1 — Stat Angle */}
                <StepSection
                  step="1"
                  title="Stat Angle"
                  icon={<BarChart2 className="h-3.5 w-3.5" />}
                  openStep={openStep}
                  setOpenStep={setOpenStep}
                  accentColor={accentColor}
                >
                  {/* Primary Stat Angles — quick-pick */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Primary</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["top_projections", "breakout_players", "captain_picks", "best_value_picks"] as const).map((id) => {
                        const angle = STAT_ANGLES.find((a) => a.id === id);
                        if (!angle) return null;
                        const isSelected = angle.id === selectedAngle.id;
                        const icons: Record<string, string> = {
                          top_projections: "🏆",
                          breakout_players: "🚀",
                          captain_picks: "🎯",
                          best_value_picks: "💎",
                        };
                        return (
                          <button
                            key={angle.id}
                            onClick={() => handleAngleSelect(angle)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all"
                            style={
                              isSelected
                                ? { background: `${angle.accentColor}20`, borderColor: `${angle.accentColor}60` }
                                : { background: "transparent", borderColor: "hsl(var(--border))" }
                            }
                          >
                            <span className="text-sm leading-none shrink-0">{icons[angle.id]}</span>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold truncate" style={isSelected ? { color: angle.accentColor } : { color: "hsl(var(--foreground))" }}>{angle.label}</p>
                              <p className="text-[10px] text-muted-foreground/50 truncate">{angle.statLabel}</p>
                            </div>
                            {isSelected && <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: angle.accentColor }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* All Stat Angles */}
                  <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest pt-1">All Angles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STAT_ANGLES.map((angle) => {
                      const isSelected = angle.id === selectedAngle.id;
                      return (
                        <button
                          key={angle.id}
                          onClick={() => handleAngleSelect(angle)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-[11px] font-medium whitespace-nowrap transition-all"
                          style={
                            isSelected
                              ? { background: `${angle.accentColor}20`, borderColor: `${angle.accentColor}60`, color: angle.accentColor }
                              : { background: "transparent", borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                          }
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isSelected ? angle.accentColor : "hsl(var(--muted-foreground)/0.4)" }} />
                          {angle.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Player data table */}
                  <div className="pt-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground/60 truncate">{selectedAngle.title}</p>
                      <Button
                        variant="outline" size="sm"
                        className="h-6 text-[11px] shrink-0 ml-2"
                        onClick={() => fetchPlayers(selectedAngle, true)}
                        disabled={dataLoading}
                      >
                        <RefreshCw className={`h-3 w-3 mr-1 ${dataLoading ? "animate-spin" : ""}`} />
                        Refresh
                      </Button>
                    </div>

                    <PlayerSelectorPanel
                      playerMode={playerMode}
                      onPlayerModeChange={setPlayerMode}
                      manualPlayer1={manualPlayer1}
                      manualPlayer2={manualPlayer2}
                      onPlayer1Change={setManualPlayer1}
                      onPlayer2Change={setManualPlayer2}
                      accentColor={accentColor}
                    />

                    {playerMode === "auto" && (
                      <div className="rounded-lg border border-border overflow-hidden">
                        {dataLoading ? (
                          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-xs">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />Loading…
                          </div>
                        ) : effectivePlayers.length === 0 ? (
                          <div className="py-5 text-center text-xs text-muted-foreground">No data loaded</div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border bg-muted/40">
                                <th className="text-left py-1.5 px-2.5 font-medium text-muted-foreground w-6">#</th>
                                <th className="text-left py-1.5 px-2.5 font-medium text-muted-foreground">Player</th>
                                <th className="text-left py-1.5 px-2.5 font-medium text-muted-foreground">Team</th>
                                <th className="text-right py-1.5 px-2.5 font-medium text-muted-foreground">{selectedAngle.statLabel}</th>
                                {selectedPlayerKeys.length > 0 && (
                                  <th className="py-1.5 px-2 text-right">
                                    <button
                                      onClick={clearPlayerSelection}
                                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
                                      style={{ background: `${accentColor}22`, color: accentColor }}
                                    >
                                      Clear
                                    </button>
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {basePlayers.slice(0, 10).map((p, i) => {
                                const key = p.player_name;
                                const isPinned = selectedPlayerKeys.includes(key);
                                return (
                                  <tr
                                    key={`${key}-${i}`}
                                    onClick={() => togglePlayerSelection(key)}
                                    className="border-b border-border/40 last:border-0 cursor-pointer select-none transition-colors"
                                    style={isPinned ? { background: `${accentColor}18`, borderLeft: `3px solid ${accentColor}` } : { borderLeft: "3px solid transparent" }}
                                  >
                                    <td className="py-1.5 px-2.5 text-muted-foreground tabular-nums">{i + 1}</td>
                                    <td className="py-1.5 px-2.5 font-medium max-w-[110px] truncate" style={isPinned ? { color: accentColor } : {}}>{p.player_name}</td>
                                    <td className="py-1.5 px-2.5 text-muted-foreground truncate">{p.team}</td>
                                    <td className="py-1.5 px-2.5 text-right font-semibold tabular-nums" style={accentStyle}>{selectedAngle.statFn(p)}</td>
                                    {selectedPlayerKeys.length > 0 && (
                                      <td className="py-1.5 px-2 text-right">
                                        {isPinned && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: accentColor }} />}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                    {selectedPlayerKeys.length > 0 && (
                      <p className="text-[10px] text-muted-foreground/40 text-center">
                        {selectedPlayerKeys.length} player{selectedPlayerKeys.length > 1 ? "s" : ""} pinned
                      </p>
                    )}
                  </div>
                </StepSection>

                {/* STEP 2 — Template */}
                <StepSection
                  step="2"
                  title="Template"
                  icon={<LayoutTemplate className="h-3.5 w-3.5" />}
                  openStep={openStep}
                  setOpenStep={setOpenStep}
                  accentColor={accentColor}
                >
                  <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">Core</p>
                  <div className="space-y-1">
                    {LAYOUTS.filter((t) => t.group === "core").map((tmpl) => {
                      const isSelected = tmpl.id === selectedLayout;
                      const disabled = isCarouselMode;
                      return (
                        <button
                          key={tmpl.id}
                          onClick={() => { if (!disabled) setSelectedLayout(tmpl.id); }}
                          disabled={disabled}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all disabled:opacity-40"
                          style={isSelected && !disabled ? { background: `${accentColor}14`, borderColor: `${accentColor}55` } : { background: "transparent", borderColor: "hsl(var(--border))" }}
                        >
                          <span className="text-sm leading-none">{tmpl.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold" style={isSelected && !disabled ? accentStyle : {}}>{tmpl.label}</div>
                            <div className="text-[10px] mt-0.5 opacity-50">{tmpl.description}</div>
                          </div>
                          {isSelected && !disabled && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest pt-1">Specialty</p>
                  <div className="space-y-1">
                    {LAYOUTS.filter((t) => t.group === "template").map((tmpl) => {
                      const isSelected = tmpl.id === selectedLayout;
                      const disabled = isCarouselMode;
                      return (
                        <button
                          key={tmpl.id}
                          onClick={() => { if (!disabled) setSelectedLayout(tmpl.id); }}
                          disabled={disabled}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all disabled:opacity-40"
                          style={isSelected && !disabled ? { background: `${accentColor}14`, borderColor: `${accentColor}55` } : { background: "transparent", borderColor: "hsl(var(--border))" }}
                        >
                          <span className="text-sm leading-none">{tmpl.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold" style={isSelected && !disabled ? accentStyle : {}}>{tmpl.label}</div>
                            <div className="text-[10px] mt-0.5 opacity-50">{tmpl.description}</div>
                          </div>
                          {isSelected && !disabled && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />}
                        </button>
                      );
                    })}
                  </div>
                  {isCarouselMode && <p className="text-[10px] text-muted-foreground/50">Template is auto-set in Carousel mode</p>}
                </StepSection>

                {/* STEP 3 — Background */}
                <StepSection
                  step="3"
                  title="Background"
                  icon={<Palette className="h-3.5 w-3.5" />}
                  openStep={openStep}
                  setOpenStep={setOpenStep}
                  accentColor={accentColor}
                >
                  <div className="grid grid-cols-1 gap-1">
                    {(["gradient", "stock_image", "stock_video", "team_theme", "upload"] as BackgroundSource[]).map((src) => (
                      <button
                        key={src}
                        onClick={() => {
                          setBackgroundSource(src);
                          if (src !== "stock_image" && src !== "stock_video") setBackgroundMediaUrl(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all"
                        style={
                          backgroundSource === src
                            ? { background: `${accentColor}14`, borderColor: `${accentColor}55`, color: accentColor }
                            : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                        }
                      >
                        {src === "gradient"    && <Palette className="h-3 w-3 shrink-0" />}
                        {src === "stock_image" && <ImageIcon className="h-3 w-3 shrink-0" />}
                        {src === "stock_video" && <Video className="h-3 w-3 shrink-0" />}
                        {src === "team_theme"  && <span className="w-3 h-3 rounded-full shrink-0" style={{ background: accentColor }} />}
                        {src === "upload"      && <Upload className="h-3 w-3 shrink-0" />}
                        {getBackgroundSourceLabel(src)}
                        {backgroundSource === src && <span className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />}
                      </button>
                    ))}
                  </div>

                  {backgroundSource === "gradient" && (
                    <DropSelect value={selectedBackground} options={BACKGROUNDS} onChange={(v) => setSelectedBackground(v as BackgroundTheme)} accentColor={accentColor} />
                  )}
                  {backgroundSource === "stock_image" && (
                    <AIMediaPicker key={`image-${mediaRefreshKey}`} type="image" selected={backgroundMediaUrl} onSelect={setBackgroundMediaUrl} accentColor={accentColor} />
                  )}
                  {backgroundSource === "stock_video" && (
                    <AIMediaPicker key={`video-${mediaRefreshKey}`} type="video" selected={backgroundMediaUrl} onSelect={setBackgroundMediaUrl} accentColor={accentColor} />
                  )}
                  {backgroundSource === "team_theme" && (
                    <p className="text-[10px] text-muted-foreground/60">Uses the top player's team colour scheme.</p>
                  )}
                  {backgroundSource === "upload" && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground/60">Paste an image or video URL</p>
                      <input
                        type="text" value={customUploadUrl} onChange={(e) => setCustomUploadUrl(e.target.value)}
                        placeholder="https://…"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none placeholder:text-muted-foreground/40"
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-muted/20 transition-colors">
                    <input type="checkbox" checked={showTeamAccent} onChange={(e) => setShowTeamAccent(e.target.checked)} className="rounded" />
                    <span className="text-xs font-medium">Team colour accent bar</span>
                  </label>

                  <div className="pt-1 border-t border-border/40">
                    <AIMediaPackGenerator accentColor={accentColor} onSynced={handleMediaSynced} />
                  </div>
                </StepSection>

                {/* STEP 4 — Branding */}
                <StepSection
                  step="4"
                  title="Branding"
                  icon={<Type className="h-3.5 w-3.5" />}
                  openStep={openStep}
                  setOpenStep={setOpenStep}
                  accentColor={accentColor}
                >
                  {/* Accent colour */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Accent Colour</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ACCENT_MODES.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setAccentMode(m.id)}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all"
                          style={
                            accentMode === m.id
                              ? { background: `${m.color}18`, borderColor: `${m.color}55`, color: m.color }
                              : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                          }
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: m.color }} />
                          {m.label}
                        </button>
                      ))}
                    </div>
                    {accentMode === "custom" && (
                      <div className="flex items-center gap-2">
                        <input type="color" value={customAccent} onChange={(e) => setCustomAccent(e.target.value)} className="w-9 h-9 rounded-lg border border-border cursor-pointer p-0.5 bg-transparent" />
                        <input type="text" value={customAccent} onChange={(e) => setCustomAccent(e.target.value)} placeholder="#F59E0B" className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none font-mono placeholder:text-muted-foreground/40" />
                      </div>
                    )}
                    <label
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition-all"
                      style={autoTeamAccent ? { borderColor: `${accentColor}55`, background: `${accentColor}0c` } : { borderColor: "hsl(var(--border))" }}
                    >
                      <input type="checkbox" checked={autoTeamAccent} onChange={(e) => setAutoTeamAccent(e.target.checked)} className="rounded" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold">Auto Team Colour</p>
                        <p className="text-[10px] text-muted-foreground/55 mt-0.5">Follows the top player's AFL team</p>
                      </div>
                      {autoTeamAccent && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accentColor }} />}
                    </label>
                  </div>

                  {/* Rank highlight */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Rank Highlight</p>
                    <DropSelect value={rankHighlight} options={RANK_HIGHLIGHTS} onChange={(v) => setRankHighlight(v as RankHighlight)} accentColor={accentColor} />
                  </div>

                  {/* Logo */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Logo</p>
                    <div className="flex gap-2 items-center">
                      <label
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border text-[11px] text-muted-foreground cursor-pointer hover:bg-muted/20 transition-colors"
                        style={logoUrl ? { borderColor: `${accentColor}55`, color: accentColor } : {}}
                      >
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0]; if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => { if (ev.target?.result) setLogoUrl(ev.target.result as string); };
                          reader.readAsDataURL(file);
                        }} />
                        {logoUrl ? "Logo selected — click to replace" : "Upload logo image"}
                      </label>
                      {logoUrl && (
                        <button onClick={() => setLogoUrl("")} className="px-2 py-2 rounded-lg border border-border text-[11px] text-muted-foreground hover:bg-muted/20 transition-colors">✕</button>
                      )}
                    </div>
                    {logoUrl && <img src={logoUrl} alt="Logo preview" className="h-8 object-contain rounded" />}
                    <DropSelect value={logoPosition} options={LOGO_POSITIONS} onChange={(v) => setLogoPosition(v as LogoPosition)} accentColor={accentColor} />
                  </div>

                  {/* Overlays */}
                  <div className="space-y-2 pt-1 border-t border-border/40">
                    <p className="text-[11px] font-medium text-muted-foreground">Text Overlays</p>
                    <input type="text" value={roundLabel} onChange={(e) => setRoundLabel(e.target.value)} placeholder="Round Label (e.g. Round 12)" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none placeholder:text-muted-foreground/40" />
                    <input type="text" value={statHighlight} onChange={(e) => setStatHighlight(e.target.value)} placeholder="Stat Highlight (e.g. Captain Pick)" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none placeholder:text-muted-foreground/40" />
                    <input type="text" value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="CTA (e.g. neekostats.com.au)" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none placeholder:text-muted-foreground/40" />
                    {ctaText.trim() && (
                      <DropSelect value={ctaPosition} options={CTA_POSITIONS} onChange={(v) => setCtaPosition(v as CtaPosition)} accentColor={accentColor} />
                    )}
                    <input type="text" value={playerImageUrl} onChange={(e) => setPlayerImageUrl(e.target.value)} placeholder="Player Image URL (optional)" className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none placeholder:text-muted-foreground/40" />
                  </div>

                  {/* Layout Editor */}
                  <div className="pt-1 border-t border-border/40">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-muted/20 transition-colors">
                      <input type="checkbox" checked={layoutEditorOpen} onChange={(e) => { setLayoutEditorOpen(e.target.checked); if (!e.target.checked) setLayoutOffsets({ ...DEFAULT_LAYOUT_OFFSETS }); }} className="rounded" />
                      <SlidersHorizontal className="h-3.5 w-3.5 opacity-60" />
                      <span className="text-xs font-medium">Fine-tune Layout</span>
                    </label>
                    {layoutEditorOpen && (
                      <div className="space-y-3 px-1 pt-2">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { key: "titleX", label: "Title X", min: -80, max: 80, step: 1, fmt: (v: number) => String(v) },
                            { key: "titleY", label: "Title Y", min: -80, max: 80, step: 1, fmt: (v: number) => String(v) },
                          ].map(({ key, label, min, max, step, fmt: fmtFn }) => (
                            <div key={key} className="space-y-1">
                              <p className="text-[10px] text-muted-foreground/70 font-medium">{label}</p>
                              <div className="flex items-center gap-1.5">
                                <input type="range" min={min} max={max} step={step} value={layoutOffsets[key as keyof LayoutOffsets] as number} onChange={(e) => setLayoutOffsets((o) => ({ ...o, [key]: Number(e.target.value) }))} className="flex-1 h-1.5" style={{ accentColor }} />
                                <span className="text-[10px] tabular-nums w-7 text-right text-muted-foreground/60">{fmtFn(layoutOffsets[key as keyof LayoutOffsets] as number)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {[
                          { key: "playerImageScale", label: "Player Image", min: 0.5, max: 2, step: 0.05, fmt: (v: number) => `${v.toFixed(2)}x` },
                          { key: "logoScale",        label: "Logo Scale",   min: 0.5, max: 2, step: 0.05, fmt: (v: number) => `${v.toFixed(2)}x` },
                          { key: "overlayOpacity",   label: "Overlay Opacity", min: 0, max: 1, step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%` },
                          { key: "backgroundBlur",   label: "BG Blur",     min: 0, max: 20, step: 1, fmt: (v: number) => `${v}px` },
                        ].map(({ key, label, min, max, step, fmt: fmtFn }) => (
                          <div key={key} className="space-y-1">
                            <p className="text-[10px] text-muted-foreground/70 font-medium">{label}</p>
                            <div className="flex items-center gap-1.5">
                              <input type="range" min={min} max={max} step={step} value={layoutOffsets[key as keyof LayoutOffsets] as number} onChange={(e) => setLayoutOffsets((o) => ({ ...o, [key]: Number(e.target.value) }))} className="flex-1 h-1.5" style={{ accentColor }} />
                              <span className="text-[10px] tabular-nums w-10 text-right text-muted-foreground/60">{fmtFn(layoutOffsets[key as keyof LayoutOffsets] as number)}</span>
                            </div>
                          </div>
                        ))}
                        <button onClick={() => setLayoutOffsets({ ...DEFAULT_LAYOUT_OFFSETS })} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2 transition-colors">Reset</button>
                      </div>
                    )}
                  </div>
                </StepSection>

                {/* STEP 5 — Caption */}
                <StepSection
                  step="5"
                  title="Caption"
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  openStep={openStep}
                  setOpenStep={setOpenStep}
                  accentColor={accentColor}
                >
                  {/* Insight */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Stat Insight</p>
                    <div className="rounded-lg border border-border bg-muted/20 min-h-[70px] p-3">
                      {insight ? <p className="text-xs whitespace-pre-line leading-relaxed">{insight}</p> : <p className="text-[11px] text-muted-foreground/50">Generate a debate-style stat post.</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 h-8 text-xs" onClick={handleGenerateInsight} disabled={effectivePlayers.length === 0 || dataLoading}>
                        <Zap className="h-3.5 w-3.5 mr-1.5" />Generate Insight
                      </Button>
                      {insight && (
                        <Button variant="outline" size="sm" className="h-8 px-3" onClick={handleCopyInsight}>
                          {copiedInsight ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Caption */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Social Caption</p>
                    <div className="rounded-lg border border-border bg-muted/20 min-h-[70px] p-3">
                      {captionLoading
                        ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Generating…</div>
                        : caption
                        ? <p className="text-xs whitespace-pre-line leading-relaxed">{caption}</p>
                        : <p className="text-[11px] text-muted-foreground/50">AI-written post with hashtags.</p>
                      }
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 h-8 text-xs" onClick={handleGenerateCaption} disabled={captionLoading || effectivePlayers.length === 0}>
                        {captionLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                        Generate Caption
                      </Button>
                      {caption && (
                        <Button variant="outline" size="sm" className="h-8 px-3" onClick={handleCopyCaption}>
                          {copiedCaption ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-muted/20 transition-colors">
                    <input type="checkbox" checked={appendHashtags} onChange={(e) => setAppendHashtags(e.target.checked)} className="rounded" />
                    <span className="text-xs font-medium">Append hashtags</span>
                  </label>
                  <p className="text-[10px] text-muted-foreground/40">{AUTO_HASHTAGS}</p>

                  {(insight || caption) && (
                    <Button variant="outline" className="w-full h-8 text-xs" onClick={handleCopyPost}>
                      {copiedPost ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                      Copy Full Post
                    </Button>
                  )}

                  {/* AI Analysis toggle */}
                  <div className="rounded-lg border border-border bg-muted/10 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">Include AI Analysis overlay</p>
                        {includeAIAnalysis && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                            {aiAnalysisLoading ? "Fetching…" : aiAnalysisText ? `${aiAnalysisText.slice(0, 60)}…` : "No summary found"}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setIncludeAIAnalysis((v) => !v)}
                        className="shrink-0 w-10 h-6 rounded-full border-2 transition-all relative"
                        style={includeAIAnalysis ? { background: accentColor, borderColor: accentColor } : { background: "transparent", borderColor: "hsl(var(--border))" }}
                      >
                        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: includeAIAnalysis ? "calc(100% - 1.1rem)" : "2px" }} />
                      </button>
                    </div>
                  </div>
                </StepSection>

              </>
            ) : (
              /* VIDEO MODE controls */
              <VideoGeneratorPanel
                players={effectivePlayers}
                selectedAngle={selectedAngle}
                dataLoading={dataLoading}
                onPreviewChange={setVideoPreviewState}
                aiAnalysisText={effectiveAIText}
                includeAIAnalysis={includeAIAnalysis}
                onToggleAIAnalysis={setIncludeAIAnalysis}
                aiAnalysisLoading={aiAnalysisLoading}
              />
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN — Sticky Preview ────────────────────────────────── */}
        <div className="flex flex-col overflow-hidden bg-black/40 min-w-0" style={{ minHeight: 0 }}>

          {contentMode === "graphic" ? (
            <>
              {/* Action bar */}
              <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-background/60 backdrop-blur-sm">
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={handleShuffleTemplate}
                >
                  <Shuffle className="h-3 w-3" />Shuffle
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={() => fetchPlayers(selectedAngle, true)}
                  disabled={dataLoading}
                >
                  <RefreshCw className={`h-3 w-3 ${dataLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={handleAddToPlanner}
                  disabled={effectivePlayers.length === 0}
                  style={{ borderColor: `${accentColor}44`, color: accentColor }}
                >
                  <CalendarPlus className="h-3 w-3" />Planner
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={handleSaveToPlanner}
                  disabled={plannerSaving || effectivePlayers.length === 0}
                  style={plannerId ? { borderColor: "#22C55E44", color: "#22C55E" } : { borderColor: `${accentColor}44`, color: accentColor }}
                  title={plannerId ? "Update this planner post" : "Save as new planner post"}
                >
                  {plannerSaving
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <Save className="h-3 w-3" />
                  }
                  {plannerId ? "Update" : "Save"}
                </Button>
                <Button
                  size="sm" className="h-7 text-xs gap-1.5 ml-auto"
                  onClick={handleDownloadGraphic}
                  disabled={downloading || effectivePlayers.length === 0 || dataLoading}
                  style={effectivePlayers.length > 0 && !downloading ? { background: accentColor, color: "#000", borderColor: accentColor } : {}}
                  title="Download graphic"
                >
                  {downloading
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <Download className="h-3 w-3" />
                  }
                  Download
                </Button>
                <div className="text-[11px] text-muted-foreground/50">
                  {exportW}×{exportH}px{isCarouselMode ? ` · ${effectivePlayers.length + 1} slides` : ""}
                </div>
              </div>

              {/* Preview canvas */}
              <div className="flex-1 overflow-auto flex items-start justify-center p-4 sm:p-6" style={{ minHeight: 0 }}>
                {effectivePlayers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground h-full">
                    <LayoutTemplate className="h-12 w-12 opacity-15" />
                    <p className="text-sm opacity-60">Select a stat angle to preview</p>
                  </div>
                ) : (
                  (() => {
                    const vw = typeof window !== "undefined" ? Math.min(window.innerWidth - 480, 680) : 680;
                    const containerMaxW = vw;
                    const containerMaxH = typeof window !== "undefined" ? Math.min(window.innerHeight * 0.6, 680) : 680;
                    const scaleByW = containerMaxW / exportW;
                    const scaleByH = containerMaxH / exportH;
                    const scale = Math.min(scaleByW, scaleByH, 1);
                    const scaledW = Math.round(exportW * scale);
                    const scaledH = Math.round(exportH * scale);
                    return (
                      <div style={{ width: scaledW, height: scaledH, position: "relative", flexShrink: 0, overflow: "hidden", maxWidth: "100%" }}>
                        <div
                          ref={previewRef}
                          style={{ width: exportW, height: exportH, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}
                        >
                          {isCarouselMode ? (
                            <CarouselTitleSlide angle={selectedAngle} w={exportW} h={exportH} options={graphicOptions} totalPlayers={effectivePlayers.length} />
                          ) : (
                            <GraphicCanvas layout={effectiveLayout} angle={selectedAngle} players={effectivePlayers} w={exportW} h={exportH} options={graphicOptions} />
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Export controls pinned to bottom */}
              <div className="shrink-0 border-t border-border/40 bg-background/80 backdrop-blur-sm p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <DropSelect
                      value={selectedExportSize.id}
                      options={EXPORT_SIZES.map((s) => ({ id: s.id, label: s.label }))}
                      onChange={(v) => { const sz = EXPORT_SIZES.find((s) => s.id === v); if (sz) setSelectedExportSize(sz); }}
                      accentColor={accentColor}
                    />
                  </div>
                </div>
                <Button
                  className="w-full h-10 text-sm font-semibold"
                  onClick={handleDownloadGraphic}
                  disabled={downloading || effectivePlayers.length === 0 || dataLoading}
                  style={effectivePlayers.length > 0 && !downloading ? { background: accentColor, color: "#000" } : {}}
                >
                  {downloading ? (
                    carouselProgress
                      ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Exporting {carouselProgress.done}/{carouselProgress.total}…</>
                      : <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                  ) : isCarouselMode ? (
                    <><Layers className="h-4 w-4 mr-2" />Export Carousel ({effectivePlayers.length + 1} slides)</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" />Download Graphic</>
                  )}
                </Button>
                <p className="text-[10px] text-muted-foreground/30 text-center">
                  Preview is scaled to fit. Download renders at full resolution.
                </p>
              </div>
            </>
          ) : (
            /* VIDEO MODE right panel */
            <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
              <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-background/60 backdrop-blur-sm">
                <Video className="h-3.5 w-3.5" style={{ color: videoPreviewState?.accentColor ?? accentColor }} />
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Video Preview</p>
                {videoPreviewState?.generating && (
                  <div className="ml-auto flex items-center gap-2">
                    <div className="h-1 w-32 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-200" style={{ width: `${videoPreviewState.progress}%`, background: videoPreviewState.accentColor }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground/60 tabular-nums">{videoPreviewState.progress}%</span>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-auto p-6" style={{ minHeight: 0 }}>
                {(!videoPreviewState?.videoUrl && !videoPreviewState?.squareUrl) ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="rounded-xl border border-border/30 bg-muted/10 p-6 text-center space-y-2 max-w-sm">
                      {videoPreviewState?.generating ? (
                        <>
                          <RefreshCw className="h-8 w-8 mx-auto animate-spin opacity-40" style={{ color: videoPreviewState.accentColor }} />
                          <p className="text-sm font-semibold">Generating video…</p>
                          <p className="text-xs text-muted-foreground/60">Rendering {videoPreviewState.dualPreview ? "Phone + Square" : "Phone"} format locally.</p>
                        </>
                      ) : (
                        <>
                          <Play className="h-8 w-8 mx-auto opacity-20" style={{ color: accentColor }} />
                          <p className="text-sm font-semibold">Video Preview</p>
                          <p className="text-xs text-muted-foreground/60 leading-relaxed">Configure settings in the left panel, then click Generate Video.</p>
                          <p className="text-[10px] text-muted-foreground/40">Videos render locally at full resolution.</p>
                        </>
                      )}
                    </div>
                  </div>
                ) : videoPreviewState?.dualPreview && videoPreviewState.squareUrl ? (
                  <div className="space-y-4">
                    <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                      {videoPreviewState.videoUrl && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60"><Smartphone className="h-3 w-3" />Phone (9:16)</div>
                          <div className="rounded-xl overflow-hidden border border-border bg-black w-full" style={{ aspectRatio: "9/16" }}>
                            <video src={videoPreviewState.videoUrl} controls autoPlay loop muted playsInline className="w-full h-full object-cover" />
                          </div>
                          <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => videoPreviewState.onDownload(videoPreviewState.videoBlob, "-reels")} style={{ borderColor: `${videoPreviewState.accentColor}44`, color: videoPreviewState.accentColor }}>
                            <Download className="h-3.5 w-3.5 mr-1.5" />Download Phone
                          </Button>
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60"><Square className="h-3 w-3" />Square (1:1)</div>
                        <div className="rounded-xl overflow-hidden border border-border bg-black w-full" style={{ aspectRatio: "1/1" }}>
                          <video src={videoPreviewState.squareUrl} controls autoPlay loop muted playsInline className="w-full h-full object-cover" />
                        </div>
                        <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => videoPreviewState.onDownload(videoPreviewState.squareBlob, "-square")} style={{ borderColor: `${videoPreviewState.accentColor}44`, color: videoPreviewState.accentColor }}>
                          <Download className="h-3.5 w-3.5 mr-1.5" />Download Square
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : videoPreviewState?.videoUrl ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="space-y-2 w-full" style={{ maxWidth: 420 }}>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60"><Smartphone className="h-3 w-3" />Phone (9:16)</div>
                      <div className="rounded-xl overflow-hidden border border-border bg-black w-full" style={{ aspectRatio: "9/16" }}>
                        <video src={videoPreviewState.videoUrl} controls autoPlay loop muted playsInline className="w-full h-full object-cover" />
                      </div>
                      <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => videoPreviewState.onDownload(videoPreviewState.videoBlob, "-reels")} style={{ borderColor: `${videoPreviewState.accentColor}44`, color: videoPreviewState.accentColor }}>
                        <Download className="h-3.5 w-3.5 mr-1.5" />Download Video
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {plannerModalOpen && (
      <AddToPlannerModal
        payload={{ stat_angle: selectedAngle.label, media_url: plannerMediaUrl, caption, insight }}
        onClose={() => { setPlannerModalOpen(false); setPlannerMediaUrl(null); }}
      />
    )}
    </>
  );
}
