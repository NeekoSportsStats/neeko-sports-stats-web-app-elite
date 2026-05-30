import { useState } from 'react';
import type { PostStatus } from './types';

export const STATUS_LABELS: Record<PostStatus, string> = {
  todo: 'To Do',
  drafted: 'Drafted',
  image_needed: 'Image Needed',
  image_created: 'Image Created',
  scheduled: 'Scheduled',
  posted_tiktok: 'Posted TikTok',
  posted_instagram: 'Posted Instagram',
  posted_facebook: 'Posted Facebook',
  skipped: 'Skipped',
  do_not_use: 'Do Not Use',
};

export const STATUS_OPTIONS: PostStatus[] = [
  'todo', 'drafted', 'image_needed', 'image_created', 'scheduled',
  'posted_tiktok', 'posted_instagram', 'posted_facebook', 'skipped', 'do_not_use',
];

export function usePostStatus() {
  const [statuses, setStatuses] = useState<Record<string, PostStatus>>({});

  function getStatus(postId: string): PostStatus {
    return statuses[postId] ?? 'todo';
  }

  function setStatus(postId: string, status: PostStatus) {
    setStatuses(prev => ({ ...prev, [postId]: status }));
  }

  return { getStatus, setStatus };
}
