import { useEffect, useMemo, useState } from "react";
import { Zap, Copy, Check, BookmarkPlus, Loader as Loader2, ChevronDown, MonitorPlay, Tag, User, FileText, Video, Image as ImageIcon, Layers, Package } from "lucide-react";
import useMarketingPlayers from "./useMarketingPlayers";
import { cleanAiText } from "@/utils/cleanAiText";
import { addToLibrary, type LibraryPlatform, type LibraryItemType } from "./lib/library";
import type { MarketingPlayer } from "./types";

declare global {
  interface Window {
    selectedMarketingRecommendation?: {
      platform: LibraryPlatform | null;
      type: LibraryItemType;
      player: string | null;
      angle: string | null;
      reason: string;
      confidence: "High" | "Medium" | "Low";
      sampleSize: number;
      label: string;
      variant: "safe" | "aggressive" | "experimental";
    };
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────

type Angle    = "buy" | "sell" | "breakout" | "trap";
type Platform = "tiktok" | "instagram" | "x" | "reddit";
type OutputType = "post" | "script" | "image" | "pack";

interface RedditOutput  { title: string; body: string; reply: string }
interface TikTokOutput  { hook: string; voiceover: string; scenes: string[]; cta: string }
interface XOutput       { post: string; alt: string; cta: string }
interface ImageOutput   { headline: string; subheadline: string; statLine: string; caption: string }
interface GeneratedPack {
  hook:       string;
  shortPost:  string;
  reddit:     RedditOutput;
  tiktok:     TikTokOutput;
  twitter:    XOutput;
  imageCopy:  ImageOutput;
  cta:        string;
}

// ─── Options ───────────────────────────────────────────────────────────────

const ANGLES: { id: Angle; label: string }[] = [
  { id: "buy",      label: "Buy"      },
  { id: "sell",     label: "Sell"     },
  { id: "breakout", label: "Breakout" },
  { id: "trap",     label: "Trap"     },
];

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "tiktok",    label: "TikTok"    },
  { id: "instagram", label: "Instagram" },
  { id: "x",         label: "X"         },
  { id: "reddit",    label: "Reddit"    },
];

const OUTPUT_TYPES: { id: OutputType; label: string; icon: React.ElementType }[] = [
  { id: "post",   label: "Post",       icon: FileText  },
  { id: "script", label: "Script",     icon: Video     },
  { id: "image",  label: "Image Copy", icon: ImageIcon },
  { id: "pack",   label: "Full Pack",  icon: Package   },
];

// ─── Content generation helpers ────────────────────────────────────────────

function fmt(n: number | null | undefined, fallback = "—"): string {
  if (n == null) return fallback;
  return n.toFixed(0);
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "";
  return `$${(n / 1000).toFixed(0)}k`;
}

function anglePhrasing(angle: Angle, name: string): {
  action: string; verb: string; risk: string; framing: string;
} {
  const map: Record<Angle, { action: string; verb: string; risk: string; framing: string }> = {
    buy:      { action: "trade in",      verb: "backing",     risk: "low-risk",   framing: "a smart pickup right now"    },
    sell:     { action: "trade out",     verb: "fading",      risk: "high-risk",  framing: "worth cutting from your squad" },
    breakout: { action: "grab now",      verb: "flagging",    risk: "high-upside", framing: "a breakout candidate"        },
    trap:     { action: "avoid",         verb: "warning on",  risk: "trap pick",  framing: "a trap everyone is falling for" },
  };
  return map[angle];
}

function cta(platform: Platform): string {
  const map: Record<Platform, string> = {
    tiktok:    "Follow for more fantasy picks every week.",
    instagram: "Save this post before you lock your squad.",
    x:         "RT if you agree. Drop your take below.",
    reddit:    "What's your take? Let me know in the comments.",
  };
  return map[platform];
}

function generateHook(p: MarketingPlayer, angle: Angle, platform: Platform): string {
  const name = p.player_name;
  const proj = fmt(p.projection_final);
  const ph   = anglePhrasing(angle, name);

  const hooks: Record<Angle, Record<Platform, string>> = {
    buy: {
      tiktok:    `${name} is being completely slept on right now. ${proj} points projected — do NOT miss this.`,
      instagram: `${name} is ${ph.framing}. Here's why smart managers are moving fast.`,
      x:         `Hot take: ${name} is the best value pickup this week. ${proj} pts projected.`,
      reddit:    `Why I'm trading in ${name} this week`,
    },
    sell: {
      tiktok:    `Everyone owns ${name}. Most of them are about to regret it.`,
      instagram: `${name} looks great on paper. The numbers tell a different story.`,
      x:         `Unpopular opinion: ${name} is ${ph.framing} this week.`,
      reddit:    `Genuine concern about ${name} — here's why I'm trading out`,
    },
    breakout: {
      tiktok:    `${name} is quietly becoming unmissable. Projected ${proj}. Pay attention.`,
      instagram: `The breakout pick no one is talking about: ${name}.`,
      x:         `${name} breakout incoming. ${proj} pts projected. Don't say I didn't warn you.`,
      reddit:    `${name} as a breakout pick this week — make the case`,
    },
    trap: {
      tiktok:    `Stop picking ${name}. Here's the data that should change your mind.`,
      instagram: `${name} is the most dangerous name in your squad right now. Here's why.`,
      x:         `${name} is ${ph.framing} this week. The numbers don't lie.`,
      reddit:    `Why I think ${name} is a trap pick — and who to take instead`,
    },
  };
  return hooks[angle][platform];
}

function generateBody(p: MarketingPlayer, angle: Angle, platform: Platform): string {
  const name  = p.player_name;
  const team  = p.team_name ?? p.team;
  const pos   = p.position ?? "player";
  const proj  = fmt(p.projection_final);
  const why   = cleanAiText(p.recommendation_why);
  const summ  = cleanAiText(p.summary_long ?? p.summary_short);
  const price = fmtPrice(p.price);
  const val   = p.value_score != null ? `Value score: ${p.value_score.toFixed(1)}` : "";
  const ph    = anglePhrasing(angle, name);

  const firstSentence = why
    ? why.split(/[.!?]/)[0].trim() + "."
    : `${name} is a ${pos} for ${team}.`;

  const dataLine = [
    proj ? `Projected: ${proj}pts` : "",
    price ? `Price: ${price}` : "",
    val,
  ].filter(Boolean).join(" · ");

  if (platform === "reddit") {
    const body1 = summ
      ? summ.split(/\n/)[0].trim()
      : firstSentence;
    const body2 = why && why !== body1
      ? why.slice(0, 300)
      : "";
    return [
      `I've been ${ph.verb} ${name} (${team}) this week and wanted to share the reasoning.`,
      "",
      body1,
      body2 ? body2 : "",
      "",
      dataLine ? `The data supports it — ${dataLine}.` : "",
      "",
      `Overall, I see ${name} as ${ph.framing} given current conditions.`,
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
  }

  if (platform === "tiktok" || platform === "instagram") {
    return [
      firstSentence,
      dataLine,
      why ? `${why.slice(0, 200)}` : "",
      `That makes ${name} ${ph.framing}.`,
    ].filter(Boolean).join("\n\n");
  }

  return [
    firstSentence,
    dataLine ? `(${dataLine})` : "",
    why ? why.slice(0, 180) : "",
  ].filter(Boolean).join(" ");
}

function generateScenes(p: MarketingPlayer, angle: Angle): string[] {
  const name = p.player_name;
  const team = p.team_name ?? p.team;
  const proj = fmt(p.projection_final);
  const ph   = anglePhrasing(angle, name);
  const why  = cleanAiText(p.recommendation_why);
  const firstPoint = why ? why.split(/[.!?]/)[0].trim() + "." : `${name} is in strong form.`;

  return [
    `[Scene 1 — Hook] Text over highlight clip: "${generateHook(p, angle, "tiktok")}"`,
    `[Scene 2 — Data] Stat card on screen: "${name} · ${team} · Proj. ${proj}pts"`,
    `[Scene 3 — Analysis] Voiceover over player footage: "${firstPoint}"`,
    `[Scene 4 — Decision] Bold text: "My call: ${ph.action.toUpperCase()}"`,
    `[Scene 5 — CTA] End card: "${cta("tiktok")}"`,
  ];
}

function generateImageCopy(p: MarketingPlayer, angle: Angle): ImageOutput {
  const name  = p.player_name;
  const team  = p.team_name ?? p.team;
  const proj  = fmt(p.projection_final);
  const price = fmtPrice(p.price);
  const ph    = anglePhrasing(angle, name);
  const why   = cleanAiText(p.recommendation_why);
  const first = why ? why.split(/[.!?]/)[0].trim() + "." : "";

  const headlines: Record<Angle, string> = {
    buy:      `TRADE IN: ${name.toUpperCase()}`,
    sell:     `TRADE OUT: ${name.toUpperCase()}`,
    breakout: `BREAKOUT ALERT: ${name.toUpperCase()}`,
    trap:     `TRAP PICK: ${name.toUpperCase()}`,
  };

  return {
    headline:    headlines[angle],
    subheadline: `${team} · ${p.position ?? "AFL"}`,
    statLine:    [proj ? `Proj. ${proj}pts` : "", price ? `Price: ${price}` : ""].filter(Boolean).join("  ·  "),
    caption:     first || `${name} is ${ph.framing} this week. ${cta("instagram")}`,
  };
}

function generateReddit(p: MarketingPlayer, angle: Angle): RedditOutput {
  const name = p.player_name;
  const team = p.team_name ?? p.team;
  const ph   = anglePhrasing(angle, name);
  const why  = cleanAiText(p.recommendation_why);
  const alt  = cleanAiText(p.summary_short);

  const altNames: Record<Angle, string> = {
    buy:      "someone cheaper",
    sell:     "a safer option",
    breakout: "a consistent hold",
    trap:     "better value elsewhere",
  };

  return {
    title: generateHook(p, angle, "reddit"),
    body:  generateBody(p, angle, "reddit"),
    reply: [
      `If you're sitting on the fence with ${name}, here's how I'd think about it:`,
      why ? why.slice(0, 200) : alt.slice(0, 200),
      `If you can't ${ph.action}, at minimum consider ${altNames[angle]} from ${team}'s opponents.`,
      cta("reddit"),
    ].filter(Boolean).join("\n\n"),
  };
}

function generateTikTok(p: MarketingPlayer, angle: Angle): TikTokOutput {
  const why   = cleanAiText(p.recommendation_why);
  const summ  = cleanAiText(p.summary_short);
  const proj  = fmt(p.projection_final);
  const name  = p.player_name;
  const ph    = anglePhrasing(angle, name);
  const first = (why || summ).split(/[.!?]/)[0].trim();
  const second = (why || summ).split(/[.!?]/)[1]?.trim() ?? "";

  return {
    hook:       generateHook(p, angle, "tiktok"),
    voiceover:  [
      `${first}.`,
      second ? `${second}.` : "",
      `The projection model has ${name} at ${proj} points.`,
      `That tells me ${name} is ${ph.framing} right now.`,
      cta("tiktok"),
    ].filter(Boolean).join(" "),
    scenes:     generateScenes(p, angle),
    cta:        cta("tiktok"),
  };
}

function generateX(p: MarketingPlayer, angle: Angle): XOutput {
  const name  = p.player_name;
  const proj  = fmt(p.projection_final);
  const price = fmtPrice(p.price);
  const why   = cleanAiText(p.recommendation_why);
  const short = why ? why.split(/[.!?]/)[0].trim() : "";
  const ph    = anglePhrasing(angle, name);

  return {
    post:  `${generateHook(p, angle, "x")}${short ? `\n\n${short}.` : ""}\n\n${[proj ? `Proj: ${proj}pts` : "", price ? `Price: ${price}` : ""].filter(Boolean).join(" | ")}\n\n${cta("x")}`,
    alt:   `${angle === "buy" || angle === "breakout" ? "🔥" : "⚠️"} ${name} is ${ph.framing}. ${proj ? `${proj}pts projected.` : ""} ${short.slice(0, 80)}${short.length > 80 ? "..." : ""}`,
    cta:   cta("x"),
  };
}

function generateFullPack(p: MarketingPlayer, angle: Angle): GeneratedPack {
  return {
    hook:      generateHook(p, angle, "tiktok"),
    shortPost: generateBody(p, angle, "x"),
    reddit:    generateReddit(p, angle),
    tiktok:    generateTikTok(p, angle),
    twitter:   generateX(p, angle),
    imageCopy: generateImageCopy(p, angle),
    cta:       cta("tiktok"),
  };
}

function packToClipboard(pack: GeneratedPack, name: string, angle: Angle): string {
  return [
    `=== CONTENT PACK: ${name.toUpperCase()} — ${angle.toUpperCase()} ===`,
    "",
    "HOOK:",
    pack.hook,
    "",
    "SHORT POST (X):",
    pack.twitter.post,
    "",
    "REDDIT TITLE:",
    pack.reddit.title,
    "",
    "REDDIT BODY:",
    pack.reddit.body,
    "",
    "TIKTOK VOICEOVER:",
    pack.tiktok.voiceover,
    "",
    "SCENES:",
    ...pack.tiktok.scenes,
    "",
    "IMAGE HEADLINE:",
    pack.imageCopy.headline,
    "IMAGE SUBHEADLINE:",
    pack.imageCopy.subheadline,
    "IMAGE STAT LINE:",
    pack.imageCopy.statLine,
    "IMAGE CAPTION:",
    pack.imageCopy.caption,
    "",
    "CTA:",
    pack.cta,
  ].join("\n");
}

// ─── Sub-components ────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded border border-border bg-background hover:bg-accent transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      {copied ? "Copied" : (label ?? "Copy")}
    </button>
  );
}

function OutputCard({
  title, children, copyText, className = "",
}: {
  title: string; children: React.ReactNode; copyText?: string; className?: string;
}) {
  return (
    <div className={`border rounded-lg overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <p className="text-xs font-semibold">{title}</p>
        {copyText && <CopyButton text={copyText} />}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function BodyText({ text }: { text: string }) {
  return (
    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
  );
}

function SceneList({ scenes }: { scenes: string[] }) {
  return (
    <ol className="space-y-1.5">
      {scenes.map((s, i) => (
        <li key={i} className="text-xs text-foreground leading-relaxed">{s}</li>
      ))}
    </ol>
  );
}

// ─── Select helpers ────────────────────────────────────────────────────────

function Select<T extends string>({
  value, onChange, options, placeholder, icon: Icon,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  placeholder: string;
  icon: React.ElementType;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full appearance-none text-xs pl-7 pr-7 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function OneClickGenerator() {
  const { players, loading } = useMarketingPlayers();

  const [selectedId, setSelectedId]     = useState<string>("");
  const [angle, setAngle]               = useState<Angle | "">("");
  const [platform, setPlatform]         = useState<Platform | "">("");
  const [outputType, setOutputType]     = useState<OutputType>("post");
  const [generating, setGenerating]     = useState(false);
  const [generated, setGenerated]       = useState(false);
  const [savedId, setSavedId]           = useState<string | null>(null);

  const player = useMemo(
    () => players.find((p) => p.player_name === selectedId) ?? null,
    [players, selectedId]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const rec = window.selectedMarketingRecommendation;
    if (!rec) return;
    if (rec.player)   setSelectedId(rec.player);
    if (rec.angle && ["buy","sell","breakout","trap"].includes(rec.angle)) setAngle(rec.angle as Angle);
    if (rec.platform && ["tiktok","instagram","x","reddit"].includes(rec.platform)) setPlatform(rec.platform as Platform);
    const typeMap: Record<string, OutputType> = {
      video: "script", image: "image", script: "post", draft: "post",
    };
    if (rec.type && typeMap[rec.type]) setOutputType(typeMap[rec.type]);
  }, []);

  const effectivePlatform: Platform = (platform as Platform) || "tiktok";

  const pack = useMemo<GeneratedPack | null>(() => {
    if (!generated || !player || !angle) return null;
    return generateFullPack(player, angle as Angle);
  }, [generated, player, angle]);

  function handleGenerate() {
    if (!player || !angle) return;
    setGenerating(true);
    setGenerated(false);
    setSavedId(null);
    setTimeout(() => {
      setGenerating(false);
      setGenerated(true);
    }, 400);
  }

  function handleSave() {
    if (!pack || !player || !angle) return;
    const typeMap: Record<OutputType, LibraryItemType> = {
      post: "script", script: "video", image: "image", pack: "draft",
    };
    const contentMap: Record<OutputType, string> = {
      post:   generateBody(player, angle as Angle, effectivePlatform),
      script: pack.tiktok.voiceover,
      image:  [pack.imageCopy.headline, pack.imageCopy.subheadline, pack.imageCopy.statLine, pack.imageCopy.caption].join("\n"),
      pack:   packToClipboard(pack, player.player_name, angle as Angle),
    };
    const item = addToLibrary({
      type:    typeMap[outputType],
      title:   `${player.player_name} - ${angle} - ${effectivePlatform}`,
      content: contentMap[outputType],
      player:  player.player_name,
      tags:    [angle as string, effectivePlatform],
      status:  "idea",
      platform: effectivePlatform as LibraryPlatform,
    });
    setSavedId(item.id);
  }

  const canGenerate = !!player && !!angle;

  const playerOptions = useMemo(
    () => players.map((p) => ({ id: p.player_name, label: `${p.player_name} (${p.team})` })),
    [players]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold">One-Click Content Generator</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Select a player and angle to instantly generate platform-specific content.
        </p>
      </div>

      {/* Controls */}
      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Setup</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1 lg:col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Player</label>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2 border rounded-md text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading players...
              </div>
            ) : (
              <Select
                value={selectedId as Angle}
                onChange={(v) => { setSelectedId(v); setGenerated(false); setSavedId(null); }}
                options={playerOptions as { id: Angle; label: string }[]}
                placeholder="Select player..."
                icon={User}
              />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Angle</label>
            <Select
              value={angle}
              onChange={(v) => { setAngle(v); setGenerated(false); setSavedId(null); }}
              options={ANGLES}
              placeholder="Select angle..."
              icon={Tag}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Platform</label>
            <Select
              value={platform}
              onChange={(v) => { setPlatform(v); setGenerated(false); setSavedId(null); }}
              options={PLATFORMS}
              placeholder="Select platform..."
              icon={MonitorPlay}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Output Type</label>
          <div className="flex flex-wrap gap-2">
            {OUTPUT_TYPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setOutputType(id); setGenerated(false); setSavedId(null); }}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                  outputType === id
                    ? "bg-foreground text-background border-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!canGenerate || generating}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md bg-foreground text-background disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          {generating
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
            : <><Zap className="h-4 w-4" /> Generate</>
          }
        </button>

        {!canGenerate && (
          <p className="text-xs text-muted-foreground">Select a player and angle to generate content.</p>
        )}
      </div>

      {/* Output */}
      {pack && player && angle && (
        <div className="space-y-4">
          {/* Header actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{player.player_name} — {angle.charAt(0).toUpperCase() + angle.slice(1)}</p>
              <p className="text-xs text-muted-foreground">{player.team_name ?? player.team} · {player.position}</p>
            </div>
            <div className="flex gap-2">
              {outputType === "pack" && (
                <CopyButton
                  text={packToClipboard(pack, player.player_name, angle as Angle)}
                  label="Copy Full Pack"
                />
              )}
              <button
                onClick={handleSave}
                disabled={!!savedId}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded border border-border bg-background hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {savedId
                  ? <><Check className="h-3 w-3 text-emerald-500" /> Saved to Library</>
                  : <><BookmarkPlus className="h-3 w-3" /> Save to Library</>
                }
              </button>
            </div>
          </div>

          {/* Single-format outputs */}
          {outputType === "post" && (
            <div className="space-y-3">
              <OutputCard
                title="Hook"
                copyText={generateHook(player, angle as Angle, effectivePlatform)}
              >
                <BodyText text={generateHook(player, angle as Angle, effectivePlatform)} />
              </OutputCard>
              <OutputCard
                title={`${PLATFORMS.find((p) => p.id === effectivePlatform)?.label ?? "Post"} Post`}
                copyText={generateBody(player, angle as Angle, effectivePlatform)}
              >
                <BodyText text={generateBody(player, angle as Angle, effectivePlatform)} />
              </OutputCard>
              <OutputCard title="CTA" copyText={cta(effectivePlatform)}>
                <BodyText text={cta(effectivePlatform)} />
              </OutputCard>
            </div>
          )}

          {outputType === "script" && (
            <div className="space-y-3">
              <OutputCard title="Hook" copyText={pack.tiktok.hook}>
                <BodyText text={pack.tiktok.hook} />
              </OutputCard>
              <OutputCard title="Voiceover Script" copyText={pack.tiktok.voiceover}>
                <BodyText text={pack.tiktok.voiceover} />
              </OutputCard>
              <OutputCard title="Scene Outline" copyText={pack.tiktok.scenes.join("\n")}>
                <SceneList scenes={pack.tiktok.scenes} />
              </OutputCard>
              <OutputCard title="CTA" copyText={pack.tiktok.cta}>
                <BodyText text={pack.tiktok.cta} />
              </OutputCard>
            </div>
          )}

          {outputType === "image" && (
            <div className="space-y-3">
              <OutputCard
                title="Image Copy"
                copyText={[pack.imageCopy.headline, pack.imageCopy.subheadline, pack.imageCopy.statLine, pack.imageCopy.caption].join("\n")}
              >
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Headline</p>
                    <p className="text-sm font-bold">{pack.imageCopy.headline}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Subheadline</p>
                    <p className="text-xs font-medium">{pack.imageCopy.subheadline}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Stat Line</p>
                    <p className="text-xs font-mono text-foreground">{pack.imageCopy.statLine}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Caption</p>
                    <p className="text-xs leading-relaxed">{pack.imageCopy.caption}</p>
                  </div>
                </div>
              </OutputCard>
            </div>
          )}

          {outputType === "pack" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <OutputCard title="Hook" copyText={pack.hook}>
                  <BodyText text={pack.hook} />
                </OutputCard>
                <OutputCard title="Short Post (X)" copyText={pack.twitter.post}>
                  <BodyText text={pack.twitter.post} />
                </OutputCard>
              </div>

              <OutputCard
                title="Reddit Post"
                copyText={[`TITLE: ${pack.reddit.title}`, "", pack.reddit.body].join("\n")}
              >
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Title</p>
                    <p className="text-xs font-semibold">{pack.reddit.title}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Body</p>
                    <BodyText text={pack.reddit.body} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Follow-up Comment</p>
                    <BodyText text={pack.reddit.reply} />
                  </div>
                </div>
              </OutputCard>

              <OutputCard
                title="TikTok / Reel Script"
                copyText={[pack.tiktok.hook, "", pack.tiktok.voiceover].join("\n")}
              >
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Hook</p>
                    <p className="text-xs font-semibold">{pack.tiktok.hook}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Voiceover</p>
                    <BodyText text={pack.tiktok.voiceover} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Scenes</p>
                    <SceneList scenes={pack.tiktok.scenes} />
                  </div>
                </div>
              </OutputCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <OutputCard
                  title="X / Twitter"
                  copyText={pack.twitter.post}
                >
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Main Post</p>
                      <BodyText text={pack.twitter.post} />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Alt Version</p>
                      <BodyText text={pack.twitter.alt} />
                    </div>
                  </div>
                </OutputCard>

                <OutputCard
                  title="Image Copy"
                  copyText={[pack.imageCopy.headline, pack.imageCopy.subheadline, pack.imageCopy.statLine, pack.imageCopy.caption].join("\n")}
                >
                  <div className="space-y-1.5">
                    <p className="text-sm font-bold">{pack.imageCopy.headline}</p>
                    <p className="text-xs text-muted-foreground">{pack.imageCopy.subheadline}</p>
                    <p className="text-xs font-mono">{pack.imageCopy.statLine}</p>
                    <p className="text-xs leading-relaxed mt-1">{pack.imageCopy.caption}</p>
                  </div>
                </OutputCard>
              </div>

              <OutputCard title="CTA" copyText={pack.cta}>
                <BodyText text={pack.cta} />
              </OutputCard>
            </div>
          )}
        </div>
      )}

      {/* Idle empty state */}
      {!generated && !generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
          <Layers className="h-8 w-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            {canGenerate ? "Ready to generate — hit the button above." : "Select a player and angle to generate content."}
          </p>
        </div>
      )}
    </div>
  );
}
