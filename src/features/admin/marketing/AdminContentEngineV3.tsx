import { useState, useEffect, useCallback, useRef } from "react";
import {
  Zap, RefreshCw, Star, Gem, TriangleAlert as AlertTriangle,
  Flame, TrendingDown, ChevronDown, Search, Copy, Check,
  BookmarkPlus, Video, Image, FileText, Clapperboard, Target,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";

// ── TYPES ────────────────────────────────────────────────────────────────────

type ContentCategory = "value" | "breakout" | "trap" | "captain" | "elite" | "sell";

interface Opportunity {
  player_id: number;
  player_name: string;
  team: string;
  position: string | null;
  category: ContentCategory;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  price: number | null;
  value_score: number | null;
  form_score: number | null;
  captain_score: number | null;
  risk_rating: number | null;
  upside_pct: number | null;
  neeko_rating_scaled: number | null;
  ai_recommendation: string | null;
  summary_short: string | null;
  signal_reason: string;
  cat_rank: number;
}

interface RankingsPlayer {
  player_id: number;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  price: number | null;
  value_score: number | null;
  form_score: number | null;
  neeko_rating_scaled: number | null;
  ai_recommendation: string | null;
  summary_short: string | null;
}

interface ContentPack {
  video_script: string;
  image_text: string;
  caption: string;
  hooks: string[];
  visual_plan: string;
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<ContentCategory, {
  label: string; color: string; bg: string; border: string; icon: React.ElementType;
}> = {
  captain:  { label: "CAPTAIN",  color: "text-blue-700 dark:text-blue-300",      bg: "bg-blue-500/10",     border: "border-blue-500/30",    icon: Star },
  breakout: { label: "BREAKOUT", color: "text-orange-700 dark:text-orange-300",  bg: "bg-orange-500/10",   border: "border-orange-500/30",  icon: Flame },
  value:    { label: "VALUE",    color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10",  border: "border-emerald-500/30", icon: Gem },
  trap:     { label: "TRAP",     color: "text-yellow-700 dark:text-yellow-300",   bg: "bg-yellow-500/10",   border: "border-yellow-500/30",  icon: AlertTriangle },
  elite:    { label: "ELITE",    color: "text-sky-700 dark:text-sky-300",         bg: "bg-sky-500/10",      border: "border-sky-500/30",     icon: Zap },
  sell:     { label: "SELL",     color: "text-slate-700 dark:text-slate-300",     bg: "bg-slate-500/10",    border: "border-slate-500/30",   icon: TrendingDown },
};

const ALL_CATEGORIES: ContentCategory[] = ["captain", "breakout", "value", "trap", "elite"];

type PackTab = "video_script" | "image_text" | "caption" | "hooks" | "visual_plan";

const PACK_TABS: { id: PackTab; label: string; icon: React.ElementType }[] = [
  { id: "video_script",  label: "Video Script",  icon: Video },
  { id: "image_text",    label: "Image Text",     icon: Image },
  { id: "caption",       label: "Caption",        icon: FileText },
  { id: "hooks",         label: "Hooks",          icon: Zap },
  { id: "visual_plan",   label: "Visual Plan",    icon: Clapperboard },
];

// ── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null, suffix = "") =>
  n != null ? `${Math.round(Number(n))}${suffix}` : "—";

const fmtDec = (n: number | null, dp = 1, suffix = "") =>
  n != null ? `${Number(n).toFixed(dp)}${suffix}` : "—";

const fmtPrice = (n: number | null) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";

const posColor = (pos: string | null) => {
  switch (pos) {
    case "MID": return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
    case "DEF": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "FWD": return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
    case "RUC": return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
    default:    return "bg-muted text-muted-foreground";
  }
};

// ── OPPORTUNITY CARD ─────────────────────────────────────────────────────────

function OpportunityCard({
  opp,
  selected,
  onSelect,
}: {
  opp: Opportunity;
  selected: boolean;
  onSelect: (opp: Opportunity) => void;
}) {
  const meta = CATEGORY_META[opp.category] ?? CATEGORY_META.elite;
  const Icon = meta.icon;

  return (
    <button
      onClick={() => onSelect(opp)}
      className={`w-full text-left rounded-lg border p-3.5 transition-all ${
        selected
          ? `${meta.bg} ${meta.border} ring-2 ring-offset-1 ring-offset-background ring-current`
          : `border-border hover:border-foreground/30 hover:bg-muted/20`
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.bg} ${meta.color}`}>
              <Icon className="h-2.5 w-2.5" />
              {meta.label}
            </span>
            {opp.position && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${posColor(opp.position)}`}>
                {opp.position}
              </span>
            )}
          </div>
          <p className="font-semibold text-sm leading-tight truncate">{opp.player_name}</p>
          <p className="text-xs text-muted-foreground truncate">{opp.team}</p>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">#{opp.cat_rank}</span>
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs mb-2">
        {opp.projection_final != null && (
          <div>
            <span className="text-muted-foreground block leading-tight">Proj</span>
            <span className="font-semibold">{fmt(opp.projection_final, "pt")}</span>
          </div>
        )}
        {opp.ceiling != null && (
          <div>
            <span className="text-muted-foreground block leading-tight">Ceil</span>
            <span className="font-semibold">{fmt(opp.ceiling, "pt")}</span>
          </div>
        )}
        {opp.price != null && (
          <div>
            <span className="text-muted-foreground block leading-tight">Price</span>
            <span className="font-semibold">{fmtPrice(opp.price)}</span>
          </div>
        )}
        {opp.value_score != null && opp.category !== "captain" && (
          <div>
            <span className="text-muted-foreground block leading-tight">Value</span>
            <span className="font-semibold">{fmtDec(opp.value_score, 1)}</span>
          </div>
        )}
        {opp.captain_score != null && opp.category === "captain" && (
          <div>
            <span className="text-muted-foreground block leading-tight">Cap Score</span>
            <span className="font-semibold">{fmt(opp.captain_score)}</span>
          </div>
        )}
        {opp.form_score != null && (
          <div>
            <span className="text-muted-foreground block leading-tight">Form</span>
            <span className="font-semibold">{fmt(opp.form_score)}</span>
          </div>
        )}
      </div>

      {opp.signal_reason && (
        <p className="text-[10px] text-muted-foreground font-mono truncate border-t border-border/40 pt-1.5">
          {opp.signal_reason}
        </p>
      )}
    </button>
  );
}

// ── CONTENT PACK DISPLAY ─────────────────────────────────────────────────────

function ContentPackDisplay({
  pack,
  playerName,
  category,
  onSave,
  saving,
  saved,
}: {
  pack: ContentPack;
  playerName: string;
  category: string;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const [activeTab, setActiveTab] = useState<PackTab>("video_script");
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const getContent = (tab: PackTab): string => {
    if (tab === "hooks") return pack.hooks.join("\n\n");
    return pack[tab] ?? "";
  };

  const copyAll = () => {
    const all = [
      `=== VIDEO SCRIPT ===\n${pack.video_script}`,
      `=== IMAGE TEXT ===\n${pack.image_text}`,
      `=== CAPTION ===\n${pack.caption}`,
      `=== HOOKS ===\n${pack.hooks.join("\n\n")}`,
      `=== VISUAL PLAN ===\n${pack.visual_plan}`,
    ].join("\n\n---\n\n");
    navigator.clipboard.writeText(all);
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div>
          <p className="text-xs text-muted-foreground">Content Pack</p>
          <p className="font-semibold text-sm">{playerName} · {category.toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            disabled={saving || saved}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors disabled:opacity-60"
          >
            {saved ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved</> :
             saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving</> :
             <><BookmarkPlus className="h-3.5 w-3.5" /> Save</>}
          </button>
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-foreground text-background text-xs rounded-md hover:opacity-90 transition-opacity"
          >
            {copied === "all" ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy All</>}
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-4 pt-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {PACK_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              activeTab === id
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {PACK_TABS.find((t) => t.id === activeTab)?.label}
          </p>
          <button
            onClick={() => copyText(getContent(activeTab), activeTab)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border text-xs rounded-md hover:bg-accent transition-colors"
          >
            {copied === activeTab ? (
              <><Check className="h-3.5 w-3.5 text-emerald-500" /> Copied!</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copy</>
            )}
          </button>
        </div>

        {activeTab === "hooks" ? (
          <div className="space-y-2">
            {pack.hooks.map((hook, i) => (
              <div key={i} className="flex items-start gap-2 p-3 bg-muted/30 border border-border rounded-md">
                <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">{i + 1}.</span>
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
        ) : (
          <textarea
            value={getContent(activeTab)}
            readOnly
            className="w-full min-h-48 text-sm border border-border rounded-md p-3 bg-background resize-y font-mono leading-relaxed"
          />
        )}
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {getContent(activeTab).length} characters
        </p>
      </div>
    </div>
  );
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function AdminContentEngineV3() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loadingOpps, setLoadingOpps] = useState(true);
  const [oppsError, setOppsError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<ContentCategory>("captain");

  const [players, setPlayers] = useState<RankingsPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [playerSearch, setPlayerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedPlayer, setSelectedPlayer] = useState<RankingsPlayer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ContentCategory>("captain");

  const [generating, setGenerating] = useState(false);
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [packPlayer, setPackPlayer] = useState<string>("");
  const [packCategory, setPackCategory] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { toast } = useToast();

  const loadOpportunities = useCallback(async () => {
    setLoadingOpps(true);
    setOppsError(null);
    try {
      const { data, error } = await supabase
        .schema("afl" as any)
        .from("v_content_opportunities")
        .select("*")
        .order("category")
        .order("cat_rank");
      if (error) throw error;
      setOpportunities((data ?? []) as Opportunity[]);
    } catch (e) {
      setOppsError(e instanceof Error ? e.message : "Failed to load opportunities");
    } finally {
      setLoadingOpps(false);
    }
  }, []);

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const { data } = await supabase
        .schema("afl" as any)
        .from("player_rankings_cache")
        .select("player_id,player_name,team,position,projection_final,ceiling,price,value_score,form_score,neeko_rating_scaled,ai_recommendation,summary_short")
        .eq("is_available", true)
        .order("neeko_rating_scaled", { ascending: false })
        .limit(300);
      if (data) setPlayers(data as RankingsPlayer[]);
    } finally {
      setLoadingPlayers(false);
    }
  }, []);

  useEffect(() => {
    loadOpportunities();
    loadPlayers();
  }, [loadOpportunities, loadPlayers]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredPlayers = players.filter((p) => {
    const matchSearch = p.player_name.toLowerCase().includes(playerSearch.toLowerCase());
    const matchPos = posFilter === "ALL" || p.position === posFilter;
    return matchSearch && matchPos;
  });

  const visibleOpps = opportunities.filter((o) => o.category === activeCategory);

  const generatePack = useCallback(async (playerId: number, playerName: string, category: ContentCategory) => {
    setGenerating(true);
    setPack(null);
    setPackPlayer(playerName);
    setPackCategory(category);
    setSaved(false);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? anonKey;

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-content-pack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ player_id: playerId, category }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? json.detail ?? "Generation failed");
      }

      setPack(json.pack as ContentPack);
      toast({ title: `Content pack ready — ${playerName}` });
    } catch (e) {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [toast]);

  const handleOppSelect = (opp: Opportunity) => {
    setSelectedCategory(opp.category);
    generatePack(opp.player_id, opp.player_name, opp.category);
  };

  const handleManualGenerate = () => {
    if (!selectedPlayer) {
      toast({ title: "Select a player first", variant: "destructive" });
      return;
    }
    generatePack(selectedPlayer.player_id, selectedPlayer.player_name, selectedCategory);
  };

  const handleSave = async () => {
    if (!pack || !packPlayer) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .schema("marketing" as any)
        .from("content_library")
        .insert({
          player_name:  packPlayer,
          category:     packCategory,
          content_json: pack,
          hooks_json:   pack.hooks,
        });
      if (error) throw error;
      setSaved(true);
      toast({ title: "Saved to Content Library" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const catCounts = ALL_CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = opportunities.filter((o) => o.category === cat).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">

      {/* ── SECTION A: OPPORTUNITIES ───────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold">Today's Content Opportunities</h3>
            <p className="text-xs text-muted-foreground">
              {loadingOpps ? "Loading…" : `${opportunities.length} opportunities · click any card to generate`}
            </p>
          </div>
          <button
            onClick={loadOpportunities}
            disabled={loadingOpps}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs hover:bg-accent transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingOpps ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: "none" }}>
          {ALL_CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  active
                    ? `${meta.bg} ${meta.color} ${meta.border}`
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
                <span className="opacity-60">({catCounts[cat] ?? 0})</span>
              </button>
            );
          })}
        </div>

        {oppsError && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-xs text-destructive mb-3">
            {oppsError}
          </div>
        )}

        {loadingOpps ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-44 rounded-lg border border-border animate-pulse bg-muted/20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {visibleOpps.map((opp) => (
              <OpportunityCard
                key={`${opp.player_id}-${opp.category}`}
                opp={opp}
                selected={generating && packPlayer === opp.player_name}
                onSelect={handleOppSelect}
              />
            ))}
            {visibleOpps.length === 0 && (
              <div className="col-span-full text-center py-10 text-xs text-muted-foreground">
                No opportunities in this category.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SECTION B: MANUAL PLAYER SELECTOR ─────────────────────────────── */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Manual Player Selection</h3>
        </div>
        <p className="text-xs text-muted-foreground">Select any player from the rankings and choose a content angle.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Player search */}
          <div className="md:col-span-2 relative" ref={dropdownRef}>
            <div
              className="flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer bg-background hover:border-foreground/30 transition-colors"
              onClick={() => setShowDropdown((v) => !v)}
            >
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              {selectedPlayer ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-medium text-sm truncate">{selectedPlayer.player_name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{selectedPlayer.team}</span>
                  {selectedPlayer.position && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${posColor(selectedPlayer.position)}`}>
                      {selectedPlayer.position}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground flex-1">Search player from rankings…</span>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>

            {showDropdown && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-xl max-h-72 overflow-y-auto">
                <div className="sticky top-0 bg-popover border-b border-border px-3 py-2 flex items-center gap-2">
                  <input
                    autoFocus
                    placeholder="Search by name…"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    className="flex-1 text-sm bg-transparent outline-none"
                  />
                  <div className="flex gap-1">
                    {["ALL","MID","DEF","FWD","RUC"].map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setPosFilter(pos)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          posFilter === pos ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
                {loadingPlayers ? (
                  <div className="flex items-center justify-center py-6">
                    <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-4 text-center">No players found</p>
                ) : (
                  filteredPlayers.slice(0, 60).map((p) => (
                    <div
                      key={p.player_id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                      onClick={() => {
                        setSelectedPlayer(p);
                        setShowDropdown(false);
                        setPlayerSearch("");
                      }}
                    >
                      <span className="font-medium truncate flex-1">{p.player_name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{p.team}</span>
                      {p.position && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${posColor(p.position)}`}>
                          {p.position}
                        </span>
                      )}
                      {p.projection_final != null && (
                        <span className="text-xs text-muted-foreground shrink-0">{Math.round(p.projection_final)}pt</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Category selector */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map((cat) => {
              const meta = CATEGORY_META[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-1 min-w-[70px] px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    selectedCategory === cat
                      ? `${meta.bg} ${meta.color} ${meta.border}`
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {selectedPlayer && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-md border border-border text-xs">
            <div>
              <span className="text-muted-foreground block">Projection</span>
              <span className="font-semibold">{fmt(selectedPlayer.projection_final, " pts")}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Ceiling</span>
              <span className="font-semibold">{fmt(selectedPlayer.ceiling, " pts")}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Price</span>
              <span className="font-semibold">{fmtPrice(selectedPlayer.price)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Value</span>
              <span className="font-semibold">{fmtDec(selectedPlayer.value_score, 1)}</span>
            </div>
            {selectedPlayer.summary_short && (
              <div className="col-span-full">
                <span className="text-muted-foreground block mb-0.5">Neeko Take</span>
                <p className="text-foreground/80 leading-relaxed">{selectedPlayer.summary_short}</p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleManualGenerate}
          disabled={!selectedPlayer || generating}
          className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {generating ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Generating with AI…</>
          ) : (
            <><Zap className="h-4 w-4" /> Generate Content Pack</>
          )}
        </button>
      </div>

      {/* ── GENERATING INDICATOR ───────────────────────────────────────────── */}
      {generating && (
        <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-muted/20">
          <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Generating content for {packPlayer}…</p>
            <p className="text-xs text-muted-foreground">AI is writing scripts, hooks, captions, and visual directions.</p>
          </div>
        </div>
      )}

      {/* ── CONTENT PACK OUTPUT ───────────────────────────────────────────── */}
      {pack && !generating && (
        <ContentPackDisplay
          pack={pack}
          playerName={packPlayer}
          category={packCategory}
          onSave={handleSave}
          saving={saving}
          saved={saved}
        />
      )}
    </div>
  );
}
