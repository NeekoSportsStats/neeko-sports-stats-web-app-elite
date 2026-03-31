import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  Search,
  Zap,
  BookmarkPlus,
} from "lucide-react";
import { addToLibrary } from "./lib/library";

interface RankingPlayer {
  player_id: number | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  form_score: number | null;
  risk_rating: number | null;
  value_score: number | null;
  price: number | null;
  neeko_rating: number | null;
  summary_short: string | null;
  summary_long: string | null;
  ai_recommendation: string | null;
  recommendation_color: string | null;
}

type Angle = "buy" | "sell" | "breakout" | "trap" | "captain" | "value";

const ANGLES: { id: Angle; label: string; emoji: string; color: string }[] = [
  { id: "buy",      label: "Buy",      emoji: "📈", color: "text-emerald-600 dark:text-emerald-400" },
  { id: "sell",     label: "Sell",     emoji: "📉", color: "text-red-600 dark:text-red-400" },
  { id: "breakout", label: "Breakout", emoji: "💥", color: "text-orange-600 dark:text-orange-400" },
  { id: "trap",     label: "Trap",     emoji: "🪤", color: "text-yellow-600 dark:text-yellow-400" },
  { id: "captain",  label: "Captain",  emoji: "⭐", color: "text-blue-600 dark:text-blue-400" },
  { id: "value",    label: "Value",    emoji: "💎", color: "text-cyan-600 dark:text-cyan-400" },
];

const fmt = (n: number | null, suffix = "") =>
  n != null ? `${Math.round(Number(n))}${suffix}` : "—";

const fmtDec = (n: number | null, dp = 1, suffix = "") =>
  n != null ? `${Number(n).toFixed(dp)}${suffix}` : "—";

const fmtPrice = (n: number | null) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";

function buildScript(player: RankingPlayer, angle: Angle): string {
  const name = player.player_name;
  const team = player.team;
  const proj = fmt(player.projection_final, " pts");
  const ceil = fmt(player.ceiling, " pts");
  const floor = fmt(player.floor, " pts");
  const form = fmtDec(player.form_score, 0);
  const risk = fmtDec(player.risk_rating, 0);
  const value = fmtDec(player.value_score, 1);
  const price = fmtPrice(player.price);
  const upside = "—";
  const ai = player.summary_short ?? player.summary_long ?? "";
  const aiLong = player.summary_long ?? "";

  const scripts: Record<Angle, string> = {
    buy: `📈 BUY: ${name} (${team})

Why you should be trading him in RIGHT NOW:

→ Projection: ${proj}
→ Ceiling: ${ceil}
→ Form: ${form} / 100
→ Value Score: ${value} at ${price}

${ai ? `Neeko Intel: "${ai}"` : ""}

${aiLong ? `\nDeep Dive:\n${aiLong}` : ""}

Don't wait — the window is closing. #AFLFantasy #NeekoSports`,

    sell: `📉 SELL: ${name} (${team})

Here's why you should consider trading him out:

→ Risk Rating: ${risk}
→ Projection: ${proj}
→ Floor: ${floor}

${ai ? `Neeko Intel: "${ai}"` : ""}

${aiLong ? `\nFull Analysis:\n${aiLong}` : ""}

Don't hold the bag. Move smart. #AFLFantasy #NeekoSports`,

    breakout: `💥 BREAKOUT ALERT: ${name} (${team})

The signs are all there. This could be the week it happens.

→ Projection: ${proj}
→ Ceiling: ${ceil}
→ Upside Rating: ${upside}
→ Form: ${form} / 100

${ai ? `Neeko says: "${ai}"` : ""}

${aiLong ? `\nWhy Neeko is confident:\n${aiLong}` : ""}

Get on before it's too late. #AFLFantasy #BreakoutAlert #NeekoSports`,

    trap: `🪤 TRAP ALERT: ${name} (${team})

Everyone's rushing in. Here's why you should wait.

→ Risk Rating: ${risk} (elevated)
→ Projection: ${proj} — don't chase the number
→ Ceiling: ${ceil} but floor is ${floor}

${ai ? `Neeko Intel: "${ai}"` : ""}

${aiLong ? `\nFull picture:\n${aiLong}` : ""}

Patience wins. Don't get burned. #AFLFantasy #TrapAlert #NeekoSports`,

    captain: `⭐ CAPTAIN PICK: ${name} (${team})

Neeko's data has him locked in as a top C this week.

→ Projection: ${proj}
→ Ceiling: ${ceil}
→ Form: ${form} / 100
→ Upside: ${upside}

${ai ? `Neeko: "${ai}"` : ""}

${aiLong ? `\nWhy the C is justified:\n${aiLong}` : ""}

Lock him in and back your data. #AFLFantasy #CaptainPick #NeekoSports`,

    value: `💎 VALUE PICK: ${name} (${team})

Premium output at a price that makes no sense. Fix it before prices rise.

→ Price: ${price}
→ Value Score: ${value}
→ Projection: ${proj}
→ Ceiling: ${ceil}

${ai ? `Neeko: "${ai}"` : ""}

${aiLong ? `\nThe full value case:\n${aiLong}` : ""}

This is the edge. Use it. #AFLFantasy #ValuePick #NeekoSports`,
  };

  return scripts[angle];
}

function buildHooks(player: RankingPlayer, angle: Angle): string[] {
  const name = player.player_name;
  const proj = fmt(player.projection_final, " pts");
  const ceil = fmt(player.ceiling, " pts");
  const price = fmtPrice(player.price);
  const form = fmtDec(player.form_score, 0);

  const hookSets: Record<Angle, string[]> = {
    buy: [
      `${name} is being overlooked. Projected ${proj} this week — here's why you need him NOW.`,
      `The data says ${name} is the best trade of the round. Projected ${proj}. Don't overthink it.`,
      `While everyone debates, smart coaches are quietly getting ${name} in. ${proj} projection. Here's what they know.`,
    ],
    sell: [
      `Everyone's holding ${name}. The data says sell. Here's why they're wrong.`,
      `${name} looks safe. But the numbers tell a different story. Time to act.`,
      `The hype around ${name} is real. The ceiling of ${ceil} is not. Sell before it's too late.`,
    ],
    breakout: [
      `${name} is about to EXPLODE. Ceiling of ${ceil} — and Neeko's model is screaming breakout.`,
      `Form rating of ${form}. Ceiling of ${ceil}. ${name} is locked and loaded for a massive week.`,
      `Breakout incoming. ${name} has been building to this. Don't miss the moment.`,
    ],
    trap: [
      `Everyone wants ${name}. Here's why Neeko is fading him this week.`,
      `${name} at ${price} looks like value. Our model disagrees. Here's the full story.`,
      `The popular move is ${name}. The smart move is to wait. Here's the data.`,
    ],
    captain: [
      `One captain call. One player. ${name}. Projected ${proj}. Let the data decide.`,
      `If you're not captaining ${name} this week, what are you doing? Proj ${proj}, ceiling ${ceil}.`,
      `${name} is Neeko's #1 captain pick. The model doesn't lie.`,
    ],
    value: [
      `${name} at ${price} is the biggest value in the game right now. Here's the breakdown.`,
      `Under the radar. Underpriced. ${name} is the value pick you're sleeping on.`,
      `${price} for ${proj} projected. ${name} is the most efficient player in AFL Fantasy this week.`,
    ],
  };

  return hookSets[angle];
}

export default function ContentEngine() {
  const [players, setPlayers] = useState<RankingPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<RankingPlayer | null>(null);
  const [angle, setAngle] = useState<Angle>("buy");
  const [script, setScript] = useState("");
  const [hooks, setHooks] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [savedScript, setSavedScript] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from("v_rankings_free")
        .select(
          "player_id, player_name, team, position, projection_final, ceiling, floor, form_score, risk_rating, value_score, price, neeko_rating, summary_short, summary_long, ai_recommendation, recommendation_color"
        )
        .order("neeko_rating", { ascending: false })
        .limit(300);
      if (data) setPlayers(data as RankingPlayer[]);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = players.filter((p) =>
    p.player_name.toLowerCase().includes(search.toLowerCase())
  );

  const generate = useCallback(() => {
    if (!selectedPlayer) {
      toast({ title: "Select a player first", variant: "destructive" });
      return;
    }
    setScript(buildScript(selectedPlayer, angle));
    setHooks(buildHooks(selectedPlayer, angle));
  }, [selectedPlayer, angle, toast]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const posColor = (pos: string | null) => {
    switch (pos) {
      case "MID": return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
      case "DEF": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
      case "FWD": return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
      case "RUC": return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-5">
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
                <Badge className={`text-[10px] px-1.5 py-0 ${posColor(selectedPlayer.position)}`}>
                  {selectedPlayer.position}
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
                  placeholder="Search by name..."
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
                filtered.slice(0, 50).map((p) => (
                  <div
                    key={p.player_id ?? p.player_name}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                    onClick={() => {
                      setSelectedPlayer(p);
                      setShowDropdown(false);
                      setSearch("");
                      setScript("");
                      setHooks([]);
                    }}
                  >
                    <span className="font-medium truncate flex-1">{p.player_name}</span>
                    <span className="text-xs text-muted-foreground">{p.team}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 ${posColor(p.position)}`}>
                      {p.position}
                    </Badge>
                    {p.projection_final != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(p.projection_final)}pt</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <div className="flex flex-wrap gap-1.5 flex-1">
            {ANGLES.map((a) => (
              <button
                key={a.id}
                onClick={() => setAngle(a.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  angle === a.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                {a.emoji} {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={generate} disabled={!selectedPlayer} className="w-full">
        <Zap className="h-4 w-4 mr-2" />
        Generate Script + Hooks
      </Button>

      {selectedPlayer && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/40 rounded-lg border border-border text-xs">
          <div>
            <span className="text-muted-foreground">Projection</span>
            <p className="font-semibold">{fmt(selectedPlayer.projection_final, " pts")}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Ceiling</span>
            <p className="font-semibold">{fmt(selectedPlayer.ceiling, " pts")}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Price</span>
            <p className="font-semibold">{fmtPrice(selectedPlayer.price)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Neeko Rating</span>
            <p className="font-semibold">{fmtDec(selectedPlayer.neeko_rating, 1)}</p>
          </div>
        </div>
      )}

      {hooks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Hook Variations
          </p>
          {hooks.map((hook, i) => (
            <div
              key={i}
              className="flex items-start gap-2 p-3 bg-muted/30 border border-border rounded-md"
            >
              <p className="text-sm flex-1 leading-relaxed">{hook}</p>
              <button
                onClick={() => copyText(hook, `hook-${i}`)}
                className="shrink-0 p-1 rounded hover:bg-accent transition-colors"
              >
                {copied === `hook-${i}` ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {script && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Full Script
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!selectedPlayer || !script) return;
                  addToLibrary({
                    type:    "script",
                    title:   `${selectedPlayer.player_name} — ${angle}`,
                    content: script,
                    player:  selectedPlayer.player_name,
                    tags:    [angle],
                  });
                  setSavedScript(true);
                  setTimeout(() => setSavedScript(false), 2000);
                  toast({ title: "Saved to Library" });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
              >
                {savedScript ? (
                  <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved!</>
                ) : (
                  <><BookmarkPlus className="h-3.5 w-3.5" /> Save to Library</>
                )}
              </button>
              <button
                onClick={() => copyText(script, "script")}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-md transition-colors"
              >
                {copied === "script" ? (
                  <><Check className="h-3.5 w-3.5" /> Copied!</>
                ) : (
                  <><Copy className="h-3.5 w-3.5" /> Copy Script</>
                )}
              </button>
            </div>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            className="w-full h-64 text-sm border border-border rounded-md p-3 bg-background resize-y font-mono leading-relaxed"
          />
        </div>
      )}

      {selectedPlayer?.summary_long && (
        <div className="p-3 bg-muted/30 border border-border rounded-md space-y-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Neeko AI Summary</p>
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">{selectedPlayer.summary_long}</p>
        </div>
      )}
    </div>
  );
}
