// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

try {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      const hostname = new URL(url).hostname;
      const parts = hostname.split(".");
      const projectRef = parts[0] || "default";
      const storageKey = `sb-${projectRef}-auth-token`;

      supabase = createClient(url, key, {
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

    } catch (error) {
      console.error("Supabase client failed:", error);
      supabase = null;
    }
  } else {
    console.warn("Supabase env missing");
  }
} catch (err) {
  console.error("Supabase init error:", err);
  supabase = null;
}

export { supabase };

if (import.meta.hot) {
  import.meta.hot.accept();
}
