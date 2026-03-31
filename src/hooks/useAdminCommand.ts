import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface CommandResponse {
  ok: boolean;
  success?: boolean;
  result?: unknown;
  data?: unknown;
  error?: string;
  message?: string;
  duration_ms?: number;
}

export async function runCommand(
  command: string,
  payload?: Record<string, unknown>,
): Promise<CommandResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, error: "Not authenticated" };
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-command`;

  console.log("[admin-command] →", command, payload ? { payload } : "");

  let raw: Record<string, unknown>;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ command, payload }),
    });
    raw = await res.json() as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    console.error("[admin-command] fetch failed:", command, message);
    return { ok: false, error: message };
  }

  const succeeded = raw.ok === true || raw.success === true;

  if (succeeded) {
    console.log("[admin-command] ✓", command, `(${raw.duration_ms ?? "?"}ms)`, raw.message ?? "");
    window.dispatchEvent(new Event("neeko:refresh"));
  } else {
    console.error("[admin-command] ✗", command, raw.error ?? raw);
  }

  return {
    ok: succeeded,
    success: succeeded,
    result: raw.result,
    data: raw.data,
    error: typeof raw.error === "string" ? raw.error : undefined,
    message: typeof raw.message === "string" ? raw.message : undefined,
    duration_ms: typeof raw.duration_ms === "number" ? raw.duration_ms : undefined,
  };
}

export function useAdminCommand() {
  const [running, setRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const execute = useCallback(async (
    command: string,
    payload?: Record<string, unknown>,
  ): Promise<CommandResponse> => {
    setRunning(true);
    setLastError(null);
    try {
      const result = await runCommand(command, payload);
      if (!result.ok) {
        setLastError(result.error ?? "Command failed");
      }
      return result;
    } finally {
      setRunning(false);
    }
  }, []);

  return { runCommand: execute, running, lastError };
}
