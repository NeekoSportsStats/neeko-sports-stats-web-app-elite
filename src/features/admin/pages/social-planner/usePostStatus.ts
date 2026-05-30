/**
 * usePostStatus — localStorage-backed post workflow tracker.
 * Admin-only. No Supabase. No server round-trips.
 */
import { useState, useCallback } from "react";
import type { PostStatus } from "./types";

const PREFIX = "spp";

function statusKey(roundLabel: string, postId: string): string {
  return `${PREFIX}:status:${roundLabel}:${postId}`;
}
function noteKey(roundLabel: string, postId: string): string {
  return `${PREFIX}:note:${roundLabel}:${postId}`;
}

function readStatus(roundLabel: string, postId: string): PostStatus {
  try {
    return (localStorage.getItem(statusKey(roundLabel, postId)) as PostStatus) ?? "todo";
  } catch {
    return "todo";
  }
}

function readNote(roundLabel: string, postId: string): string {
  try {
    return localStorage.getItem(noteKey(roundLabel, postId)) ?? "";
  } catch {
    return "";
  }
}

export interface PostStatusEntry {
  status: PostStatus;
  note: string;
}

export function usePostStatus(roundLabel: string) {
  // We store the whole map in state to trigger re-renders on update
  const [, forceUpdate] = useState(0);

  const getEntry = useCallback((postId: string): PostStatusEntry => ({
    status: readStatus(roundLabel, postId),
    note: readNote(roundLabel, postId),
  }), [roundLabel]);

  const setStatus = useCallback((postId: string, status: PostStatus) => {
    try {
      localStorage.setItem(statusKey(roundLabel, postId), status);
    } catch { /* quota exceeded — silently ignore */ }
    forceUpdate(n => n + 1);
  }, [roundLabel]);

  const setNote = useCallback((postId: string, note: string) => {
    try {
      if (note) localStorage.setItem(noteKey(roundLabel, postId), note);
      else localStorage.removeItem(noteKey(roundLabel, postId));
    } catch { /* quota exceeded */ }
    forceUpdate(n => n + 1);
  }, [roundLabel]);

  return { getEntry, setStatus, setNote };
}

// ─── Status label helpers ─────────────────────────────────────────────────────

export const STATUS_LABELS: Record<PostStatus, string> = {
  todo:               "To do",
  drafted:            "Drafted",
  image_needed:       "Image needed",
  image_created:      "Image ready",
  scheduled:          "Scheduled",
  posted_tiktok:      "Posted TikTok",
  posted_instagram:   "Posted Instagram",
  posted_facebook:    "Posted Facebook",
  skipped:            "Skipped",
  do_not_use:         "Do not use",
};

export const STATUS_OPTIONS: PostStatus[] = [
  "todo",
  "drafted",
  "image_needed",
  "image_created",
  "scheduled",
  "posted_tiktok",
  "posted_instagram",
  "posted_facebook",
  "skipped",
  "do_not_use",
];
