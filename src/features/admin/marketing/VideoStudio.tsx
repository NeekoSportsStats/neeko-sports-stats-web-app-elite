import { useState, useRef, useCallback } from "react";
import useMarketingPlayers from "./useMarketingPlayers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, ChevronDown, Zap, Copy, Check, RefreshCw,
  Mic, MicOff, Clapperboard, FileText, List, Square,
} from "lucide-react";

type MarketingPlayer = {
  player_id: number | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  price: number | null;
  neeko_rating: number | null;
  summary_short: string | null;
  summary_long: string | null;
  ai_recommendation: string | null;
};

type Angle = "buy" | "sell" | "breakout" | "captain" | "trap";
type Format = "tiktok" | "story" | "landscape";
type Length = "15s" | "30s" | "60s";

const ANGLES: { id: Angle; label: string; emoji: string }[] = [
  { id: "buy",      label: "Buy",      emoji: "📈" },
  { id: "sell",     label: "Sell",     emoji: "📉" },
  { id: "breakout", label: "Breakout", emoji: "💥" },
  { id: "captain",  label: "Captain",  emoji: "⭐" },
  { id: "trap",     label: "Trap",     emoji: "🪤" },
];

const FORMATS: { id: Format; label: string }[] = [
  { id: "tiktok",    label: "TikTok / Reels" },
  { id: "story",     label: "Story (9:16)" },
  { id: "landscape", label: "Landscape" },
];

const LENGTHS: { id: Length; label: string }[] = [
  { id: "15s", label: "15 sec" },
  { id: "30s", label: "30 sec" },
  { id: "60s", label: "60 sec" },
];

const fmt = (n: number | null, suffix = "") =>
  n != null ? `${Math.round(Number(n))}${suffix}` : "—";

const fmtPrice = (n: number | null) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";

function buildVideoScript(player: MarketingPlayer, angle: Angle, length: Length): string {
  const name = player.player_name;
  const team = player.team;
  const proj = fmt(player.projection_final, " pts");
  const ceil = fmt(player.ceiling, " pts");
  const price = fmtPrice(player.price);
  const ai = player.summary_short ?? "";

  const extra = length === "60s" ? `\n\nFull breakdown: ${player.summary_long ?? ai}` : "";

  const templates: Record<Angle, string> = {
    buy: `[HOOK — 0–3s]
"You NEED ${name} in your team. Here's why."

[SETUP — 3–8s]
"${name} from ${team}. Projected ${proj} this week."

[DATA — 8–15s]
"Ceiling of ${ceil}. Priced at ${price}. The value is insane."

[AI INTEL — 15–20s]
"Neeko says: ${ai}"

[CTA — final]
"Get him in before prices rise. #AFLFantasy #NeekoSports"${extra}`,

    sell: `[HOOK — 0–3s]
"Everyone's holding ${name}. Here's why you shouldn't."

[SETUP — 3–8s]
"${name} — ${team}. Projection: ${proj}."

[DATA — 8–15s]
"The floor is ${fmt(player.floor, " pts")}. Price is ${price}. The risk is real."

[AI INTEL — 15–20s]
"Neeko says: ${ai}"

[CTA — final]
"Move smart. Don't hold the bag. #AFLFantasy #NeekoSports"${extra}`,

    breakout: `[HOOK — 0–3s]
"${name} is about to EXPLODE."

[SETUP — 3–8s]
"The data is screaming breakout. ${team} midfielder. Proj ${proj}."

[DATA — 8–15s]
"Ceiling ${ceil}. Neeko model confidence: HIGH."

[AI INTEL — 15–20s]
"${ai}"

[CTA — final]
"Don't miss the wave. #AFLFantasy #BreakoutAlert #NeekoSports"${extra}`,

    captain: `[HOOK — 0–3s]
"One captain pick this week. Don't overthink it."

[SETUP — 3–8s]
"${name} — ${team}. Neeko's #1 captain call."

[DATA — 8–15s]
"Projected ${proj}. Ceiling ${ceil}. The data is clear."

[AI INTEL — 15–20s]
"${ai}"

[CTA — final]
"Lock him in. Let the data do the work. #AFLFantasy #CaptainPick"${extra}`,

    trap: `[HOOK — 0–3s]
"WAIT before you trade in ${name}."

[SETUP — 3–8s]
"Everyone wants him. But here's what the data says."

[DATA — 8–15s]
"Projection ${proj}. Floor ${fmt(player.floor, " pts")}. Risk is elevated."

[AI INTEL — 15–20s]
"Neeko: ${ai}"

[CTA — final]
"Patience wins. Don't get burned. #TrapAlert #AFLFantasy"${extra}`,
  };

  return templates[angle];
}

function buildScenes(script: string): string[] {
  return script
    .split("\n\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCaptions(script: string): string[] {
  return script
    .split("\n")
    .map((line) => line.replace(/^\[.*?\]\s*/g, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith('"['));
}

export default function VideoStudio() {
  const { players, loading } = useMarketingPlayers();
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<MarketingPlayer | null>(null);
  const [angle, setAngle] = useState<Angle>("buy");
  const [format, setFormat] = useState<Format>("tiktok");
  const [length, setLength] = useState<Length>("30s");
  const [script, setScript] = useState("");
  const [captions, setCaptions] = useState<string[]>([]);
  const [scenes, setScenes] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"script" | "scenes" | "captions" | "voice">("script");
  const [copied, setCopied] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);

  const filtered = players.filter((p) =>
    p.player_name?.toLowerCase().includes(search.toLowerCase())
  );

  const posColor = (pos: string | null) => {
    switch (pos) {
      case "MID": return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
      case "DEF": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
      case "FWD": return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
      case "RUC": return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
      default:    return "bg-muted text-muted-foreground";
    }
  };

  const generate = useCallback(() => {
    if (!selectedPlayer) return;
    const s = buildVideoScript(selectedPlayer as MarketingPlayer, angle, length);
    setScript(s);
    setScenes(buildScenes(s));
    setCaptions(buildCaptions(s));
    setActiveTab("script");
  }, [selectedPlayer, angle, length]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `voiceover-${Date.now()}.webm`;
        a.click();
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRef.current = recorder;
      setIsRecording(true);
    } catch {
      alert("Microphone access denied.");
    }
  }, [isRecording]);

  const INNER_TABS = [
    { id: "script" as const,   label: "Script",   icon: FileText },
    { id: "scenes" as const,   label: "Scenes",   icon: Clapperboard },
    { id: "captions" as const, label: "Captions", icon: List },
    { id: "voice" as const,    label: "Voice",    icon: Mic },
  ];

  return (
    <div className="space-y-6">
      {/* Player + controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative md:col-span-2">
          <div
            className="flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer bg-background hover:border-foreground/30 transition-colors"
            onClick={() => setShowDropdown((v) => !v)}
          >
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            {selectedPlayer ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-medium text-sm truncate">{selectedPlayer.player_name}</span>
                <span className="text-xs text-muted-foreground">{selectedPlayer.team}</span>
                <Badge className={`text-[10px] px-1.5 py-0 ${posColor((selectedPlayer as { position?: string | null }).position ?? null)}`}>
                  {(selectedPlayer as { position?: string | null }).position ?? "—"}
                </Badge>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground flex-1">Search player...</span>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          {showDropdown && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
              <div className="sticky top-0 bg-popover border-b border-border px-3 py-2">
                <input
                  autoFocus
                  placeholder="Search player..."
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
                <p className="text-xs text-muted-foreground px-3 py-4 text-center">No players found — check data source</p>
              ) : (
                filtered.slice(0, 50).map((p) => (
                  <div
                    key={p.player_id ?? p.player_name}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                    onClick={() => {
                      setSelectedPlayer(p as unknown as MarketingPlayer);
                      setShowDropdown(false);
                      setSearch("");
                      setScript("");
                    }}
                  >
                    <span className="font-medium truncate flex-1">{p.player_name}</span>
                    <span className="text-xs text-muted-foreground">{p.team}</span>
                    {p.projection_final != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(p.projection_final)}pt</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-1 flex-wrap">
            {ANGLES.map((a) => (
              <button
                key={a.id}
                onClick={() => setAngle(a.id)}
                className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
                  angle === a.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {a.emoji} {a.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                  format === f.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {LENGTHS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLength(l.id)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                  length === l.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={generate} disabled={!selectedPlayer} className="w-full">
        <Zap className="h-4 w-4 mr-2" />
        Generate Video Package
      </Button>

      {script && (
        <>
          {/* Inner tab bar */}
          <div className="flex gap-1 border-b border-border pb-0">
            {INNER_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Script tab */}
          {activeTab === "script" && (
            <div className="space-y-3">
              <div className="relative">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed p-4 bg-muted/40 border border-border rounded-lg font-mono">
                  {script}
                </pre>
                <button
                  onClick={() => copy(script, "script")}
                  className="absolute top-3 right-3 p-1.5 rounded bg-background border border-border hover:bg-accent transition-colors"
                >
                  {copied === "script" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                <strong>Screen recording:</strong> Use OBS or Loom to record your screen. Load this script in a teleprompter app or the text above.
              </div>
            </div>
          )}

          {/* Scenes tab */}
          {activeTab === "scenes" && (
            <div className="space-y-3">
              {scenes.map((scene, i) => (
                <div key={i} className="p-4 bg-muted/40 border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Scene {i + 1}
                    </span>
                    <button
                      onClick={() => copy(scene, `scene-${i}`)}
                      className="p-1 rounded hover:bg-accent transition-colors"
                    >
                      {copied === `scene-${i}` ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono">{scene}</pre>
                </div>
              ))}
            </div>
          )}

          {/* Captions tab */}
          {activeTab === "captions" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">Auto-generated from script. Copy all for scheduling.</p>
                <button
                  onClick={() => copy(captions.join("\n"), "captions-all")}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied === "captions-all" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy all
                </button>
              </div>
              {captions.map((caption, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 bg-muted/30 border border-border rounded-md"
                >
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5 w-4">{i + 1}.</span>
                  <p className="text-sm flex-1 leading-relaxed">{caption}</p>
                  <button
                    onClick={() => copy(caption, `cap-${i}`)}
                    className="shrink-0 p-1 rounded hover:bg-accent transition-colors"
                  >
                    {copied === `cap-${i}` ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Voice tab */}
          {activeTab === "voice" && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/40 border border-border rounded-lg space-y-3">
                <p className="text-sm font-medium">Record Voiceover</p>
                <p className="text-xs text-muted-foreground">
                  Read the script aloud and record your voice. The file will download automatically when you stop.
                </p>
                <button
                  onClick={toggleRecording}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isRecording
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-foreground text-background hover:opacity-90"
                  }`}
                >
                  {isRecording ? (
                    <>
                      <Square className="h-4 w-4" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Start Recording
                    </>
                  )}
                </button>
                {isRecording && (
                  <div className="flex items-center gap-2 text-xs text-red-500">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    Recording in progress...
                  </div>
                )}
              </div>

              <div className="p-4 bg-muted/40 border border-border rounded-lg space-y-2">
                <p className="text-sm font-medium">AI Voice</p>
                <p className="text-xs text-muted-foreground">
                  AI voice generation — connect ElevenLabs or PlayHT API key in settings to enable.
                </p>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded text-xs text-muted-foreground">
                  <MicOff className="h-3.5 w-3.5" />
                  AI voice not configured — using browser TTS as fallback
                </div>
                <button
                  onClick={() => {
                    if (!script) return;
                    const utt = new SpeechSynthesisUtterance(
                      captions.join(" ")
                    );
                    utt.rate = 1.05;
                    window.speechSynthesis.speak(utt);
                  }}
                  className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent transition-colors"
                >
                  Preview with browser TTS
                </button>
              </div>

              <div className="p-4 bg-muted/40 border border-border rounded-lg">
                <p className="text-sm font-medium mb-3">Post Checklist</p>
                {[
                  "Script generated and reviewed",
                  "Screen recording done (OBS / Loom)",
                  "Voiceover recorded",
                  "Captions copied",
                  "Video edited and exported",
                  "Posted to TikTok / Reels / YouTube Shorts",
                  "Caption + hashtags added",
                ].map((item, i) => (
                  <label key={i} className="flex items-center gap-2 py-1.5 cursor-pointer">
                    <input type="checkbox" className="rounded" />
                    <span className="text-sm">{item}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
