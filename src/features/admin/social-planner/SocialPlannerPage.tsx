import { useState, useCallback } from "react";
import { RefreshCw, BookOpen, Calendar, List, Settings } from "lucide-react";
import type { SocialPost, PostStatus, PlannerSettings, AFLGame, AFLPlayerStat } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { buildWeekSchedule, getMondayOfWeek, type WeekSchedule } from "./lib/scheduleEngine";
import { buildWeekPosts } from "./lib/postGenerator";
import { PlannerHeader } from "./components/PlannerHeader";
import { WeeklyQueue } from "./components/WeeklyQueue";
import { PostEditorDrawer } from "./components/PostEditorDrawer";
import { HookCaptionLibrary } from "./components/HookCaptionLibrary";
import { SettingsPanel } from "./components/SettingsPanel";

type Tab = "queue" | "library" | "settings";

export default function SocialPlannerPage() {
  const [settings, setSettings] = useState<PlannerSettings>(DEFAULT_SETTINGS);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [schedule, setSchedule] = useState<WeekSchedule | null>(null);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [tab, setTab] = useState<Tab>("queue");
  const [isGenerating, setIsGenerating] = useState(false);

  function handleGenerate() {
    setIsGenerating(true);

    // Derive Monday of the current week
    const today = new Date().toISOString().split("T")[0];
    const monday = getMondayOfWeek(today);

    // In production this would pull from Supabase — using empty arrays as stubs
    const games: AFLGame[] = [];
    const players: AFLPlayerStat[] = [];

    const newSchedule = buildWeekSchedule(
      settings.currentRound,
      settings.currentSeason,
      monday,
      games
    );

    const newPosts = buildWeekPosts(newSchedule.slots, settings, players, games);

    setSchedule(newSchedule);
    setPosts(newPosts);
    setIsGenerating(false);
  }

  function handleStatusChange(id: string, status: PostStatus) {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p));
  }

  function handleSavePost(updatedPost: SocialPost) {
    setPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <PlannerHeader schedule={schedule} onSettings={() => setTab("settings")} />

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
              <div className="flex items-center gap-3">
                <p className="text-sm text-zinc-400">
                  Round {settings.currentRound} · Season {settings.currentSeason}
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2 text-xs rounded-md bg-sky-700 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                {posts.length > 0 ? "Regenerate Week" : "Generate Week"}
              </button>
            </div>

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
