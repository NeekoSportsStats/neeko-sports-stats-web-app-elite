export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type PlannerPostStatus = "draft" | "ready" | "posted";

export interface ContentPlannerPost {
  id: string;
  week_start: string;
  day: DayOfWeek;
  stat_angle: string;
  template: string;
  players_json: unknown;
  background: string;
  background_type: string;
  accent_color: string;
  caption: string;
  hashtags: string;
  export_format: string;
  status: PlannerPostStatus;
  image_url: string | null;
  image_category: string | null;
  created_at: string;
  updated_at: string;
}

export type PlatformId = "facebook" | "instagram" | "tiktok" | "reddit";

export interface ScheduledPost {
  id: string;
  day_of_week: DayOfWeek;
  post_slot: 1 | 2;
  platforms: PlatformId[];
  stat_angle: string;
  media_url: string | null;
  caption: string;
  insight: string;
  created_at: string;
  updated_at: string;
}

export interface AddToPlannerPayload {
  stat_angle: string;
  media_url: string | null;
  caption: string;
  insight: string;
}

export const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const PLATFORM_META: {
  id: PlatformId;
  label: string;
  color: string;
  shortLabel: string;
}[] = [
  { id: "facebook",  label: "Facebook",  shortLabel: "FB",  color: "#1877F2" },
  { id: "instagram", label: "Instagram", shortLabel: "IG",  color: "#E1306C" },
  { id: "tiktok",    label: "TikTok",    shortLabel: "TT",  color: "#69C9D0" },
  { id: "reddit",    label: "Reddit",    shortLabel: "RD",  color: "#FF4500" },
];
