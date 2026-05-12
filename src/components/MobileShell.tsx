/**
 * MobileShell — single source of truth for the mobile app header + drawer.
 *
 * Renders two things:
 *   1. A fixed sticky double-row header (burger + logo + Neeko+ / product nav row)
 *   2. A slide-in left drawer with expandable nav groups + auth actions
 *
 * Usage:
 *   <MobileShell>{page content}</MobileShell>
 *
 * Only rendered on mobile (< 768px). Desktop callers should hide this via CSS
 * or conditional rendering — Layout.tsx gates it with `lg:hidden`.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Crown, Star, TableProperties, Shield, Users, CircleHelp as HelpCircle, FileText, Mail, LogIn, User, LogOut, ChevronDown, ChevronRight, ChartBar as BarChart2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

// ── Nav structure ─────────────────────────────────────────────────────────────

const EXPANDABLE_GROUPS = [
  {
    key: "stat-board",
    label: "Stats Hub",
    to: "/stat-board",
    icon: TableProperties,
    children: [
      { label: "Player Stats",  to: "/stat-board/players"      },
      { label: "Team Stats",    to: "/stat-board/teams"         },
      { label: "Match Centre",  to: "/stat-board/match-centre"  },
    ],
  },
  {
    key: "fantasy",
    label: "Fantasy Hub",
    to: "/fantasy",
    icon: Star,
    children: [
      { label: "Current Week",  to: "/fantasy/current-week"  },
      { label: "Rankings",      to: "/fantasy/rankings"      },
      { label: "Market Watch",  to: "/fantasy/market-watch"  },
    ],
  },
] as const;

const SIMPLE_NAV = [
  { label: "Players", to: "/sports/afl/players", icon: Users  },
  { label: "Teams",   to: "/sports/afl/teams",   icon: Shield },
] as const;

const INFO_NAV = [
  { label: "About",    to: "/about",    icon: Users      },
  { label: "FAQ",      to: "/faq",      icon: HelpCircle },
  { label: "Policies", to: "/policies", icon: FileText   },
  { label: "Contact",  to: "/contact",  icon: Mail       },
] as const;

const PRODUCT_NAV = [
  { label: "Stats Hub", to: "/stat-board/players", icon: BarChart2 },
  { label: "Fantasy",   to: "/fantasy",            icon: Star      },
  { label: "Players",   to: "/sports/afl/players", icon: Users     },
  { label: "Teams",     to: "/sports/afl/teams",   icon: Shield    },
] as const;

// Shell height constants — used for padding offsets by consumers
export const MOBILE_SHELL_HEIGHT = 102; // 62px header row + 40px product nav row

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPathActive(current: string, target: string, exact = false): boolean {
  if (exact) return current === target;
  return current === target || current.startsWith(target + "/");
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function Drawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, isPremium, signOut, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  // Active group key derived from current route
  const activeGroupKey =
    EXPANDABLE_GROUPS.find(
      (g) => currentPath === g.to || currentPath.startsWith(g.to + "/")
    )?.key ?? null;

  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupKey);

  // Track previous open state to detect open event
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) {
      // Drawer just opened — pre-expand the active group
      setOpenGroup(activeGroupKey);
    }
    prevOpen.current = open;
  }, [open, activeGroupKey]);

  // Sync with route changes (back/forward navigation)
  useEffect(() => {
    setOpenGroup(activeGroupKey);
  }, [currentPath, activeGroupKey]);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function handleParentTap(key: string, to: string) {
    if (openGroup === key) {
      // Second tap — navigate to hub
      navigate(to);
      setOpenGroup(null);
      onClose();
    } else {
      // First tap — expand
      setOpenGroup(key);
    }
  }

  function handleChildTap() {
    setOpenGroup(null);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, width: 280,
          zIndex: 201, background: "#070a0e",
          borderRight: "1px solid rgba(255,255,255,0.09)",
          display: "flex", flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.26s cubic-bezier(0.22,1,0.36,1)",
          willChange: "transform",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Header row */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "4px 12px 4px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          flexShrink: 0,
        }}>
          <Link to="/" onClick={onClose} style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
            <img src="/logo.png" alt="Neeko Sports Stats" style={{ width: 84, height: "auto", objectFit: "contain", display: "block" }} />
          </Link>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 40, height: 40, background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9,
              color: "rgba(255,255,255,0.55)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.12s",
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "14px 10px 12px" }}>

          {/* Expandable groups */}
          {EXPANDABLE_GROUPS.map(({ key, label, to, icon: Icon, children }) => {
            const parentActive = isPathActive(currentPath, to);
            const expanded = openGroup === key;
            return (
              <div key={key} style={{ marginBottom: 2 }}>
                {/* Parent row */}
                <button
                  onClick={() => handleParentTap(key, to)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 13,
                    padding: "12px 12px", borderRadius: 11,
                    background: parentActive && !expanded ? "rgba(255,255,255,0.05)" : "transparent",
                    border: "1px solid transparent",
                    color: parentActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.70)",
                    fontSize: 14.5, fontWeight: 600, cursor: "pointer",
                    textAlign: "left", transition: "background 0.12s",
                    minHeight: 48,
                  }}
                >
                  <Icon size={17} style={{ color: "rgba(255,255,255,0.38)", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {expanded
                    ? <ChevronDown size={14} style={{ color: "rgba(255,255,255,0.35)", flexShrink: 0 }} />
                    : <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                  }
                </button>

                {/* Child rows */}
                {expanded && (
                  <div style={{ marginLeft: 30, marginTop: 2, marginBottom: 4 }}>
                    {children.map(({ label: childLabel, to: childTo }) => {
                      const childActive = currentPath === childTo;
                      return (
                        <Link
                          key={childTo}
                          to={childTo}
                          onClick={handleChildTap}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "9px 10px", borderRadius: 9,
                            textDecoration: "none", marginBottom: 1,
                            color: childActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.52)",
                            fontSize: 13.5, fontWeight: childActive ? 700 : 500,
                            background: childActive ? "rgba(255,255,255,0.07)" : "transparent",
                            transition: "background 0.10s",
                            minHeight: 40,
                          }}
                        >
                          <span
                            style={{
                              width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                              background: childActive ? "#4ade80" : "rgba(255,255,255,0.18)",
                            }}
                          />
                          {childLabel}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Simple nav items */}
          {SIMPLE_NAV.map(({ label, to, icon: Icon }) => {
            const active = isPathActive(currentPath, to);
            return (
              <Link
                key={to}
                to={to}
                onClick={handleChildTap}
                style={{
                  display: "flex", alignItems: "center", gap: 13,
                  padding: "12px 12px", borderRadius: 11, marginBottom: 2,
                  textDecoration: "none",
                  color: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.70)",
                  fontSize: 14.5, fontWeight: 600,
                  background: active ? "rgba(255,255,255,0.05)" : "transparent",
                  border: "1px solid transparent",
                  transition: "background 0.12s", minHeight: 48,
                }}
              >
                <Icon size={17} style={{ color: "rgba(255,255,255,0.38)", flexShrink: 0 }} />
                {label}
              </Link>
            );
          })}

          {/* Neeko+ CTA */}
          {!isPremium && (
            <Link
              to="/neeko-plus"
              onClick={handleChildTap}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "12px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none",
                color: "#E0AE2D", fontSize: 14.5, fontWeight: 800,
                background: "rgba(224,174,45,0.07)",
                border: "1px solid rgba(224,174,45,0.18)",
                transition: "background 0.12s", minHeight: 48,
              }}
            >
              <Crown size={17} style={{ color: "#E0AE2D", flexShrink: 0 }} />
              <span style={{ flex: 1 }}>Neeko+</span>
              <span style={{
                fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase",
                color: "#E0AE2D", background: "rgba(224,174,45,0.12)",
                border: "1px solid rgba(224,174,45,0.24)",
                padding: "2px 7px", borderRadius: 999,
              }}>
                Upgrade
              </span>
            </Link>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "14px 4px" }} />

          {/* Info nav */}
          <p style={{
            fontSize: 9, fontWeight: 900, letterSpacing: "0.30em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            margin: "0 0 8px 10px",
          }}>
            Info
          </p>
          {INFO_NAV.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={handleChildTap}
              style={{
                display: "flex", alignItems: "center", gap: 13,
                padding: "11px 12px", borderRadius: 11, marginBottom: 2,
                textDecoration: "none", color: "rgba(255,255,255,0.50)",
                fontSize: 13.5, fontWeight: 500, minHeight: 44,
                transition: "background 0.12s",
              }}
            >
              <Icon size={15} style={{ color: "rgba(255,255,255,0.28)", flexShrink: 0 }} />
              {label}
            </Link>
          ))}
        </nav>

        {/* Auth section */}
        <div style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {authLoading && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "13px 16px", borderRadius: 11,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              color: "rgba(255,255,255,0.28)", fontSize: 12.5, fontWeight: 500, minHeight: 48,
            }}>
              Checking session…
            </div>
          )}
          {!authLoading && !user && (
            <Link
              to="/auth"
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 16px", borderRadius: 11,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.60)", fontSize: 13.5, fontWeight: 600,
                textDecoration: "none", minHeight: 48,
              }}
            >
              <LogIn size={15} /> Sign In
            </Link>
          )}
          {!authLoading && user && (
            <>
              <Link
                to="/account"
                onClick={onClose}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "13px 16px", borderRadius: 11,
                  background: isPremium ? "rgba(224,174,45,0.08)" : "rgba(255,255,255,0.05)",
                  border: isPremium ? "1px solid rgba(224,174,45,0.22)" : "1px solid rgba(255,255,255,0.10)",
                  color: isPremium ? "#E0AE2D" : "rgba(255,255,255,0.75)",
                  fontSize: 13.5, fontWeight: 600, textDecoration: "none", minHeight: 48,
                }}
              >
                {isPremium ? <Crown size={14} /> : <User size={14} />}
                Account
              </Link>
              <button
                onClick={() => { signOut(); onClose(); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "11px 16px", borderRadius: 11, background: "none",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(255,255,255,0.32)", fontSize: 12.5, fontWeight: 500,
                  cursor: "pointer", minHeight: 44, width: "100%",
                }}
              >
                <LogOut size={13} /> Sign Out
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Mobile header row ─────────────────────────────────────────────────────────

function HeaderRow({
  onMenuOpen,
  isPremium,
  currentPath,
}: {
  onMenuOpen: () => void;
  isPremium: boolean;
  currentPath: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "0 14px 0 12px", height: 62, gap: 12,
    }}>
      {/* Burger */}
      <button
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
        style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10, color: "rgba(255,255,255,0.80)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, width: 42, height: 42,
        }}
      >
        <Menu size={20} />
      </button>

      {/* Logo centred */}
      <Link
        to="/"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          textDecoration: "none", flex: 1, minWidth: 0, paddingLeft: 8,
        }}
      >
        <img
          src="/logo.png"
          alt="Neeko Sports Stats"
          style={{ width: 100, maxWidth: "100%", height: "auto", objectFit: "contain", display: "block" }}
        />
      </Link>

      {/* Neeko+ / Plus badge */}
      {!isPremium && currentPath !== "/neeko-plus" && (
        <Link
          to="/neeko-plus"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 14px", height: 40, borderRadius: 10,
            background: "linear-gradient(160deg,#fad52a 0%,#e09600 100%)",
            color: "#130c00", fontSize: 13, fontWeight: 900,
            textDecoration: "none", letterSpacing: "0.01em", flexShrink: 0,
            boxShadow: "0 2px 10px rgba(224,174,45,0.22)",
          }}
        >
          <Crown size={14} /> Neeko+
        </Link>
      )}
      {isPremium && (
        <Link
          to="/account"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 12px", height: 38, borderRadius: 10,
            background: "rgba(224,174,45,0.10)",
            border: "1px solid rgba(224,174,45,0.28)",
            color: "#E0AE2D", fontSize: 12, fontWeight: 800, flexShrink: 0,
            textDecoration: "none",
          }}
        >
          <Crown size={13} /> Plus
        </Link>
      )}
    </div>
  );
}

// ── Product nav row ───────────────────────────────────────────────────────────

function ProductNavRow({ currentPath }: { currentPath: string }) {
  return (
    <div style={{
      borderTop: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center",
      padding: "0 4px",
    }}>
      {PRODUCT_NAV.map(({ label, to, icon: Icon }) => {
        const active = isPathActive(currentPath, to);
        return (
          <Link
            key={to}
            to={to}
            style={{
              flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              height: 40,
              fontSize: 11.5, fontWeight: active ? 700 : 500,
              color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.52)",
              textDecoration: "none", whiteSpace: "nowrap",
              borderRadius: 6,
              borderBottom: active ? "2px solid rgba(74,222,128,0.65)" : "2px solid transparent",
              transition: "color 0.12s, border-color 0.12s",
              minWidth: 0,
            }}
          >
            <Icon size={12} style={{ flexShrink: 0, opacity: active ? 0.85 : 0.55 }} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

// ── MobileShell ───────────────────────────────────────────────────────────────

/**
 * Wrap page content with this on mobile. Renders the sticky double-row header
 * and the slide-in drawer. Content receives top padding equal to the header height.
 *
 * The outer div is display:contents so it doesn't affect layout.
 */
export function MobileShell({ children }: { children?: React.ReactNode }) {
  const { isPremium } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Fixed sticky header */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: "rgba(7,10,14,0.92)",
        backdropFilter: "blur(20px) saturate(1.4)",
        WebkitBackdropFilter: "blur(20px) saturate(1.4)",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 1px 0 0 rgba(255,255,255,0.04), 0 4px 24px 0 rgba(0,0,0,0.55)",
      }}>
        <HeaderRow
          onMenuOpen={() => setDrawerOpen(true)}
          isPremium={isPremium}
          currentPath={currentPath}
        />
        <ProductNavRow currentPath={currentPath} />
      </div>

      {/* Drawer */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Content with header offset */}
      {children}
    </>
  );
}

/**
 * Standalone hook — returns the shell height so page content can set
 * its own top padding when MobileShell is used without wrapping children.
 */
export { MOBILE_SHELL_HEIGHT as mobileShellHeight };
