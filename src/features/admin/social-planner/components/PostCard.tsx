import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, FileText, Image, Play } from "lucide-react";
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

interface PostCardProps {
  post: SocialPost;
  onEdit: (post: SocialPost) => void;
  onStatusChange: (id: string, status: PostStatus) => void;
}

export function PostCard({ post, onEdit, onStatusChange }: PostCardProps) {
  const status = STATUS_CONFIG[post.status];
  const hasWarnings = post.warnings.length > 0;

  return (
    <div
      className={`
        relative rounded-lg border bg-zinc-900 p-4 cursor-pointer
        hover:border-zinc-600 transition-colors
        ${hasWarnings ? "border-amber-800/60" : "border-zinc-800"}
      `}
      onClick={() => onEdit(post)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-zinc-500 mb-0.5">{CONTENT_TYPE_LABELS[post.contentType]}</p>
          <h3 className="text-sm font-medium text-zinc-200 truncate">{post.title}</h3>
        </div>
        <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Hook preview */}
      <p className="text-xs text-zinc-400 line-clamp-2 mb-3">{post.hook}</p>

      {/* Meta row */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Image className="w-3 h-3" />
            {post.carouselSlides.length} slides
          </span>
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {post.hashtags.length} tags
          </span>
          {hasWarnings && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {post.warnings.length} warning{post.warnings.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {post.status === "draft" && (
            <button
              className="text-[10px] text-emerald-400 hover:text-emerald-300"
              onClick={(e) => { e.stopPropagation(); onStatusChange(post.id, "ready"); }}
            >
              Mark Ready
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
