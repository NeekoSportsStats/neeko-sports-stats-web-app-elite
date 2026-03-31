// src/lib/auth.tsx
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { identifyUser, resetUser } from "@/lib/analytics";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  refreshPremiumStatus: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isPremium: false,
  isAdmin: false,
  refreshPremiumStatus: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  console.log("AuthProvider initializing...");

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [premiumLoading, setPremiumLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const initialSessionSeenRef = useRef(false);
  const premiumFetchInFlightRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  // If Supabase is not available, set safe defaults
  if (!supabase) {
    console.warn("Supabase client unavailable - AuthProvider running in offline mode");
    return (
      <AuthContext.Provider
        value={{
          user: null,
          loading: false,
          isPremium: false,
          isAdmin: false,
          refreshPremiumStatus: async () => {},
          signOut: async () => {}
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  /**
   * Fetch premium status using the server-side get_access_state() RPC.
   * This is authoritative — expiry is evaluated by the database, not the browser clock.
   */
  const fetchPremiumStatus = useCallback(async (_userId: string) => {
    if (!supabase) {
      setPremiumLoading(false);
      return;
    }
    setPremiumLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_access_state");

      if (error) {
        console.error("❌ Premium status error:", error);
        setIsPremium(false);
        return;
      }

      const active = data?.is_premium === true;
      const admin  = data?.is_admin   === true;
      setIsPremium(active);
      setIsAdmin(admin);
    } catch (err) {
      console.error("❌ Premium status exception:", err);
      setIsPremium(false);
      setIsAdmin(false);
    } finally {
      setPremiumLoading(false);
    }
  }, []);

  /**
   * Public method to re-check premium status for the current user.
   */
  const refreshPremiumStatus = useCallback(async () => {
    if (!user?.id) return;
    await fetchPremiumStatus(user.id);
  }, [user?.id, fetchPremiumStatus]);

  /**
   * Logout helper – only runs when you explicitly call signOut()
   */
  const signOut = useCallback(async () => {
    setUser(null);
    setIsPremium(false);
    setIsAdmin(false);
    setLoading(false);
    if (supabase) {
      try {
        await supabase.auth.signOut({ scope: "global" });
      } catch (err) {
        console.error("❌ signOut error:", err);
      }
    }
    window.location.href = "/";
  }, []);

  /**
   * Initialise auth state and listen for changes.
   *
   * CRITICAL: The onAuthStateChange callback MUST return synchronously.
   * Awaiting any Supabase call (e.g. supabase.from) inside the callback
   * creates a session-lock deadlock that freezes auth, tables, and logout.
   * All async work is deferred into a non-awaited IIFE so the callback
   * returns immediately.
   */
  useEffect(() => {
    let isMounted = true;

    const applySession = (session: any, source: string) => {
      if (!isMounted) return;

      const currentUser = session?.user ?? null;

      setUser(currentUser);

      if (currentUser?.id) {
        identifyUser({ id: currentUser.id, email: currentUser.email ?? undefined });
        if (premiumFetchInFlightRef.current) return;
        premiumFetchInFlightRef.current = true;
        (async () => {
          await fetchPremiumStatus(currentUser.id);
          premiumFetchInFlightRef.current = false;
          if (isMounted) setLoading(false);
        })();
      } else {
        setIsPremium(false);
        setPremiumLoading(false);
        setLoading(false);
      }
    };

    // Single source of truth: the auth state change listener.
    // The callback is synchronous — async work runs in a detached IIFE.
    if (!supabase) {
      setLoading(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      switch (event) {
        case "INITIAL_SESSION":
          initialSessionSeenRef.current = true;
          currentUserIdRef.current = session?.user?.id ?? null;
          applySession(session, event);
          break;

        case "SIGNED_IN": {
          const newUserId = session?.user?.id ?? null;
          if (newUserId === currentUserIdRef.current) {
            return;
          }
          currentUserIdRef.current = newUserId;
          applySession(session, event);
          break;
        }

        case "TOKEN_REFRESHED":
          applySession(session, event);
          break;

        case "USER_UPDATED":
          if (typeof window !== "undefined" && window.location.pathname === "/reset-password") {
            return;
          }
          applySession(session, event);
          break;

        case "SIGNED_OUT":
          currentUserIdRef.current = null;
          resetUser();
          setUser(null);
          setIsPremium(false);
          setIsAdmin(false);
          setLoading(false);
          break;

        default:
          break;
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchPremiumStatus]);

  return (
    <AuthContext.Provider
      value={{ user, loading: loading || premiumLoading, isPremium, isAdmin, refreshPremiumStatus, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};
