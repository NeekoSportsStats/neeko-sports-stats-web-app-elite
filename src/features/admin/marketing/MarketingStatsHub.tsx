import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Megaphone, Copy, Check, ChevronLeft, ChevronRight, Sparkles, TrendingUp, Image as ImageIcon } from "lucide-react";
import { STAT_ANGLES } from "./angles";
import type { MarketingPlayer, StatAngle } from "./types";
import SocialGraphicGenerator from "./SocialGraphicGenerator";

const HASHTAGS = "#AFLFantasy #AFLFantasy2026 #FantasyFooty #AFL #NeekoSports";

function positionBadgeColor(pos: string | null) {
  switch (pos) {
    case "MID": return "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20";
    case "DEF": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20";
    case "FWD": return "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/20";
    case "RUC": return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

interface AnglePanelProps {
  angle: StatAngle;
  players: MarketingPlayer[];
  loading: boolean;
  caption: string;
  shortCaption: string;
  captionLoading: boolean;
  onRefresh: () => void;
  onGenerateCaption: () => void;
}

function AnglePanel({
  angle,
  players,
  loading,
  caption,
  shortCaption,
  captionLoading,
  onRefresh,
  onGenerateCaption,
}: AnglePanelProps) {
  const [copied, setCopied] = useState(false);
  const [selectedIds, setSelectedIds] = useState<(number | string)[]>([]);
  const { toast } = useToast();

  const togglePlayer = (id: number | string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearSelection = () => setSelectedIds([]);

  const displayPlayers =
    selectedIds.length === 0
      ? players
      : players.filter((p) => selectedIds.includes(p.player_id ?? p.player_name));

  const handleCopy = () => {
    navigator.clipboard.writeText(caption).then(() => {
      setCopied(true);
      toast({ title: "Caption copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">{angle.description}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.length > 0 && (
            <button
              onClick={clearSelection}
              className="h-8 px-3 rounded text-xs font-medium border border-border bg-background hover:bg-muted text-muted-foreground transition-colors"
            >
              Clear Selection ({selectedIds.length})
            </button>
          )}
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="h-8 text-xs shrink-0">
            <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Player Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : players.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No players match this filter. Try refreshing.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-6">#</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Player</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Team</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Pos</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">{angle.keyStatLabel}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => {
                const id = p.player_id ?? p.player_name;
                const isSelected = selectedIds.includes(id);
                return (
                  <tr
                    key={id}
                    onClick={() => togglePlayer(id)}
                    style={isSelected ? { background: "rgba(255,180,0,0.12)", borderLeft: "3px solid #ffb400" } : {}}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer select-none"
                  >
                    <td className="px-3 py-2 text-xs tabular-nums">
                      {isSelected ? (
                        <span style={{ color: "#ffb400", fontSize: 14 }}>&#10003;</span>
                      ) : (
                        <span className="text-muted-foreground">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium">{p.player_name}</td>
                    <td className="px-3 py-2 text-sm text-muted-foreground hidden sm:table-cell">{p.team}</td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      {p.position && (
                        <span className={`inline-block text-xs px-1.5 py-0.5 rounded border font-medium ${positionBadgeColor(p.position)}`}>
                          {p.position}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                      {angle.keyStatFn(p)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedIds.length === 0 && !loading && players.length > 0 && (
        <p className="text-xs text-muted-foreground -mt-1">
          Click any row to select players — preview and caption will only include selected players.
        </p>
      )}

      {/* Caption Generator */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">AI Ad Caption</span>
            {selectedIds.length > 0 && (
              <span className="text-xs text-muted-foreground">({displayPlayers.length} selected)</span>
            )}
          </div>
          <Button
            size="sm"
            onClick={onGenerateCaption}
            disabled={captionLoading || displayPlayers.length === 0}
            className="h-8 text-xs shrink-0"
          >
            {captionLoading ? (
              <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Megaphone className="h-3 w-3 mr-1.5" />
            )}
            Generate Caption
          </Button>
        </div>

        {caption ? (
          <div className="space-y-3">
            {/* Social Preview */}
            <div className="rounded-lg bg-background border border-border p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold leading-none">Neeko Sports Stats</p>
                  <p className="text-xs text-muted-foreground mt-0.5">@neekosports</p>
                </div>
              </div>
              <p className="text-sm whitespace-pre-line leading-relaxed">{caption}</p>
            </div>

            {/* Short caption teaser */}
            {shortCaption && (
              <div className="rounded border border-dashed border-border p-2.5">
                <p className="text-xs text-muted-foreground mb-1 font-medium">Short teaser / story caption:</p>
                <p className="text-sm italic">{shortCaption}</p>
              </div>
            )}

            {/* Copy actions */}
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 text-xs">
                {copied ? (
                  <Check className="h-3 w-3 mr-1.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3 mr-1.5" />
                )}
                {copied ? "Copied!" : "Copy Caption"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(HASHTAGS);
                  toast({ title: "Hashtags copied" });
                }}
              >
                <Copy className="h-3 w-3 mr-1.5" />
                Copy Hashtags Only
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Click "Generate Caption" to create an AI-written social post using the top 5 players above.
          </p>
        )}
      </div>
    </div>
  );
}

export default function MarketingStatsHub() {
  const { toast } = useToast();
  const [activeIndex, setActiveIndex] = useState(0);
  const tabBarRef = useRef<HTMLDivElement>(null);

  const [playerCache, setPlayerCache] = useState<Record<string, MarketingPlayer[]>>({});
  const [loadingCache, setLoadingCache] = useState<Record<string, boolean>>({});
  const [captionCache, setCaptionCache] = useState<Record<string, { caption: string; shortCaption: string }>>({});
  const [captionLoadingCache, setCaptionLoadingCache] = useState<Record<string, boolean>>({});

  const activeAngle = STAT_ANGLES[activeIndex];

  const fetchPlayers = useCallback(async (angle: StatAngle) => {
    setLoadingCache((prev) => ({ ...prev, [angle.id]: true }));
    try {
      let query = supabase
        .from("v_rankings_content_engine")
        .select(
          "player_id, player_name, team, position, projection_final, ceiling_estimate, floor_estimate, consistency_score, form_rating, matchup_rating, upside_rating, risk_rating, projection_confidence, captain_score, neeko_rating, price, value_score, value_tag, value_tier, consistency_tier, price_tier, ai_recommendation",
        )
        .order(angle.orderBy as string, {
          ascending: angle.orderDir === "asc",
          nullsFirst: false,
        })
        .limit(50);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as MarketingPlayer[];
      if (angle.filterFn) rows = rows.filter(angle.filterFn);
      rows = rows.slice(0, 10);

      setPlayerCache((prev) => ({ ...prev, [angle.id]: rows }));
    } catch (err) {
      toast({
        title: "Failed to load players",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingCache((prev) => ({ ...prev, [angle.id]: false }));
    }
  }, [toast]);

  const ensureLoaded = useCallback((angle: StatAngle) => {
    if (!playerCache[angle.id] && !loadingCache[angle.id]) {
      fetchPlayers(angle);
    }
  }, [playerCache, loadingCache, fetchPlayers]);

  const handleTabSelect = (index: number) => {
    setActiveIndex(index);
    ensureLoaded(STAT_ANGLES[index]);
  };

  const handleRefresh = () => {
    fetchPlayers(activeAngle);
    setCaptionCache((prev) => {
      const next = { ...prev };
      delete next[activeAngle.id];
      return next;
    });
  };

  const handleGenerateCaption = async () => {
    const players = playerCache[activeAngle.id] ?? [];
    if (players.length === 0) return;

    setCaptionLoadingCache((prev) => ({ ...prev, [activeAngle.id]: true }));
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
        body: JSON.stringify({
          angle_name: activeAngle.label,
          players: players.slice(0, 5),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const result = await res.json() as { caption: string; short_caption: string };
      setCaptionCache((prev) => ({
        ...prev,
        [activeAngle.id]: { caption: result.caption, shortCaption: result.short_caption },
      }));
    } catch (err) {
      toast({
        title: "Caption generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCaptionLoadingCache((prev) => ({ ...prev, [activeAngle.id]: false }));
    }
  };

  const scrollTabs = (dir: "left" | "right") => {
    if (tabBarRef.current) {
      tabBarRef.current.scrollBy({ left: dir === "left" ? -180 : 180, behavior: "smooth" });
    }
  };

  if (!playerCache[activeAngle.id] && !loadingCache[activeAngle.id]) {
    fetchPlayers(activeAngle);
  }

  const activeCaptions = captionCache[activeAngle.id];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          Marketing Data Hub
          <Badge variant="secondary" className="text-xs ml-1">
            {STAT_ANGLES.length} angles
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate player stat tables and AI captions for social media posts and ads.
        </p>
      </CardHeader>

      <CardContent>
        {/* Tab Navigation */}
        <div className="relative mb-5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => scrollTabs("left")}
              className="shrink-0 h-7 w-7 rounded border border-border bg-background hover:bg-muted flex items-center justify-center transition-colors"
              aria-label="Scroll tabs left"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div
              ref={tabBarRef}
              className="flex gap-1 overflow-x-auto scrollbar-hide flex-1 scroll-smooth"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {STAT_ANGLES.map((angle, i) => {
                const isActive = i === activeIndex;
                const isLoaded = !!playerCache[angle.id];
                return (
                  <button
                    key={angle.id}
                    onClick={() => handleTabSelect(i)}
                    className={`shrink-0 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors border ${
                      isActive
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {i + 1}. {angle.label}
                    {isLoaded && !isActive && (
                      <span className="ml-1 w-1 h-1 rounded-full bg-emerald-500 inline-block align-middle" />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => scrollTabs("right")}
              className="shrink-0 h-7 w-7 rounded border border-border bg-background hover:bg-muted flex items-center justify-center transition-colors"
              aria-label="Scroll tabs right"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Tab counter */}
          <p className="text-xs text-muted-foreground mt-2 text-right">
            {activeIndex + 1} / {STAT_ANGLES.length} — <span className="font-medium text-foreground">{activeAngle.label}</span>
          </p>
        </div>

        {/* Active Panel */}
        <AnglePanel
          angle={activeAngle}
          players={playerCache[activeAngle.id] ?? []}
          loading={loadingCache[activeAngle.id] ?? false}
          caption={activeCaptions?.caption ?? ""}
          shortCaption={activeCaptions?.shortCaption ?? ""}
          captionLoading={captionLoadingCache[activeAngle.id] ?? false}
          onRefresh={handleRefresh}
          onGenerateCaption={handleGenerateCaption}
        />

        {/* Divider */}
        <div className="border-t border-border mt-8 pt-6">
          <div className="flex items-center gap-2 mb-5">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Social Graphic Generator</h3>
            <Badge variant="secondary" className="text-xs">1080×1080</Badge>
          </div>
          <SocialGraphicGenerator />
        </div>
      </CardContent>
    </Card>
  );
}
