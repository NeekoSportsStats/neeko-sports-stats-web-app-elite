import { useState } from "react";
import { TriangleAlert as AlertTriangle, Copy, Check, Users, Layers, ExternalLink } from "lucide-react";
import type { SocialPost, PostStatus } from "../types";

const STATUS_CONFIG: Record<PostStatus, { label: string; color: string }> = {
  draft:     { label: "Draft",     color: "text-zinc-400 bg-zinc-800 border-zinc-700" },
  ready:     { label: "Ready",     color: "text-emerald-400 bg-emerald-950 border-emerald-800" },
  scheduled: { label: "Scheduled", color: "text-sky-400 bg-sky-950 border-sky-800" },
  posted:    { label: "Posted",    color: "text-zinc-500 bg-zinc-900 border-zinc-700" },
  archived:  { label: "Archived",  color: "text-zinc-600 bg-zinc-900 border-zinc-800" },
};

const CONTENT_TYPE_LABELS: Record<SocialPost["contentType"], string> = {
  match_stat_board:     "Match Board",
  player_spotlight:     "Player Spotlight",
  player_spotlight_duo: "Player Duo",
  round_review:         "Round Review",
  round_ahead_watch:    "Round Ahead",
  product_education:    "Product / Education",
  story_extra:          "Story Extra",
};

const VISIBILITY_BADGES: Record<string, string> = {
  open_free_game: "text-emerald-400 bg-emerald-950 border-emerald-800",
  preview_blurred: "text-amber-400 bg-amber-950 border-amber-800",
  manual: "text-zinc-400 bg-zinc-800 border-zinc-700",
};

interface PostCardProps {
  post: SocialPost;
  onEdit: (post: SocialPost) => void;
  onStatusChange: (id: string, status: PostStatus) => void;
}

export function PostCard({ post, onEdit, onStatusChange }: PostCardProps) {
  const [captionCopied, setCaptionCopied] = useState(false);
  const status = STATUS_CONFIG[post.status];
  const hasWarnings = post.warnings.length > 0;

  function handleCopyCaption(e: React.MouseEvent) {
    e.stopPropagation();
    const text = `${post.hook}\n\n${post.caption}\n\n${post.hashtags.join(" ")}`;
    navigator.clipboard.writeText(text).then(() => {
      setCaptionCopied(true);
      setTimeout(() => setCaptionCopied(false), 1800);
    });
  }

  function handleMarkReady(e: React.MouseEvent) {
    e.stopPropagation();
    onStatusChange(post.id, "ready");
  }

  const hasMissingRequired = post.warnings.some(w =>
    w.includes("selection required") || w.includes("before marking")
  );
  const canMarkReady = !hasWarnings && !hasMissingRequired;
  const visibilityMode = post.visibilityMode;
  const visibilityBadgeColor = visibilityMode ? (VISIBILITY_BADGES[visibilityMode] ?? VISIBILITY_BADGES.manual) : null;

  const gameLabel = post.homeTeam && post.awayTeam
    ? `${post.homeTeam} v ${post.awayTeam}`
    : null;

  const visibleRows = post.carouselSlides.reduce((sum, s) => sum + (s.visibleRowCount ?? 0), 0);
  const blurredRows = post.carouselSlides.reduce((sum, s) => sum + (s.blurredRowCount ?? 0), 0);

  return (
    <div
      className={`
        relative rounded-lg border bg-zinc-900 p-4 cursor-pointer
        hover:border-zinc-600 transition-colors
        ${hasWarnings ? "border-amber-800/60" : "border-zinc-800"}
      `}
      onClick={() => onEdit(post)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <p className="text-[10px] text-zinc-500">{CONTENT_TYPE_LABELS[post.contentType]}</p>
            {visibilityMode && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${visibilityBadgeColor}`}>
                {visibilityMode === "open_free_game" ? "Free Board" : visibilityMode === "preview_blurred" ? "Preview" : "Manual"}
              </span>
            )}
            {hasWarnings && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                {post.warnings.length}
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-zinc-200 truncate">{post.title}</h3>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Game matchup */}
      {gameLabel && (
        <p className="text-[11px] text-zinc-400 font-medium mb-1">{gameLabel}</p>
      )}

      {/* Hook preview */}
      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{post.hook}</p>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] text-zinc-500 mb-3">
        <span className="flex items-center gap-1">
          <Layers className="w-3 h-3" />
          {post.carouselSlides.length} slides
        </span>
        {post.selectedPlayers.length > 0 && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {post.selectedPlayers.length} player{post.selectedPlayers.length !== 1 ? "s" : ""}
          </span>
        )}
        {blurredRows > 0 && (
          <span className="text-zinc-600">
            {visibleRows} visible · {blurredRows} blurred
          </span>
        )}
        <span className="text-zinc-600">{post.hashtags.length} tags</span>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/60">
        <div className="flex items-center gap-2">
          <button
            className={`flex items-center gap-1 text-[10px] transition-colors
              ${captionCopied ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-300"}`}
            onClick={handleCopyCaption}
          >
            {captionCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {captionCopied ? "Copied" : "Copy Caption"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {post.status === "draft" && (
              <button
                disabled={!canMarkReady}
                className={`text-[10px] transition-colors
                  ${canMarkReady
                    ? "text-emerald-400 hover:text-emerald-300"
                    : "text-zinc-600 cursor-not-allowed"}`}
                onClick={canMarkReady ? handleMarkReady : undefined}
              >
                Mark Ready
              </button>
            )}
          <span className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">
            <ExternalLink className="w-3 h-3" />
            Open
          </span>
        </div>
      </div>
    </div>
  );
}
