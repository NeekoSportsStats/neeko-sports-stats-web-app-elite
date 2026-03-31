import { supabase } from "@/lib/supabaseClient";

const BUCKET = "content-assets";

export function getPublicStorageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
