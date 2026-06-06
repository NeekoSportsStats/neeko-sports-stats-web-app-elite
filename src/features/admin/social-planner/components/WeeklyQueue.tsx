import type { SocialPost, PostStatus, DayOfWeek } from "../types";
import { PostCard } from "./PostCard";

const STANDARD_DAY_ORDER: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS: Record<DayOfWeek, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

interface WeeklyQueueProps {
  posts: SocialPost[];
  onEditPost: (post: SocialPost) => void;
  onStatusChange: (id: string, status: PostStatus) => void;
}

export function WeeklyQueue({ posts, onEditPost, onStatusChange }: WeeklyQueueProps) {
  if (posts.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500">
        <p className="text-sm">No posts generated yet.</p>
        <p className="text-xs mt-1">Generate the week schedule to get started.</p>
      </div>
    );
  }

  // Separate overflow match boards from standard posts
  const overflowPosts = posts.filter(p => p.isRoundOverflow);
  const standardPosts = posts.filter(p => !p.isRoundOverflow);

  // Group standard posts by day
  const byDay: Partial<Record<DayOfWeek, SocialPost[]>> = {};
  for (const post of standardPosts) {
    if (!byDay[post.dayOfWeek]) byDay[post.dayOfWeek] = [];
    byDay[post.dayOfWeek]!.push(post);
  }

  // Group overflow posts by day (preserves their actual day label)
  const overflowByDay: Partial<Record<DayOfWeek, SocialPost[]>> = {};
  for (const post of overflowPosts) {
    if (!overflowByDay[post.dayOfWeek]) overflowByDay[post.dayOfWeek] = [];
    overflowByDay[post.dayOfWeek]!.push(post);
  }

  // Determine the round number from any post
  const roundNum = posts[0]?.round ?? "";

  return (
    <div className="space-y-6">
      {/* Standard weekly sections Mon → Sun */}
      {STANDARD_DAY_ORDER.map(day => {
        const dayPosts = byDay[day];
        if (!dayPosts || dayPosts.length === 0) return null;
        return (
          <DaySection
            key={day}
            label={DAY_LABELS[day]}
            posts={dayPosts}
            onEditPost={onEditPost}
            onStatusChange={onStatusChange}
          />
        );
      })}

      {/* Overflow sections — same-round games on planning days, rendered after Sunday */}
      {overflowPosts.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex-1 h-px bg-zinc-700" />
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest px-2">
              Round {roundNum} Continued
            </span>
            <div className="flex-1 h-px bg-zinc-700" />
          </div>
          <p className="text-[10px] text-zinc-600 text-center mb-4">
            Extended-round fixture{overflowPosts.length !== 1 ? "s" : ""} — same round, post after Sunday
          </p>
          {STANDARD_DAY_ORDER.map(day => {
            const dayPosts = overflowByDay[day];
            if (!dayPosts || dayPosts.length === 0) return null;
            return (
              <DaySection
                key={`overflow-${day}`}
                label={`${DAY_LABELS[day]} — Round ${roundNum} Continued`}
                posts={dayPosts}
                onEditPost={onEditPost}
                onStatusChange={onStatusChange}
                labelClass="text-amber-400"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DaySection({
  label,
  posts,
  onEditPost,
  onStatusChange,
  labelClass = "text-zinc-400",
}: {
  label: string;
  posts: SocialPost[];
  onEditPost: (post: SocialPost) => void;
  onStatusChange: (id: string, status: PostStatus) => void;
  labelClass?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className={`text-xs font-semibold uppercase tracking-widest ${labelClass}`}>
          {label}
        </h2>
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-[10px] text-zinc-600">{posts.length} post{posts.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {posts.map(post => (
          <PostCard
            key={post.id}
            post={post}
            onEdit={onEditPost}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </div>
  );
}
