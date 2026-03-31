export type LibraryItemType = "draft" | "script" | "image" | "video";
export type LibraryStatus   = "idea" | "posted";
export type LibraryPlatform = "tiktok" | "instagram" | "reddit" | "x";

export interface LibraryMetrics {
  views?:    number;
  likes?:    number;
  comments?: number;
  shares?:   number;
  saves?:    number;
}

export interface LibraryItem {
  id:        string;
  type:      LibraryItemType;
  title:     string;
  content:   string;
  player:    string | null;
  tags:      string[];
  createdAt: string;
  status?:   LibraryStatus;
  platform?: LibraryPlatform | null;
  metrics?:  LibraryMetrics;
}

export type NewLibraryItem = Omit<LibraryItem, "id" | "createdAt">;

export const LIBRARY_KEY = "neeko-marketing-library";

export function loadLibrary(): LibraryItem[] {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "[]") as LibraryItem[];
  } catch {
    return [];
  }
}

export function saveLibrary(items: LibraryItem[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
}

export function addToLibrary(item: NewLibraryItem): LibraryItem {
  const newItem: LibraryItem = {
    status:   "idea",
    platform: null,
    metrics:  {},
    ...item,
    id:        crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const updated = [newItem, ...loadLibrary()];
  saveLibrary(updated);
  if (typeof window !== "undefined" && typeof window.__onLibraryAdd === "function") {
    window.__onLibraryAdd(newItem);
  }
  return newItem;
}

export function updateLibraryItem(id: string, updates: Partial<LibraryItem>): LibraryItem | null {
  const items = loadLibrary();
  const idx   = items.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const updated = { ...items[idx], ...updates };
  items[idx] = updated;
  saveLibrary(items);
  return updated;
}

export function computeScore(metrics: LibraryMetrics = {}): number {
  return (
    (metrics.views    ?? 0) * 1 +
    (metrics.likes    ?? 0) * 3 +
    (metrics.comments ?? 0) * 5 +
    (metrics.shares   ?? 0) * 8 +
    (metrics.saves    ?? 0) * 6
  );
}

declare global {
  interface Window {
    __onLibraryAdd?: (item: LibraryItem) => void;
  }
}
