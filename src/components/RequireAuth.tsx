// src/components/RequireAuth.tsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const allowedPaths = [
    "/success",
    "/cancel",
    "/auth",
    "/forgot-password",
    "/reset-password",
  ];

  const currentPath = location.pathname;
  const isAllowed = allowedPaths.some((p) => currentPath.startsWith(p));

  useEffect(() => {
    if (loading) return;

    if (isAllowed) return;

    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(currentPath)}`);
    }
  }, [user, loading, navigate, currentPath, isAllowed]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAllowed) return <>{children}</>;

  if (!user) return null;

  return <>{children}</>;
};
