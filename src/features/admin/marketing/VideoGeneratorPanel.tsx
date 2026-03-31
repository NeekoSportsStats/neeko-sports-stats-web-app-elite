import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Video, RefreshCw, TriangleAlert as AlertTriangle,
  X, Check, ChevronDown, Smartphone, Square, Settings2, Clapperboard,
} from "lucide-react";
import {
  generateVideo,
  DEFAULT_VIDEO_CONFIG,
  type VideoConfig,
  type VideoSlideData,
  type VideoTemplate,
  type AnimationSpeed,
  type VideoBackground,
  type ExportSize,
  type SlideTransition,
} from "../pages/VideoGenerator";
import type { ContentPlayer, StatAngle } from "./GraphicTemplates";
import { AIVideoLibrary } from "./AIVideoLibrary";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VideoPreviewState {
  videoUrl: string | null;
  videoBlob: Blob | null;
  squareUrl: string | null;
  squareBlob: Blob | null;
  dualPreview: boolean;
  generating: boolean;
  progress: number;
  accentColor: string;
  angleId: string;
  template: string;
  onDownload: (blob: Blob | null, suffix?: string) => void;
}

interface Props {
  players: ContentPlayer[];
  selectedAngle: StatAngle;
  dataLoading: boolean;
  onPreviewChange?: (state: VideoPreviewState) => void;
  aiAnalysisText?: string;
  includeAIAnalysis?: boolean;
  onToggleAIAnalysis?: (v: boolean) => void;
  aiAnalysisLoading?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ANGLE_TEMPLATE_MAP: Record<string, VideoTemplate> = {
  top_projections:     "projection_battle",
  breakout_players:    "breakout_alert",
  captain_picks:       "captain_picks",
  best_value_picks:    "leaderboard_video",
  underpriced_players: "leaderboard_video",
  highest_ceilings:    "stat_video",
  safe_floor_players:  "stat_video",
  most_consistent:     "leaderboard_video",
  high_risk_reward:    "player_spotlight",
  form_players:        "player_spotlight",
  projection_risers:   "projection_battle",
  differential_picks:  "player_spotlight",
  best_matchups:       "leaderboard_video",
  worst_matchups:      "leaderboard_video",
  rookie_watch:        "player_spotlight",
  trade_targets:       "trade_targets",
  avoid_players:       "leaderboard_video",
  mid_priced_breakouts: "breakout_alert",
  pod_picks:           "player_spotlight",
  fantasy_sleepers:    "player_spotlight",
};

const TEMPLATES: { id: VideoTemplate; label: string; desc: string }[] = [
  { id: "stat_video",        label: "Stat Video",        desc: "Big stat + player spotlight" },
  { id: "projection_battle", label: "Projection Battle", desc: "Big stat + leaderboard" },
  { id: "leaderboard_video", label: "Leaderboard Video", desc: "Ranked list focus" },
  { id: "player_spotlight",  label: "Player Spotlight",  desc: "Player-first narrative" },
  { id: "breakout_alert",    label: "Breakout Alert",    desc: "Upside + spotlight" },
  { id: "captain_picks",     label: "Captain Picks",     desc: "Leaderboard + spotlight" },
  { id: "trade_targets",     label: "Trade Targets",     desc: "Leaderboard + big stat" },
];

const TRANSITIONS: { id: SlideTransition; label: string }[] = [
  { id: "fade",   label: "Fade"   },
  { id: "slide",  label: "Slide"  },
  { id: "zoom",   label: "Zoom"   },
  { id: "bounce", label: "Bounce" },
];

const SLIDE_COUNTS = [3, 4, 5, 6];
const SLIDE_DURATIONS = [
  { value: 2, label: "2s" },
  { value: 3, label: "3s" },
  { value: 4, label: "4s" },
  { value: 5, label: "5s" },
];
const ANIM_SPEEDS: { id: AnimationSpeed; label: string }[] = [
  { id: "slow",   label: "Slow"   },
  { id: "medium", label: "Medium" },
  { id: "fast",   label: "Fast"   },
];
const BACKGROUNDS: { id: VideoBackground; label: string; desc?: string }[] = [
  { id: "dark_gradient",  label: "Dark Gradient"  },
  { id: "stadium_lights", label: "Stadium Lights" },
  { id: "grass_texture",  label: "Grass Texture"  },
  { id: "analytics_grid", label: "Analytics Grid" },
  { id: "team_colour",    label: "Team Colour"    },
  { id: "ai_stadium",     label: "AI Stadium",    desc: "AI video" },
  { id: "ai_crowd",       label: "AI Crowd",      desc: "AI video" },
  { id: "ai_field",       label: "AI Field",      desc: "AI video" },
  { id: "ai_abstract",    label: "AI Abstract",   desc: "AI video" },
  { id: "ai_players",     label: "AI Players",    desc: "AI video" },
];
const EXPORT_SIZES: { id: ExportSize; label: string; dims: string }[] = [
  { id: "tiktok_reels",   label: "TikTok / Reels",  dims: "1080×1920" },
  { id: "instagram_post", label: "Instagram Square", dims: "1080×1080" },
];

const AUTO_HASHTAGS = "#aflfantasy #aflfantasy2026 #fantasyfooty #aflstats";

const fmt    = (n: number | null, suffix = "") => n != null ? `${Math.round(Number(n))}${suffix}` : "—";
const fmtDec = (n: number | null, dp = 1, suffix = "") => n != null ? `${Number(n).toFixed(dp)}${suffix}` : "—";

// ─── Build slide data ─────────────────────────────────────────────────────────

function buildSlideData(
  players: ContentPlayer[],
  angle: StatAngle,
  roundLabel?: string,
  statHighlight?: string,
  ctaText?: string,
  aiAnalysisText?: string,
): VideoSlideData {
  const top = players[0];
  return {
    angleTitle:    angle.title,
    angleSubtitle: angle.subtitle,
    statLabel:     angle.statLabel,
    statValue:     top ? angle.statFn(top) : "—",
    playerName:    top?.player_name ?? "—",
    team:          top?.team ?? "—",
    position:      top?.position ?? null,
    accentColor:   angle.accentColor,
    roundLabel:    roundLabel?.trim() || undefined,
    statHighlight: statHighlight?.trim() || undefined,
    ctaText:       ctaText?.trim() || undefined,
    aiAnalysisText: aiAnalysisText || undefined,
    secondaryStats: [
      { label: "Projection",  value: top ? fmt(top.projection_final, " pts") : "—" },
      { label: "Ceiling",     value: top ? fmt(top.ceiling_estimate, " pts") : "—" },
      { label: "Consistency", value: top ? fmtDec(top.consistency_score, 0, "%") : "—" },
    ],
    leaderboardRows: players.slice(0, 8).map((p, i) => ({
      rank: i + 1,
      name: p.player_name,
      stat: angle.statFn(p),
    })),
  };
}

// ─── Dropdown helper ─────────────────────────────────────────────────────────

interface DropdownProps<T extends string> {
  value: T;
  options: { id: T; label: string; dims?: string; desc?: string }[];
  onChange: (v: T) => void;
  accentColor: string;
  label?: string;
}

function Dropdown<T extends string>({ value, options, onChange, accentColor, label }: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <div className="relative">
      {label && <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-1.5">{label}</p>}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-background text-xs font-medium transition-colors hover:bg-muted/40"
      >
        <span className="truncate">{selected?.label ?? value}{selected?.dims ? ` (${selected.dims})` : ""}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground ml-2 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-xl z-30 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { onChange(opt.id); setOpen(false); }}
              className="w-full flex items-start justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors gap-3"
              style={opt.id === value ? { color: accentColor } : {}}
            >
              <div className="text-left min-w-0">
                <div className="font-medium truncate">{opt.label}{opt.dims ? ` (${opt.dims})` : ""}</div>
                {opt.desc && <div className="text-[10px] opacity-50 mt-0.5">{opt.desc}</div>}
              </div>
              {opt.id === value && <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1" style={{ background: accentColor }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toggle helper ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange, accentColor }: { checked: boolean; onChange: (v: boolean) => void; accentColor: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="shrink-0 w-10 h-6 rounded-full border-2 transition-all relative"
      style={checked
        ? { background: accentColor, borderColor: accentColor }
        : { background: "transparent", borderColor: "hsl(var(--border))" }
      }
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
        style={{ left: checked ? "calc(100% - 1.1rem)" : "2px" }}
      />
    </button>
  );
}

// ─── Narration warning modal ──────────────────────────────────────────────────

function NarrationWarningModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold">Voice Narration Cost Warning</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Voice narration uses <strong>OpenAI Text-to-Speech</strong> and may incur API costs depending on usage.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-amber-500/08 border border-amber-500/20 p-3.5">
          <p className="text-xs font-semibold text-amber-500 mb-1">Estimated cost</p>
          <p className="text-xs text-muted-foreground leading-relaxed">~$0.002–$0.01 per narration, depending on length.</p>
        </div>
        <div className="flex gap-2.5 pt-1">
          <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={onCancel}>
            <X className="h-3.5 w-3.5 mr-1.5" />Cancel
          </Button>
          <Button size="sm" className="flex-1 h-9 text-xs bg-amber-500 hover:bg-amber-600 text-black" onClick={onConfirm}>
            <Check className="h-3.5 w-3.5 mr-1.5" />Enable Narration
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Slide plan preview ───────────────────────────────────────────────────────

function SlidePlanPreview({ config, accentColor }: { config: VideoConfig; accentColor: string }) {
  const estimatedSec = (config.numSlides + (config.showIntro ? 1 : 0) + (config.showOutro ? 1 : 0)) * config.slideDurationSec;

  const slides: { label: string; accent?: boolean }[] = [];
  if (config.showIntro) slides.push({ label: "Intro" });
  const coreLabels = ["Title", "Big Stat", "Players", "Leaderboard", "Spotlight", "Branding"];
  for (let i = 0; i < config.numSlides; i++) {
    slides.push({ label: coreLabels[Math.min(i, coreLabels.length - 1)], accent: true });
  }
  if (config.showOutro) slides.push({ label: "Outro" });

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Slide Plan</p>
        <p className="text-[10px] text-muted-foreground/50 tabular-nums">~{estimatedSec}s total</p>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {slides.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium"
            style={
              s.accent
                ? { borderColor: `${accentColor}40`, color: accentColor, background: `${accentColor}0a` }
                : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground)/0.45)" }
            }
          >
            <span style={{ color: "hsl(var(--muted-foreground)/0.3)" }}>{i + 1}.</span>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VideoGeneratorPanel({
  players, selectedAngle, dataLoading,
  onPreviewChange,
  aiAnalysisText, includeAIAnalysis = false,
  onToggleAIAnalysis, aiAnalysisLoading = false,
}: Props) {
  const { toast } = useToast();

  const [config, setConfig] = useState<VideoConfig>({
    ...DEFAULT_VIDEO_CONFIG,
    template: ANGLE_TEMPLATE_MAP[selectedAngle.id] ?? "stat_video",
  });
  const [generating, setGenerating]                     = useState(false);
  const [progress, setProgress]                         = useState(0);
  const [videoBlob, setVideoBlob]                       = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl]                         = useState<string | null>(null);
  const [squareBlob, setSquareBlob]                     = useState<Blob | null>(null);
  const [squareUrl, setSquareUrl]                       = useState<string | null>(null);
  const [showNarrationWarning, setShowNarrationWarning] = useState(false);
  const [selectedAIVideoUrl, setSelectedAIVideoUrl]     = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen]                 = useState(false);
  const [dualPreview, setDualPreview]                   = useState(false);
  const [roundLabel, setRoundLabel]                     = useState("");
  const [statHighlight, setStatHighlight]               = useState("");
  const [ctaText, setCtaText]                           = useState("See full rankings at neekostats.com.au");

  const accentColor = selectedAngle.accentColor;

  useEffect(() => {
    const mapped = ANGLE_TEMPLATE_MAP[selectedAngle.id] ?? "stat_video";
    setConfig((prev) => ({ ...prev, template: mapped }));
  }, [selectedAngle.id]);

  useEffect(() => {
    if (!onPreviewChange) return;
    onPreviewChange({
      videoUrl, videoBlob, squareUrl, squareBlob,
      dualPreview, generating, progress,
      accentColor,
      angleId: selectedAngle.id,
      template: config.template,
      onDownload: handleDownload,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, squareUrl, dualPreview, generating, progress]);

  const update = <K extends keyof VideoConfig>(key: K, val: VideoConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: val }));

  const handleGenerate = async () => {
    if (players.length === 0) return;
    setGenerating(true);
    setProgress(0);
    if (videoUrl) { URL.revokeObjectURL(videoUrl); setVideoUrl(null); }
    if (squareUrl) { URL.revokeObjectURL(squareUrl); setSquareUrl(null); }
    setVideoBlob(null);
    setSquareBlob(null);

    try {
      const data = buildSlideData(players, selectedAngle, roundLabel, statHighlight, ctaText, includeAIAnalysis ? aiAnalysisText : undefined);
      const reelsConfig: VideoConfig = { ...config, aiVideoUrl: selectedAIVideoUrl ?? undefined };
      const blob = await generateVideo(data, setProgress, reelsConfig);
      const url  = URL.createObjectURL(blob);
      setVideoBlob(blob);
      setVideoUrl(url);

      if (dualPreview) {
        const squareCfg: VideoConfig = { ...config, exportSize: "instagram_post", aiVideoUrl: selectedAIVideoUrl ?? undefined };
        const sBlob = await generateVideo(data, () => {}, squareCfg);
        const sUrl  = URL.createObjectURL(sBlob);
        setSquareBlob(sBlob);
        setSquareUrl(sUrl);
      }

      setProgress(100);
      toast({ title: "Video ready", description: "Preview and download below." });
    } catch (err) {
      toast({ title: "Video generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (blob: Blob | null, suffix = "") => {
    if (!blob) return;
    const link = document.createElement("a");
    link.download = `neeko-${selectedAngle.id}-${config.template}${suffix}.webm`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: "Video downloading", description: "WebM — compatible with TikTok, Reels, and modern devices." });
  };

  const handleNarrationToggle = () => {
    if (!config.narrationEnabled) {
      setShowNarrationWarning(true);
    } else {
      update("narrationEnabled", false);
    }
  };

  const templateLabel = TEMPLATES.find((t) => t.id === config.template)?.label ?? config.template;
  const sizeEntry     = EXPORT_SIZES.find((s) => s.id === config.exportSize);

  return (
    <div className="space-y-4 pt-4 border-t border-border">
      {showNarrationWarning && (
        <NarrationWarningModal
          onConfirm={() => { update("narrationEnabled", true); setShowNarrationWarning(false); }}
          onCancel={() => setShowNarrationWarning(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4" style={{ color: accentColor }} />
        <p className="text-sm font-semibold">Video Generator</p>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border font-medium" style={{ borderColor: `${accentColor}30`, color: accentColor }}>
          Local render · Free
        </span>
      </div>

      {/* Active angle summary */}
      <div
        className="rounded-xl border p-3 space-y-1"
        style={{ borderColor: `${accentColor}30`, background: `${accentColor}08` }}
      >
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Active Stat Angle</p>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${accentColor}20`, color: accentColor }}>
            {templateLabel}
          </span>
        </div>
        <p className="text-xs font-semibold" style={{ color: accentColor }}>{selectedAngle.label}</p>
        <p className="text-[11px] text-muted-foreground/60 truncate">{selectedAngle.title}</p>
      </div>

      {/* Export format */}
      <Dropdown
        value={config.exportSize}
        options={EXPORT_SIZES}
        onChange={(v) => update("exportSize", v)}
        accentColor={accentColor}
        label="Export Format"
      />

      {/* Slide count + duration row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-1.5">Slides</p>
          <div className="grid grid-cols-4 gap-1">
            {SLIDE_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => update("numSlides", n)}
                className="py-1.5 rounded-lg border text-xs font-semibold transition-all"
                style={
                  config.numSlides === n
                    ? { background: `${accentColor}20`, borderColor: `${accentColor}55`, color: accentColor }
                    : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-1.5">Duration</p>
          <div className="grid grid-cols-4 gap-1">
            {SLIDE_DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => update("slideDurationSec", d.value)}
                className="py-1.5 rounded-lg border text-xs font-semibold transition-all"
                style={
                  config.slideDurationSec === d.value
                    ? { background: `${accentColor}20`, borderColor: `${accentColor}55`, color: accentColor }
                    : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Slide plan preview */}
      <SlidePlanPreview config={config} accentColor={accentColor} />

      {/* Dual preview toggle */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border">
        <div>
          <p className="text-xs font-semibold">Dual Preview</p>
          <p className="text-[11px] text-muted-foreground/55 mt-0.5">Also generate Square (1:1) alongside Phone</p>
        </div>
        <Toggle checked={dualPreview} onChange={setDualPreview} accentColor={accentColor} />
      </div>

      {/* Generate button */}
      <Button
        className="w-full h-11 text-sm font-semibold gap-2"
        onClick={handleGenerate}
        disabled={generating || players.length === 0 || dataLoading}
        style={players.length > 0 && !generating ? { background: accentColor, color: "#000", borderColor: accentColor } : {}}
      >
        {generating ? (
          <><RefreshCw className="h-4 w-4 animate-spin" />Generating… {progress}%</>
        ) : (
          <><Clapperboard className="h-4 w-4" />Generate Video{dualPreview ? " (Phone + Square)" : ""}</>
        )}
      </Button>

      {/* Progress bar */}
      {(generating || progress > 0) && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${progress}%`, background: accentColor }}
          />
        </div>
      )}

      {/* Download strip — shown when video is ready */}
      {(videoUrl || squareUrl) && !generating && (
        <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Ready to Download</p>
          <div className="flex gap-2">
            {videoUrl && (
              <Button
                variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => handleDownload(videoBlob, config.exportSize === "instagram_post" ? "-square" : "-reels")}
                style={{ borderColor: `${accentColor}44`, color: accentColor }}
              >
                <Smartphone className="h-3 w-3" />
                {sizeEntry ? `${sizeEntry.label} (${sizeEntry.dims})` : "Download"}
              </Button>
            )}
            {squareUrl && dualPreview && (
              <Button
                variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => handleDownload(squareBlob, "-square")}
                style={{ borderColor: `${accentColor}44`, color: accentColor }}
              >
                <Square className="h-3 w-3" />Square (1080×1080)
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Advanced Settings collapsible ─────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/20"
        >
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-xs font-semibold text-muted-foreground/60 flex-1">Advanced Settings</span>
          <ChevronDown
            className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-200 shrink-0"
            style={{ transform: advancedOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        {advancedOpen && (
          <div className="px-4 pb-4 pt-2 space-y-4 border-t border-border/40">

            {/* Template override */}
            <Dropdown
              value={config.template}
              options={TEMPLATES}
              onChange={(v) => update("template", v)}
              accentColor={accentColor}
              label="Video Template"
            />

            {/* Transition + Background */}
            <div className="grid grid-cols-2 gap-3">
              <Dropdown
                value={config.transition}
                options={TRANSITIONS}
                onChange={(v) => update("transition", v)}
                accentColor={accentColor}
                label="Transition"
              />
              <Dropdown
                value={config.background}
                options={BACKGROUNDS}
                onChange={(v) => { update("background", v); if (!v.startsWith("ai_")) setSelectedAIVideoUrl(null); }}
                accentColor={accentColor}
                label="Background"
              />
            </div>

            {/* Animation speed */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-1.5">Animation Speed</p>
              <div className="grid grid-cols-3 gap-1.5">
                {ANIM_SPEEDS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => update("animationSpeed", s.id)}
                    className="py-2 rounded-lg border text-xs font-semibold transition-all"
                    style={
                      config.animationSpeed === s.id
                        ? { background: `${accentColor}20`, borderColor: `${accentColor}55`, color: accentColor }
                        : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Video Library */}
            {config.background.startsWith("ai_") && (
              <div className="rounded-xl border border-border bg-card p-3.5">
                <AIVideoLibrary
                  selectedUrl={selectedAIVideoUrl}
                  accentColor={accentColor}
                  onSelect={setSelectedAIVideoUrl}
                />
              </div>
            )}

            {/* Slide options */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Slide Options</p>
              {(
                [
                  { key: "showIntro"          , label: "Intro Slide",    desc: "Neeko branding opener" },
                  { key: "showOutro"          , label: "Outro Slide",    desc: "CTA call-to-action" },
                  { key: "soundEffectsEnabled", label: "Sound Effects",  desc: "Whoosh / transition sounds" },
                ] as { key: keyof VideoConfig; label: string; desc: string }[]
              ).map(({ key, label, desc }) => (
                <div key={key as string} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="text-[11px] text-muted-foreground/55 mt-0.5">{desc}</p>
                  </div>
                  <Toggle checked={config[key] as boolean} onChange={(v) => update(key, v)} accentColor={accentColor} />
                </div>
              ))}
            </div>

            {/* Content overlays */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Content Overlays</p>
              {[
                { value: roundLabel,    setter: setRoundLabel,    placeholder: "e.g. Round 12",     label: "Round Label"    },
                { value: statHighlight, setter: setStatHighlight, placeholder: "e.g. Captain Pick", label: "Stat Highlight" },
                { value: ctaText,       setter: setCtaText,       placeholder: "neekostats.com.au",  label: "CTA Text"       },
              ].map(({ value, setter, placeholder, label }) => (
                <div key={label} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                  <input
                    type="text" value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none placeholder:text-muted-foreground/40"
                  />
                </div>
              ))}
            </div>

            {/* AI Analysis toggle */}
            {onToggleAIAnalysis && (
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
                  <Toggle checked={includeAIAnalysis} onChange={onToggleAIAnalysis} accentColor={accentColor} />
                </div>
              </div>
            )}

            {/* Narration toggle */}
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    AI Voice Narration
                    <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium text-amber-500 border-amber-500/30 bg-amber-500/08">
                      May incur cost
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Uses OpenAI TTS — reads headline and insight.</p>
                </div>
                <button
                  onClick={handleNarrationToggle}
                  className="shrink-0 w-10 h-6 rounded-full border-2 transition-all relative"
                  style={config.narrationEnabled
                    ? { background: "#F59E0B", borderColor: "#F59E0B" }
                    : { background: "transparent", borderColor: "hsl(var(--border))" }
                  }
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                    style={{ left: config.narrationEnabled ? "calc(100% - 1.1rem)" : "2px" }}
                  />
                </button>
              </div>
              {config.narrationEnabled && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-500">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Narration enabled — ~$0.002–$0.01 per video.
                </div>
              )}
            </div>

            {/* Hashtags info */}
            <div className="rounded-xl bg-muted/10 border border-border/40 px-3.5 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-1">Auto Hashtags</p>
              <p className="text-[11px] font-medium" style={{ color: accentColor }}>{AUTO_HASHTAGS}</p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
