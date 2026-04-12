import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Crown } from "lucide-react";

export function LandingLayout() {
  const { user, isPremium, signOut } = useAuth();

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#0a0a0a" }}>
      {/* HEADER — transparent, floats over hero */}
      <header style={{
        position: "absolute",
        top: 21,
        left: 0,
        right: 0,
        zIndex: 50,
        background: "transparent",
        display: "flex",
        alignItems: "center",
        height: 42,
        padding: "0 32px",
      }}>
        {/* LOGO */}
        <Link to="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", marginRight: "auto" }}>
          <img src="/logo.png" alt="Neeko" style={{ height: 68, width: "auto" }} />
        </Link>

        {/* RIGHT BUTTONS */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!user && (
            <Link to="/auth" style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)",
              textDecoration: "none",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(8px)",
              padding: "8px 20px",
              borderRadius: 8,
              letterSpacing: "0.01em",
            }}>
              Login
            </Link>
          )}

          {!isPremium && (
            <Link to="/neeko-plus" style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 800, color: "#1a0e00",
              textDecoration: "none",
              background: "linear-gradient(to bottom, #facc15, #eab308)",
              padding: "8px 20px",
              borderRadius: 8,
              letterSpacing: "0.01em",
              boxShadow: "0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.35)",
            }}>
              <Crown size={13} /> Get Started Free
            </Link>
          )}

          {isPremium && (
            <Link to="/account" style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700, color: "#facc15",
              textDecoration: "none",
              border: "1px solid rgba(250,204,21,0.4)",
              padding: "8px 20px",
              borderRadius: 8,
            }}>
              <Crown size={13} /> My Account
            </Link>
          )}

          {user && (
            <button onClick={signOut} style={{
              fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.45)",
              background: "none", border: "none", cursor: "pointer", padding: "8px 12px",
            }}>
              Logout
            </button>
          )}
        </div>
      </header>

      {/* PAGE CONTENT */}
      <Outlet />
    </div>
  );
}

export default LandingLayout;
