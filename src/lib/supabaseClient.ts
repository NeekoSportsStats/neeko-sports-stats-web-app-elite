// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

try {
  console.log("Supabase client initializing...");

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  console.log("URL exists:", !!url);
  console.log("Key exists:", !!key);

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

      console.log("Supabase client created successfully");
    } catch (error) {
      console.error("Supabase client creation failed:", error);
      supabase = null;
    }
  } else {
    console.warn("Supabase env vars missing - running in offline mode");
  }
} catch (err) {
  console.error("Supabase init failed:", err);
  supabase = null;
}

export { supabase };

if (import.meta.hot) {
  import.meta.hot.accept();
}
