// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

let supabaseInstance: SupabaseClient | null = null;

function getProjectRef(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    return parts[0];
  } catch (error) {
    console.error("Failed to extract project ref from URL:", url, error);
    return "default";
  }
}

function createSupabaseClient(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const projectRef = getProjectRef(supabaseUrl);
  const storageKey = `sb-${projectRef}-auth-token`;

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey,
      storage: {
        getItem: (key) => {
          try {
            return window.localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (key, value) => {
          try {
            window.localStorage.setItem(key, value);
          } catch {}
        },
        removeItem: (key) => {
          try {
            window.localStorage.removeItem(key);
          } catch {}
        },
      },
      debug: false,
    },
  });

  return supabaseInstance;
}

export const supabase = createSupabaseClient();

if (import.meta.hot) {
  import.meta.hot.accept();
}
