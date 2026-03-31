// src/lib/supabaseClient.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("Supabase client initializing...");
console.log("URL exists:", !!supabaseUrl);
console.log("Key exists:", !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase environment variables. App will run in limited mode."
  );
  // Don't throw - allow app to continue without Supabase
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

function createSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  // If env vars are missing, return null instead of crashing
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase client not initialized - missing credentials");
    return null;
  }

  try {
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

    console.log("Supabase client created successfully");
    return supabaseInstance;
  } catch (error) {
    console.error("Failed to create Supabase client:", error);
    return null;
  }
}

export const supabase = createSupabaseClient();

if (import.meta.hot) {
  import.meta.hot.accept();
}
