import { useState, useRef, useEffect } from "react";
import useMarketingPlayers from "./useMarketingPlayers";
import { cleanAiText, truncateSmart } from "@/utils/cleanAiText";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Copy, Check, RefreshCw, ChevronDown, Search,
  Clapperboard, Zap, Volume2, VolumeX, Play, Square, BookmarkPlus, Mic,
} from "lucide-react";
import type { MarketingPlayer } from "./types";
import { addToLibrary } from "./lib/library";
import { generateCaptions, formatCaptionsForExport } from "./lib/captions";
import { useToast } from "@/hooks/use-toast";

type Angle  = "buy" | "sell" | "breakout" | "trap";
type Format = "tiktok" | "story" | "landscape";
type Length = 15 | 30 | 45;
type SceneType = "hook" | "player" | "stats" | "analysis" | "deep" | "cta";

interface Scene {
  index:        number;
  title:        string;
  type:         SceneType;
  onScreenText: string;
  visual:       string;
  duration:     number;
}

interface GeneratedContent {
  hooks:    string[];
  script:   string;
  scenes:   Scene[];
  captions: string;
}

const ANGLE_CONFIG: Record<Angle, { label: string; symbol: string; hookTemplates: string[] }> = {
  buy: {
    label: "Buy",
    symbol: "+",
    hookTemplates: [
      "This is the value play no one is talking about",
      "{PLAYER} is underpriced right now",
      "You're sleeping on {PLAYER} this week",
    ],
  },
  sell: {
    label: "Sell",
    symbol: "-",
    hookTemplates: [
      "This player is starting to look overpriced",
      "{PLAYER} is a trap at this price",
      "This is where the risk starts to show",
    ],
  },
  breakout: {
    label: "Breakout",
    symbol: "^",
    hookTemplates: [
      "{PLAYER} is trending toward a breakout",
      "This could be the week {PLAYER} jumps",
      "The upside is building for {PLAYER}",
    ],
  },
  trap: {
    label: "Trap",
    symbol: "!",
    hookTemplates: [
      "This looks good on the surface, but it isn't",
      "{PLAYER} is the trap people are missing",
      "There's less here than the hype suggests",
    ],
  },
};

const ANGLE_SCENE_STYLES: Record<Angle, { bg: string; accent: string; text: string }> = {
  buy:      { bg: "from-emerald-950 to-slate-950", accent: "text-emerald-400", text: "text-emerald-200" },
  sell:     { bg: "from-red-950 to-slate-950",     accent: "text-red-400",     text: "text-red-200"     },
  breakout: { bg: "from-sky-950 to-slate-950",     accent: "text-sky-400",     text: "text-sky-200"     },
  trap:     { bg: "from-amber-950 to-slate-950",   accent: "text-amber-400",   text: "text-amber-200"   },
};

const FORMAT_CONFIG: Record<Format, { label: string; desc: string }> = {
  tiktok:    { label: "TikTok / Reel", desc: "9:16 vertical"   },
  story:     { label: "Story",         desc: "9:16 static"      },
  landscape: { label: "Landscape",     desc: "16:9 horizontal"  },
};

function buildHooks(angle: Angle, player: MarketingPlayer): string[] {
  return ANGLE_CONFIG[angle].hookTemplates.map((h) =>
    h.replace("{PLAYER}", player.player_name)
  );
}

function buildScript(
  angle: Angle,
  player: MarketingPlayer,
  hook: string,
  length: Length
): string {
  const why = truncateSmart(
    cleanAiText(player.recommendation_why ?? player.summary_short ?? ""),
    180
  );
  const analysis = truncateSmart(
    cleanAiText(player.summary_long ?? player.summary_short ?? ""),
    length === 15 ? 80 : length === 30 ? 160 : 240
  );
  const proj  = player.projection_final != null ? Math.round(player.projection_final) : null;
  const price = player.price != null ? `$${(player.price / 1000).toFixed(0)}k` : null;

  const statLine =
    proj != null && price != null
      ? `Projected at ${proj} points, currently priced at ${price}.`
      : proj != null
      ? `Projected at ${proj} points this week.`
      : "";

  const lines: string[] = [hook + "."];

  if (length >= 30 && statLine) lines.push(statLine);
  if (why) lines.push(why);
  if (length >= 45 && analysis && analysis !== why) lines.push(analysis);

  const cta =
    angle === "buy" || angle === "breakout"
      ? "Make the move before the price rises."
      : "Know before you commit your trades.";

  lines.push(cta);
  lines.push("Full rankings on Neeko Sports Stats.");

  return lines.join("\n\n");
}

function buildScenes(
  angle: Angle,
  player: MarketingPlayer,
  hook: string,
  length: Length
): Scene[] {
  const proj         = player.projection_final != null ? Math.round(player.projection_final) : null;
  const value        = player.value_score != null ? Number(player.value_score).toFixed(1) : null;
  const price        = player.price != null ? `$${(player.price / 1000).toFixed(0)}k` : null;
  const analysisLine = truncateSmart(
    cleanAiText(player.recommendation_why ?? player.summary_short ?? ""),
    90
  );

  const perScene = Math.floor(length / 5);

  const statsText = [
    proj  != null ? `Projection: ${proj}pt` : null,
    value != null ? `Value: ${value}` : null,
    price != null ? `Price: ${price}` : null,
  ].filter(Boolean).join("  |  ");

  const scenes: Scene[] = [
    {
      index: 1, title: "Hook", type: "hook",
      onScreenText: hook,
      visual: "Bold text centred on dark gradient background",
      duration: perScene,
    },
    {
      index: 2, title: "Player Card", type: "player",
      onScreenText: `${player.player_name} • ${player.team ?? ""}${player.position ? ` • ${player.position}` : ""}`,
      visual: "Player card — generate in Image Engine tab",
      duration: perScene,
    },
    {
      index: 3, title: "Numbers", type: "stats",
      onScreenText: statsText || "Stats loading...",
      visual: "Stats overlay card on branded background",
      duration: perScene,
    },
    {
      index: 4, title: "Analysis", type: "analysis",
      onScreenText: analysisLine || "Key insight from Neeko AI",
      visual: "Branded panel with player name watermark",
      duration: perScene,
    },
    {
      index: 5, title: "CTA", type: "cta",
      onScreenText: "See full rankings at neekostats.com.au",
      visual: "Neeko logo + URL on solid background",
      duration: perScene,
    },
  ];

  if (length === 45) {
    const extra = truncateSmart(cleanAiText(player.summary_long ?? ""), 80);
    scenes.splice(4, 0, {
      index: 5, title: "Deep Dive", type: "deep",
      onScreenText: extra || `${ANGLE_CONFIG[angle].label} signal confirmed by multiple data points`,
      visual: "Text-heavy card with supporting stat callouts",
      duration: perScene,
    });
    scenes[5] = { ...scenes[5], index: 6 };
    scenes[6] = { ...scenes[6], index: 7 };
  }

  return scenes.map((s, i) => ({ ...s, index: i + 1 }));
}

function buildCaptions(script: string): string {
  return script
    .split("\n\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => (i === 0 ? l.toUpperCase() : l))
    .join("\n");
}

function buildScenesFromVoice(script: string, length: Length): Scene[] {
  const lines = script.split("\n").filter((l) => l.trim().length > 0);
  const perScene = Math.floor(length / 5);
  const scenes: Scene[] = lines.slice(0, 5).map((line, i) => ({
    index:        i + 1,
    title:        i === 0 ? "Hook" : i === lines.length - 1 ? "CTA" : `Scene ${i + 1}`,
    type:         (i === 0 ? "hook" : i === lines.length - 1 ? "cta" : "analysis") as SceneType,
    onScreenText: line,
    visual:       i === 0
      ? "Bold text centred on dark gradient background"
      : i === lines.length - 1
      ? "Neeko logo + URL on solid background"
      : "Branded panel with player name watermark",
    duration: perScene,
  }));
  if (scenes.length < 5) {
    scenes.push({
      index:        scenes.length + 1,
      title:        "CTA",
      type:         "cta" as SceneType,
      onScreenText: "See full rankings at neekostats.com.au",
      visual:       "Neeko logo + URL on solid background",
      duration:     perScene,
    });
  }
  return scenes.map((s, i) => ({ ...s, index: i + 1 }));
}

declare global {
  interface Window {
    selectedVoiceScript?: {
      title:     string;
      content:   string;
      hook?:     string;
      variation?: string;
    } | null;
  }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };
  return { copy, copied };
}

function CopyBtn({
  text, label, copyKey, copy, copied,
}: {
  text: string; label: string; copyKey: string;
  copy: (t: string, k: string) => void; copied: string | null;
}) {
  const done = copied === copyKey;
  return (
    <button
      onClick={() => copy(text, copyKey)}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

const posStyle = (pos: string | null | undefined) => {
  const map: Record<string, string> = {
    MID: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    DEF: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    FWD: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    RUC: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  };
  return map[pos ?? ""] ?? "bg-muted text-muted-foreground";
};

function SceneCard({ scene, angle, isLandscape }: {
  scene: Scene; angle: Angle; isLandscape: boolean;
}) {
  const style = ANGLE_SCENE_STYLES[angle];

  const cardClass = isLandscape
    ? "w-[260px] h-[150px]"
    : "w-[120px] h-[213px]";

  const content = () => {
    switch (scene.type) {
      case "hook":
        return (
          <div className="flex-1 flex items-center justify-center px-3">
            <p className={`text-center font-bold leading-tight ${isLandscape ? "text-sm" : "text-xs"} ${style.accent}`}>
              {scene.onScreenText}
            </p>
          </div>
        );

      case "player":
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 px-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-lg font-bold text-white/60">
              {scene.onScreenText.charAt(0)}
            </div>
            <p className={`text-center font-semibold text-white leading-tight ${isLandscape ? "text-xs" : "text-[10px]"}`}>
              {scene.onScreenText}
            </p>
            <p className="text-[9px] text-white/40 italic">Use Image Engine card here</p>
          </div>
        );

      case "stats":
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-2">
            {scene.onScreenText.split("  |  ").map((stat, i) => {
              const [label, val] = stat.split(": ");
              return (
                <div key={i} className="flex gap-1.5 items-baseline">
                  <span className="text-[9px] text-white/50 uppercase tracking-wide">{label}</span>
                  <span className={`font-bold ${isLandscape ? "text-base" : "text-sm"} ${style.accent}`}>{val}</span>
                </div>
              );
            })}
          </div>
        );

      case "analysis":
      case "deep":
        return (
          <div className="flex-1 flex items-center justify-center px-3">
            <p className={`text-center text-white/80 leading-tight ${isLandscape ? "text-xs" : "text-[9px]"}`}>
              {scene.onScreenText}
            </p>
          </div>
        );

      case "cta":
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2">
            <div className={`font-black uppercase tracking-wider ${isLandscape ? "text-sm" : "text-xs"} ${style.accent}`}>
              NEEKO
            </div>
            <p className={`text-center text-white/70 ${isLandscape ? "text-[10px]" : "text-[8px]"}`}>
              {scene.onScreenText}
            </p>
          </div>
        );
    }
  };

  return (
    <div className={`${cardClass} rounded-xl bg-gradient-to-b ${style.bg} flex flex-col shrink-0 overflow-hidden border border-white/10`}>
      <div className="px-2 pt-2 pb-1 flex items-center justify-between">
        <span className="text-[8px] font-bold uppercase tracking-widest text-white/40">
          Scene {scene.index}
        </span>
        <span className="text-[8px] text-white/30">{scene.duration}s</span>
      </div>
      {content()}
      <div className="px-2 pb-2 pt-1">
        <span className="text-[8px] text-white/30 font-medium">{scene.title}</span>
      </div>
    </div>
  );
}

export default function VideoGenerator() {
  const { players, loading } = useMarketingPlayers();
  const { copy, copied }     = useCopy();
  const utteranceRef         = useRef<SpeechSynthesisUtterance | null>(null);
  const { toast }            = useToast();
  const [savedScript,    setSavedScript]    = useState(false);
  const [savedStoryboard, setSavedStoryboard] = useState(false);

  const [search,         setSearch]         = useState("");
  const [showDropdown,   setShowDropdown]   = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<MarketingPlayer | null>(null);
  const [angle,          setAngle]          = useState<Angle>("buy");
  const [format,         setFormat]         = useState<Format>("tiktok");
  const [length,         setLength]         = useState<Length>(30);
  const [generated,      setGenerated]      = useState<GeneratedContent | null>(null);
  const [selectedHook,   setSelectedHook]   = useState(0);
  const [voicePlaying,   setVoicePlaying]   = useState(false);
  const [voiceImportTitle, setVoiceImportTitle] = useState<string | null>(null);
  const [captionMode, setCaptionMode]           = useState<"short" | "full">("short");
  const [captionsCopied, setCaptionsCopied]     = useState(false);

  const stopVoice = () => {
    speechSynthesis.cancel();
    setVoicePlaying(false);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.selectedVoiceScript) return;
    const vs = window.selectedVoiceScript;
    const hook    = vs.hook ?? vs.content.split("\n").filter(Boolean)[0] ?? "";
    const script  = vs.content;
    const scenes  = buildScenesFromVoice(script, 30);
    const captions = buildCaptions(script);
    setGenerated({
      hooks:    [hook],
      script,
      scenes,
      captions,
    });
    setSelectedHook(0);
    setVoiceImportTitle(vs.title || "Voice Script");
    stopVoice();
    window.selectedVoiceScript = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = players.filter((p) =>
    p.player_name.toLowerCase().includes(search.toLowerCase())
  );

  const generate = () => {
    if (!selectedPlayer) return;
    const hooks    = buildHooks(angle, selectedPlayer);
    const script   = buildScript(angle, selectedPlayer, hooks[0], length);
    const scenes   = buildScenes(angle, selectedPlayer, hooks[0], length);
    const captions = buildCaptions(script);
    setGenerated({ hooks, script, scenes, captions });
    setSelectedHook(0);
    setVoiceImportTitle(null);
    stopVoice();
  };

  const applyHook = (idx: number) => {
    if (!generated || !selectedPlayer) return;
    setSelectedHook(idx);
    const hook     = generated.hooks[idx];
    const script   = buildScript(angle, selectedPlayer, hook, length);
    const scenes   = buildScenes(angle, selectedPlayer, hook, length);
    const captions = buildCaptions(script);
    setGenerated({ ...generated, script, scenes, captions });
    stopVoice();
  };

  const toggleVoice = () => {
    if (voicePlaying) {
      stopVoice();
      return;
    }
    if (!generated) return;
    const utterance = new SpeechSynthesisUtterance(generated.script.replace(/\n\n/g, ". "));
    utterance.rate   = 0.95;
    utterance.pitch  = 1;
    utterance.onend  = () => setVoicePlaying(false);
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
    setVoicePlaying(true);
  };

  const isLandscape = format === "landscape";

  const fullStoryboard = generated
    ? [
        `=== NEEKO SPORTS — VIDEO STORYBOARD ===`,
        `Player: ${selectedPlayer?.player_name}`,
        `Angle: ${ANGLE_CONFIG[angle].label}`,
        `Format: ${FORMAT_CONFIG[format].label}`,
        `Length: ${length}s`,
        ``,
        `--- HOOK ---`,
        generated.hooks[selectedHook],
        ``,
        `--- SCRIPT ---`,
        generated.script,
        ``,
        `--- SCENES ---`,
        ...generated.scenes.map(
          (s) => `Scene ${s.index}: ${s.title} (${s.duration}s)\nText: ${s.onScreenText}\nVisual: ${s.visual}`
        ),
        ``,
        `--- CAPTIONS ---`,
        generated.captions,
      ].join("\n")
    : "";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-end">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Player</label>
            <div className="relative">
              <div
                className="flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer bg-background hover:border-foreground/30 transition-colors"
                onClick={() => setShowDropdown((v) => !v)}
              >
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {selectedPlayer ? (
                  <span className="text-sm font-medium truncate flex-1">{selectedPlayer.player_name}</span>
                ) : (
                  <span className="text-sm text-muted-foreground flex-1">Select player...</span>
                )}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>

              {showDropdown && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
                  <div className="sticky top-0 bg-popover border-b border-border px-3 py-2">
                    <input
                      autoFocus
                      placeholder="Search..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full text-sm bg-transparent outline-none"
                    />
                  </div>
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-4 text-center">No players found</p>
                  ) : (
                    filtered.slice(0, 60).map((p) => (
                      <div
                        key={p.player_id ?? p.player_name}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                        onClick={() => {
                          setSelectedPlayer(p);
                          setShowDropdown(false);
                          setSearch("");
                          setGenerated(null);
                          stopVoice();
                        }}
                      >
                        <span className="font-medium truncate flex-1">{p.player_name}</span>
                        <span className="text-xs text-muted-foreground">{p.team}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ${posStyle(p.position)}`}>
                          {p.position}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Angle</label>
            <div className="grid grid-cols-2 gap-1">
              {(Object.entries(ANGLE_CONFIG) as [Angle, (typeof ANGLE_CONFIG)[Angle]][]).map(([id, cfg]) => (
                <button
                  key={id}
                  onClick={() => { setAngle(id); setGenerated(null); stopVoice(); }}
                  className={`text-xs font-medium py-1.5 px-2 rounded border transition-colors ${
                    angle === id
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground bg-background"
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Format</label>
            <div className="flex flex-col gap-1">
              {(Object.entries(FORMAT_CONFIG) as [Format, (typeof FORMAT_CONFIG)[Format]][]).map(([id, cfg]) => (
                <button
                  key={id}
                  onClick={() => setFormat(id)}
                  className={`text-xs font-medium py-1.5 px-2 rounded border text-left transition-colors ${
                    format === id
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground bg-background"
                  }`}
                >
                  {cfg.label}
                  <span className="ml-1 opacity-50">({cfg.desc})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Length</label>
            <div className="flex gap-1">
              {([15, 30, 45] as Length[]).map((l) => (
                <button
                  key={l}
                  onClick={() => { setLength(l); setGenerated(null); stopVoice(); }}
                  className={`flex-1 text-xs font-medium py-1.5 rounded border transition-colors ${
                    length === l
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground bg-background"
                  }`}
                >
                  {l}s
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button onClick={generate} disabled={!selectedPlayer} className="h-9 px-6 gap-2 self-end">
          <Zap className="h-4 w-4" />
          Generate
        </Button>
      </div>

      {!generated && !selectedPlayer && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <Clapperboard className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Select a player to get started</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Choose a player, angle, format, and length, then hit Generate</p>
        </div>
      )}

      {!generated && selectedPlayer && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <Zap className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            Ready to generate for {selectedPlayer.player_name}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {ANGLE_CONFIG[angle].label} · {FORMAT_CONFIG[format].label} · {length}s
          </p>
          <Button onClick={generate} className="mt-4 gap-2" size="sm">
            <Zap className="h-3.5 w-3.5" />
            Generate
          </Button>
        </div>
      )}

      {generated && (
        <div className="space-y-4">
          {voiceImportTitle && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 border border-border">
              <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                Imported from Voice Studio — <span className="font-medium text-foreground">{voiceImportTitle}</span>
              </p>
              <button
                onClick={() => setVoiceImportTitle(null)}
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                dismiss
              </button>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {selectedPlayer && (
                <Badge variant="outline" className="text-xs">{selectedPlayer.player_name}</Badge>
              )}
              {selectedPlayer && (
                <Badge variant="outline" className="text-xs">{ANGLE_CONFIG[angle].label}</Badge>
              )}
              <Badge variant="outline" className="text-xs">{FORMAT_CONFIG[format].label}</Badge>
              <Badge variant="outline" className="text-xs">{length}s</Badge>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleVoice}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                  voicePlaying
                    ? "border-red-500/40 text-red-600 bg-red-500/5 hover:bg-red-500/10"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {voicePlaying ? (
                  <><Square className="h-3 w-3 fill-current" /> Stop Voice</>
                ) : (
                  <><Play className="h-3 w-3 fill-current" /> Play Voice</>
                )}
              </button>
              <CopyBtn text={fullStoryboard} label="Copy All" copyKey="all" copy={copy} copied={copied} />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Hook Options</h3>
              <CopyBtn
                text={generated.hooks[selectedHook]}
                label="Copy Hook"
                copyKey="hook"
                copy={copy}
                copied={copied}
              />
            </div>
            <div className="space-y-2">
              {generated.hooks.map((h, i) => (
                <button
                  key={i}
                  onClick={() => applyHook(i)}
                  className={`w-full text-left text-sm px-3 py-2.5 rounded-md border transition-colors ${
                    selectedHook === i
                      ? "border-foreground bg-foreground/5 font-medium"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  <span className="mr-2 text-muted-foreground text-xs">#{i + 1}</span>
                  {h}
                  {selectedHook === i && (
                    <span className="ml-2 text-[10px] text-muted-foreground font-normal">active</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Scene Preview</h3>
                <span className="text-xs text-muted-foreground">{generated.scenes.length} scenes · {length}s total</span>
              </div>
              <div className="flex items-center gap-3">
                {voicePlaying && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 animate-pulse">
                    <Volume2 className="h-3 w-3" /> Playing...
                  </span>
                )}
                {!voicePlaying && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <VolumeX className="h-3 w-3" /> Voice ready
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {generated.scenes.map((scene) => (
                <SceneCard
                  key={scene.index}
                  scene={scene}
                  angle={angle}
                  isLandscape={isLandscape}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold">Voiceover Script</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={toggleVoice}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    voicePlaying
                      ? "text-red-500 hover:text-red-600"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {voicePlaying
                    ? <><Square className="h-3 w-3 fill-current" /> Stop</>
                    : <><Play className="h-3 w-3 fill-current" /> Preview Voice</>
                  }
                </button>
                <button
                  onClick={() => {
                    if (!generated) return;
                    addToLibrary({
                      type:    "video",
                      title:   selectedPlayer
                        ? `${selectedPlayer.player_name} — ${ANGLE_CONFIG[angle].label} script`
                        : `${voiceImportTitle ?? "Voice"} — video script`,
                      content: generated.script,
                      player:  selectedPlayer?.player_name ?? null,
                      tags:    ["video", angle],
                    });
                    setSavedScript(true);
                    setTimeout(() => setSavedScript(false), 2000);
                    toast({ title: "Saved to Library" });
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors"
                >
                  {savedScript
                    ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved</>
                    : <><BookmarkPlus className="h-3.5 w-3.5" /> Save to Library</>}
                </button>
                <CopyBtn text={generated.script} label="Copy Script" copyKey="script" copy={copy} copied={copied} />
              </div>
            </div>
            <div className="space-y-2">
              {generated.script.split("\n\n").map((line, i) => (
                <p
                  key={i}
                  className={`text-sm leading-relaxed ${
                    i === 0 ? "font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold">Scene Storyboard</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    if (!generated) return;
                    const storyboardText = generated.scenes
                      .map((s) => `Scene ${s.index}: ${s.title} (${s.duration}s)\nText: ${s.onScreenText}\nVisual: ${s.visual}`)
                      .join("\n\n");
                    addToLibrary({
                      type:    "video",
                      title:   selectedPlayer
                        ? `${selectedPlayer.player_name} — ${ANGLE_CONFIG[angle].label} storyboard`
                        : `${voiceImportTitle ?? "Voice"} — storyboard`,
                      content: storyboardText,
                      player:  selectedPlayer?.player_name ?? null,
                      tags:    ["storyboard", angle],
                    });
                    setSavedStoryboard(true);
                    setTimeout(() => setSavedStoryboard(false), 2000);
                    toast({ title: "Storyboard saved to Library" });
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 transition-colors"
                >
                  {savedStoryboard
                    ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved</>
                    : <><BookmarkPlus className="h-3.5 w-3.5" /> Save Storyboard</>}
                </button>
                <CopyBtn
                  text={generated.scenes
                    .map((s) => `Scene ${s.index}: ${s.title} (${s.duration}s)\nText: ${s.onScreenText}\nVisual: ${s.visual}`)
                    .join("\n\n")}
                  label="Copy Storyboard"
                  copyKey="storyboard"
                  copy={copy}
                  copied={copied}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {generated.scenes.map((scene) => (
                <div key={scene.index} className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Scene {scene.index}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">{scene.duration}s</span>
                  </div>
                  <p className="text-xs font-semibold leading-tight">{scene.title}</p>
                  <div className="space-y-1">
                    <p className="text-xs leading-snug text-foreground/90 bg-background rounded px-2 py-1.5 border border-border">
                      "{scene.onScreenText}"
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-snug italic">{scene.visual}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(() => {
            const captions   = generateCaptions(generated.script, captionMode);
            const exportText = formatCaptionsForExport(captions, true);
            return (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Subtitles</h3>
                    <span className="text-xs text-muted-foreground">{captions.length} lines</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md border border-border overflow-hidden">
                      <button
                        onClick={() => setCaptionMode("short")}
                        className={`text-[10px] font-medium px-2.5 py-1 transition-colors ${
                          captionMode === "short"
                            ? "bg-foreground text-background"
                            : "bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Short
                      </button>
                      <button
                        onClick={() => setCaptionMode("full")}
                        className={`text-[10px] font-medium px-2.5 py-1 transition-colors border-l border-border ${
                          captionMode === "full"
                            ? "bg-foreground text-background"
                            : "bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Full
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(exportText).catch(() => {});
                        setCaptionsCopied(true);
                        setTimeout(() => setCaptionsCopied(false), 2000);
                      }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {captionsCopied
                        ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied</>
                        : <><Copy className="h-3.5 w-3.5" /> Copy Subtitle Format</>
                      }
                    </button>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {captions.map((c, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-3 py-2 rounded-md bg-zinc-900 text-white text-xs leading-relaxed"
                    >
                      <span className="text-white/30 shrink-0 tabular-nums">{i + 1}</span>
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">TikTok / Reels / Shorts ready · keywords emphasised</p>
              </div>
            );
          })()}

          <div className="rounded-lg border border-dashed border-border bg-muted/10 p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
              <Clapperboard className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">Image card for Scene 2</p>
              <p className="text-xs text-muted-foreground">Generate the player card in the Image Engine tab, then use it as Scene 2 visual.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
