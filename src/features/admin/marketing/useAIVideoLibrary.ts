import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export type AIVideoCategory = "all" | "stadium" | "crowd" | "field" | "players" | "abstract";

export interface AIVideoItem {
  name: string;
  url: string;
  category: AIVideoCategory;
}

const BASE_PATH = "videos/ai-generated";

const CATEGORIES: Exclude<AIVideoCategory, "all">[] = [
  "stadium",
  "crowd",
  "field",
  "players",
  "abstract",
];

function inferCategory(filename: string): AIVideoCategory {
  const lower = filename.toLowerCase();
  for (const cat of CATEGORIES) {
    if (lower.startsWith(cat) || lower.includes(`_${cat}`) || lower.includes(`-${cat}`)) {
      return cat;
    }
  }
  return "abstract";
}

export function useAIVideoLibrary() {
  const [videos, setVideos]     = useState<AIVideoItem[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const allVideos: AIVideoItem[] = [];

      for (const cat of CATEGORIES) {
        const { data, error: listErr } = await supabase.storage
          .from("content-assets")
          .list(`${BASE_PATH}/${cat}`, { limit: 100, offset: 0 });

        if (listErr) continue;
        if (!data) continue;

        for (const file of data) {
          if (!file.name || file.name === ".emptyFolderPlaceholder") continue;
          const { data: urlData } = supabase.storage
            .from("content-assets")
            .getPublicUrl(`${BASE_PATH}/${cat}/${file.name}`);
          allVideos.push({
            name: file.name,
            url: urlData.publicUrl,
            category: cat,
          });
        }
      }

      const topLevel = await supabase.storage
        .from("content-assets")
        .list(BASE_PATH, { limit: 100, offset: 0 });

      if (topLevel.data) {
        for (const file of topLevel.data) {
          if (!file.name || file.name === ".emptyFolderPlaceholder") continue;
          if (file.metadata?.mimetype?.startsWith("video/") || /\.(mp4|webm|mov|ogg)$/i.test(file.name)) {
            const { data: urlData } = supabase.storage
              .from("content-assets")
              .getPublicUrl(`${BASE_PATH}/${file.name}`);
            allVideos.push({
              name: file.name,
              url: urlData.publicUrl,
              category: inferCategory(file.name),
            });
          }
        }
      }

      setVideos(allVideos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { videos, loading, error, reload: load };
}
