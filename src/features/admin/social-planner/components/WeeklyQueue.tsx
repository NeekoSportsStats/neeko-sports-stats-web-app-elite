import type { WeekSchedule } from "../lib/scheduleEngine";
import type { SocialPost, PostStatus, DayOfWeek } from "../types";
import { PostCard } from "./PostCard";
import { groupSlotsByDay } from "../lib/scheduleEngine";

const DAY_ORDER: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
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

  // Group by day
  const byDay: Partial<Record<DayOfWeek, SocialPost[]>> = {};
  for (const post of posts) {
    if (!byDay[post.dayOfWeek]) byDay[post.dayOfWeek] = [];
    byDay[post.dayOfWeek]!.push(post);
  }

  return (
    <div className="space-y-6">
      {DAY_ORDER.map(day => {
        const dayPosts = byDay[day];
        if (!dayPosts || dayPosts.length === 0) return null;
        return (
          <div key={day}>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                {DAY_LABELS[day]}
              </h2>
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-[10px] text-zinc-600">{dayPosts.length} post{dayPosts.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dayPosts.map(post => (
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
      })}
    </div>
  );
}
