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
import { invalidateFreePlayerCache } from "@/lib/playerAccess";

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
  if (!supabase) {
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

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [premiumLoading, setPremiumLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const initialSessionSeenRef = useRef(false);
  const premiumFetchInFlightRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);

  const fetchPremiumStatus = useCallback(async (_userId: string) => {
    if (!supabase) {
      setPremiumLoading(false);
      return;
    }
    setPremiumLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_access_state");

      if (error) {
        console.error("Premium status error:", error);
        setIsPremium(false);
        return;
      }

      const active = data?.is_premium === true;
      const admin  = data?.is_admin   === true;
      setIsPremium(active);
      setIsAdmin(admin);
    } catch (err) {
      console.error("Premium status exception:", err);
      setIsPremium(false);
      setIsAdmin(false);
    } finally {
      setPremiumLoading(false);
    }
  }, []);

  const refreshPremiumStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      await fetchPremiumStatus(user.id);
    } catch (err) {
      console.error("refreshPremiumStatus failed:", err);
    }
  }, [user?.id, fetchPremiumStatus]);

  const signOut = useCallback(async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut({ scope: "global" });
      }
    } catch (err) {
      console.error("signOut error:", err);
    } finally {
      setUser(null);
      setIsPremium(false);
      setIsAdmin(false);
      setLoading(false);
      window.location.href = "/";
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const applySession = (session: any, source: string) => {
      if (!isMounted) return;

      try {
        const currentUser = session?.user ?? null;

        setUser(currentUser);

        if (currentUser?.id) {
          try {
            identifyUser({ id: currentUser.id, email: currentUser.email ?? undefined });
          } catch (err) {
            console.error("identifyUser failed:", err);
          }

          if (premiumFetchInFlightRef.current) return;
          premiumFetchInFlightRef.current = true;

          (async () => {
            try {
              if (isMounted) await fetchPremiumStatus(currentUser.id);
            } catch (err) {
              console.error("fetchPremiumStatus failed:", err);
              if (isMounted) {
                setIsPremium(false);
                setIsAdmin(false);
              }
            } finally {
              premiumFetchInFlightRef.current = false;
              if (isMounted) setLoading(false);
            }
          })();
        } else {
          setIsPremium(false);
          setPremiumLoading(false);
          setLoading(false);
        }
      } catch (err) {
        console.error("applySession failed:", err);
        setLoading(false);
      }
    };

    try {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (!isMounted) return;

        try {
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
              invalidateFreePlayerCache();
              applySession(session, event);
              break;
            }

            case "TOKEN_REFRESHED":
              // Only update the user object — do NOT re-fetch premium status on every token refresh
              // to avoid hammering the auth endpoint and causing 429 errors.
              if (session?.user && isMounted) {
                setUser(session.user);
              }
              break;

            case "TOKEN_REFRESH_FAILED":
              // Stale/invalid refresh token — clear local auth state and redirect to login.
              currentUserIdRef.current = null;
              try {
                localStorage.removeItem("supabase.auth.token");
                // Clear any supabase-prefixed keys (session storage)
                Object.keys(localStorage)
                  .filter(k => k.startsWith("sb-"))
                  .forEach(k => localStorage.removeItem(k));
              } catch { /* storage may be unavailable */ }
              try { resetUser(); } catch { /* non-critical */ }
              if (isMounted) {
                setUser(null);
                setIsPremium(false);
                setIsAdmin(false);
                setLoading(false);
              }
              if (supabase) {
                supabase.auth.signOut({ scope: "global" }).catch(() => {});
              }
              window.location.href = "/login?reason=session_expired";
              break;

            case "USER_UPDATED":
              if (typeof window !== "undefined" && window.location.pathname === "/reset-password") {
                return;
              }
              applySession(session, event);
              break;

            case "SIGNED_OUT":
              currentUserIdRef.current = null;
              invalidateFreePlayerCache();
              try {
                resetUser();
              } catch (err) {
                console.error("resetUser failed:", err);
              }
              setUser(null);
              setIsPremium(false);
              setIsAdmin(false);
              setLoading(false);
              break;

            default:
              break;
          }
        } catch (err) {
          console.error("onAuthStateChange handler failed:", err);
          setLoading(false);
        }
      });

      return () => {
        isMounted = false;
        try {
          subscription.unsubscribe();
        } catch (err) {
          console.error("subscription.unsubscribe failed:", err);
        }
      };
    } catch (err) {
      console.error("onAuthStateChange setup failed:", err);
      setLoading(false);
    }
  }, [fetchPremiumStatus]);

  return (
    <AuthContext.Provider
      value={{ user, loading: loading || premiumLoading, isPremium, isAdmin, refreshPremiumStatus, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};
