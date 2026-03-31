// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

try {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  console.log("[Supabase Client] Initializing...", {
    hasUrl: !!url,
    hasKey: !!key,
    urlPrefix: url ? url.substring(0, 30) + "..." : "undefined"
  });

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

      console.log("[Supabase Client] ✓ Initialized successfully");
    } catch (error) {
      console.error("[Supabase Client] ✗ Failed to create client:", error);
      supabase = null;
    }
  } else {
    console.error("[Supabase Client] ✗ Missing environment variables", {
      VITE_SUPABASE_URL: url ? "present" : "MISSING",
      VITE_SUPABASE_ANON_KEY: key ? "present" : "MISSING"
    });
  }
} catch (err) {
  console.error("[Supabase Client] ✗ Initialization error:", err);
  supabase = null;
}

if (!supabase) {
  console.error("[Supabase Client] ✗ Client not initialized - check environment variables in .env file");
}

export { supabase };

if (import.meta.hot) {
  import.meta.hot.accept();
}
