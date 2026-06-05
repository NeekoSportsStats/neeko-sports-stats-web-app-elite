import { useState, useEffect, useCallback } from "react";
import { RefreshCw, BookOpen, List, Settings, CircleAlert as AlertCircle, Loader as Loader2, Activity, CircleCheck as CheckCircle2, Circle as XCircle } from "lucide-react";
import type { SocialPost, PostStatus, PlannerSettings, AFLGame, AFLPlayerStat } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { buildWeekSchedule, getMondayOfWeek, type WeekSchedule } from "./lib/scheduleEngine";
import { buildWeekPosts } from "./lib/postGenerator";
import { useSocialPlannerData } from "./hooks/useSocialPlannerData";
import { PlannerHeader } from "./components/PlannerHeader";
import { WeeklyQueue } from "./components/WeeklyQueue";
import { PostEditorDrawer } from "./components/PostEditorDrawer";
import { HookCaptionLibrary } from "./components/HookCaptionLibrary";
import { SettingsPanel } from "./components/SettingsPanel";

type Tab = "queue" | "library" | "settings";

interface DataHealth {
  rpcStatus: "ok" | "error" | "idle";
  rpcError: string | null;
  season: number;
  minGames: number;
  totalPlayerRows: number;
  disposalRows: number;
  goalRows: number;
  gamesLoaded: number;
  matchBoardsGenerated: number;
  lastRefresh: string | null;
}

export default function SocialPlannerPage() {
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [isGenerating, setIsGenerating] = useState(false);
  const [roundInitialised, setRoundInitialised] = useState(false);
  const [health, setHealth] = useState<DataHealth>({
    rpcStatus: "idle",
    rpcError: null,
    season: DEFAULT_SETTINGS.currentSeason,
    minGames: 3,
    totalPlayerRows: 0,
    disposalRows: 0,
    goalRows: 0,
    gamesLoaded: 0,
    matchBoardsGenerated: 0,
    lastRefresh: null,
  });

  const db = useSocialPlannerData();

  // ── Auto-populate round + season from DB on mount ──────────────────────────
  useEffect(() => {
    (async () => {
      const current = await db.fetchCurrentRound().catch(() => null);
      if (current) {
        setSettings(prev => ({
          ...prev,
          currentRound: current.week ?? prev.currentRound,
          currentSeason: current.season ?? prev.currentSeason,
        }));
      }
      setRoundInitialised(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load existing posts for current round whenever round changes ───────────
  useEffect(() => {
    if (!roundInitialised) return;
    (async () => {
      const saved = await db.loadPosts(settings.currentRound, settings.currentSeason).catch(() => []);
      if (saved.length > 0) setPosts(saved);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundInitialised, settings.currentRound, settings.currentSeason]);

  // ── Generate Week ──────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);

    try {
      const { currentRound, currentSeason } = settings;
      const today = new Date().toISOString().split("T")[0];
      const monday = getMondayOfWeek(today);

      let fetchedPlayers: AFLPlayerStat[] = [];
      let rpcOk = true;
      let rpcErr: string | null = null;

      const [games, players] = await Promise.all([
        db.fetchGames(currentRound, currentSeason).catch((): AFLGame[] => []),
        db.fetchPlayerStats(currentSeason).catch((e): AFLPlayerStat[] => {
          rpcOk = false;
          rpcErr = e instanceof Error ? e.message : String(e);
          return [];
        }),
      ]);
      fetchedPlayers = players;
      if (fetchedPlayers.length > 0) { rpcOk = true; }

      const newSchedule = buildWeekSchedule(currentRound, currentSeason, monday, games, settings);
      const newPosts = buildWeekPosts(newSchedule.slots, settings, fetchedPlayers, games);
      const matchBoards = newPosts.filter(p => p.contentType === "match_stat_board").length;

      setHealth({
        rpcStatus: rpcOk ? "ok" : "error",
        rpcError: rpcErr,
        season: currentSeason,
        minGames: 3,
        totalPlayerRows: fetchedPlayers.length,
        disposalRows: fetchedPlayers.filter(p => p.statType === "disposals").length,
        goalRows: fetchedPlayers.filter(p => p.statType === "goals").length,
        gamesLoaded: games.length,
        matchBoardsGenerated: matchBoards,
        lastRefresh: new Date().toISOString(),
      });

      setSchedule(newSchedule);
      setPosts(newPosts);

      // Persist in background — don't block the UI
      db.savePosts(newPosts, currentRound, currentSeason).catch(console.error);
    } finally {
      setIsGenerating(false);
    }
  }, [settings, db]);

  // ── Status change ──────────────────────────────────────────────────────────
  const handleStatusChange = useCallback((id: string, status: PostStatus) => {
    setPosts(prev =>
      prev.map(p => p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p)
    );
    db.updateStatus(id, status).catch(console.error);
  }, [db]);

  // ── Save edited post ───────────────────────────────────────────────────────
  const handleSavePost = useCallback((updatedPost: SocialPost) => {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
    db.upsertPost(updatedPost).catch(console.error);
  }, [db]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <PlannerHeader schedule={schedule} onSettings={() => setTab("settings")} />

        {/* DB error banner */}
        {db.error && (
          <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{db.error}</span>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 border-b border-zinc-800 pb-0">
          <TabButton
            icon={<List className="w-3.5 h-3.5" />}
            label="Weekly Queue"
            active={tab === "queue"}
            onClick={() => setTab("queue")}
          />
          <TabButton
            icon={<BookOpen className="w-3.5 h-3.5" />}
            label="Hook & Caption Library"
            active={tab === "library"}
            onClick={() => setTab("library")}
          />
          <TabButton
            icon={<Settings className="w-3.5 h-3.5" />}
            label="Settings"
            active={tab === "settings"}
            onClick={() => setTab("settings")}
          />
        </div>

        {/* Tab content */}
        {tab === "queue" && (
          <div>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <p className="text-sm text-zinc-400">
                  Round {settings.currentRound} · Season {settings.currentSeason}
                </p>
                {db.isLoading && !isGenerating && (
                  <Loader2 className="w-3.5 h-3.5 text-zinc-500 animate-spin" />
                )}
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || db.isLoading}
                className="flex items-center gap-2 px-4 py-2 text-xs rounded-md bg-sky-700 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                {isGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {isGenerating
                  ? "Generating..."
                  : posts.length > 0 ? "Regenerate Week" : "Generate Week"}
              </button>
            </div>

            {/* Data Health Panel — shown after first generate */}
            {health.lastRefresh && (
              <DataHealthPanel health={health} />
            )}

            <WeeklyQueue
              posts={posts}
              onEditPost={setEditingPost}
              onStatusChange={handleStatusChange}
            />
          </div>
        )}

        {tab === "library" && (
          <div className="h-[calc(100vh-200px)]">
            <HookCaptionLibrary />
          </div>
        )}

        {tab === "settings" && (
          <div className="max-w-lg">
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              onClose={() => setTab("queue")}
            />
          </div>
        )}
      </div>

      {/* Post editor drawer */}
      <PostEditorDrawer
        post={editingPost}
        onClose={() => setEditingPost(null)}
        onSave={handleSavePost}
      />
    </div>
  );
}

function DataHealthPanel({ health }: { health: DataHealth }) {
  const isOk = health.rpcStatus === "ok";
  const isError = health.rpcStatus === "error";

  const rows: Array<{ label: string; value: string | number; warn?: boolean }> = [
    { label: "RPC Status",        value: health.rpcStatus.toUpperCase(), warn: isError },
    { label: "Last RPC Error",    value: health.rpcError ?? "—", warn: !!health.rpcError },
    { label: "Season",            value: health.season },
    { label: "Min Games Filter",  value: health.minGames },
    { label: "Player stat rows",  value: health.totalPlayerRows, warn: health.totalPlayerRows === 0 },
    { label: "Disposal rows",     value: health.disposalRows, warn: health.disposalRows === 0 },
    { label: "Goal rows",         value: health.goalRows, warn: health.goalRows === 0 },
    { label: "Games loaded",      value: health.gamesLoaded, warn: health.gamesLoaded === 0 },
    { label: "Match boards",      value: health.matchBoardsGenerated },
    { label: "Last refresh",      value: health.lastRefresh ? new Date(health.lastRefresh).toLocaleTimeString() : "—" },
  ];

  return (
    <div className={`mb-5 rounded-lg border p-3 ${isError ? "border-red-800/50 bg-red-950/20" : "border-zinc-800 bg-zinc-900/50"}`}>
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3.5 h-3.5 text-zinc-400" />
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Data Health</p>
        {isOk && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        {isError && <XCircle className="w-3.5 h-3.5 text-red-400" />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-1.5">
        {rows.map(r => (
          <div key={r.label}>
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider">{r.label}</p>
            <p className={`text-[11px] font-mono font-medium truncate ${r.warn ? "text-amber-400" : "text-zinc-300"}`}>
              {String(r.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px
        ${active
          ? "border-sky-500 text-sky-400"
          : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
    >
      {icon}
      {label}
    </button>
  );
}
