import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  TableProperties,
  Star,
  Users,
  Shield,
  Crown,
  User,
  Share2,
  CircleHelp,
  FileText,
  Mail,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

// ── Width token — update one place if sidebar width changes ──────────────────
export const DESKTOP_SIDEBAR_WIDTH = 220;

// ── Nav structure ─────────────────────────────────────────────────────────────

const EXPANDABLE_GROUPS = [
  {
    key: "stat-board",
    title: "Stat Board",
    url: "/stat-board",
    icon: TableProperties,
    children: [
      { title: "Player Stats",  url: "/stat-board/players"      },
      { title: "Team Stats",    url: "/stat-board/teams"        },
      { title: "Match Centre",  url: "/stat-board/match-centre" },
    ],
  },
  {
    key: "fantasy",
    title: "Fantasy Hub",
    url: "/fantasy",
    icon: Star,
    children: [
      { title: "Current Week", url: "/fantasy/current-week" },
      { title: "Rankings",     url: "/fantasy/rankings"     },
      { title: "Market Watch", url: "/fantasy/market-watch" },
    ],
  },
] as const;

const MAIN_NAV = [
  { title: "Players", url: "/sports/afl/players", icon: Users  },
  { title: "Teams",   url: "/sports/afl/teams",   icon: Shield },
] as const;

const INFO_NAV = [
  { title: "About",    url: "/about",    icon: Users       },
  { title: "Socials",  url: "/socials",  icon: Share2      },
  { title: "FAQ",      url: "/faq",      icon: CircleHelp  },
  { title: "Policies", url: "/policies", icon: FileText    },
  { title: "Contact",  url: "/contact",  icon: Mail        },
] as const;

// ── Shared item style helpers ─────────────────────────────────────────────────

function itemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: "7px 10px",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    color: active ? "#fff" : "rgba(255,255,255,0.55)",
    background: active ? "rgba(255,255,255,0.07)" : "transparent",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    transition: "background 0.12s, color 0.12s",
    boxSizing: "border-box",
    textAlign: "left",
    whiteSpace: "nowrap",
  };
}

function hoverOn(el: HTMLElement, active: boolean) {
  if (!active) {
    el.style.color = "rgba(255,255,255,0.88)";
    el.style.background = "rgba(255,255,255,0.05)";
  }
}
function hoverOff(el: HTMLElement, active: boolean) {
  if (!active) {
    el.style.color = "rgba(255,255,255,0.55)";
    el.style.background = "transparent";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DesktopSidebar() {
  const location = useLocation();
  const { isPremium } = useAuth();
  const path = location.pathname;

  const isActive = (url: string, exact = false) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  // Which expandable group is open — initialise from current route
  const initialOpen = EXPANDABLE_GROUPS.find(g => isActive(g.url))?.key ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(initialOpen);

  const toggleGroup = (key: string) =>
    setOpenGroup(prev => (prev === key ? null : key));

  return (
    <aside
      style={{
        position: "fixed",
        top: 60, // below the 60px DesktopHeader
        left: 0,
        bottom: 0,
        width: DESKTOP_SIDEBAR_WIDTH,
        background: "rgba(8,10,14,0.95)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        flexDirection: "column",
        zIndex: 39, // below header (z-100) but above page content
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <nav style={{ padding: "10px 8px 8px", flex: 1 }}>

        {/* ── Expandable groups ─────────────────────────────────────────── */}
        {EXPANDABLE_GROUPS.map(({ key, title, url, icon: Icon, children }) => {
          const parentActive = isActive(url);
          const open = openGroup === key;

          return (
            <div key={key} style={{ marginBottom: 2 }}>
              {/* Parent — button, does NOT navigate */}
              <button
                onClick={() => toggleGroup(key)}
                style={itemStyle(parentActive)}
                onMouseEnter={e => hoverOn(e.currentTarget as HTMLElement, parentActive)}
                onMouseLeave={e => hoverOff(e.currentTarget as HTMLElement, parentActive)}
              >
                <Icon size={15} style={{ opacity: 0.75, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{title}</span>
                {open
                  ? <ChevronDown size={13} style={{ opacity: 0.4, flexShrink: 0 }} />
                  : <ChevronRight size={13} style={{ opacity: 0.3, flexShrink: 0 }} />
                }
              </button>

              {/* Children */}
              {open && (
                <div style={{ paddingLeft: 28, marginTop: 2, marginBottom: 4 }}>
                  {children.map(child => {
                    const childActive = path === child.url;
                    return (
                      <Link
                        key={child.url}
                        to={child.url}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: 6,
                          fontSize: 12.5,
                          fontWeight: childActive ? 600 : 400,
                          color: childActive ? "#fff" : "rgba(255,255,255,0.45)",
                          background: childActive ? "rgba(255,255,255,0.06)" : "transparent",
                          textDecoration: "none",
                          transition: "background 0.12s, color 0.12s",
                          marginBottom: 1,
                        }}
                        onMouseEnter={e => {
                          if (!childActive) {
                            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.80)";
                            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                          }
                        }}
                        onMouseLeave={e => {
                          if (!childActive) {
                            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
                            (e.currentTarget as HTMLElement).style.background = "transparent";
                          }
                        }}
                      >
                        <span
                          style={{
                            width: 5, height: 5,
                            borderRadius: "50%",
                            background: childActive ? "rgba(74,222,128,0.8)" : "rgba(255,255,255,0.18)",
                            flexShrink: 0,
                          }}
                        />
                        {child.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ── Main nav (Players, Teams) ──────────────────────────────────── */}
        {MAIN_NAV.map(({ title, url, icon: Icon }) => {
          const active = isActive(url);
          return (
            <Link
              key={url}
              to={url}
              style={{ ...itemStyle(active), marginBottom: 2 }}
              onMouseEnter={e => hoverOn(e.currentTarget as HTMLElement, active)}
              onMouseLeave={e => hoverOff(e.currentTarget as HTMLElement, active)}
            >
              <Icon size={15} style={{ opacity: 0.75, flexShrink: 0 }} />
              {title}
            </Link>
          );
        })}

        {/* ── Neeko+ CTA ────────────────────────────────────────────────── */}
        {!isPremium && (
          <Link
            to="/neeko-plus"
            style={{
              ...itemStyle(isActive("/neeko-plus")),
              color: isActive("/neeko-plus") ? "#facc15" : "rgba(250,204,21,0.70)",
              marginBottom: 2,
              marginTop: 4,
            }}
            onMouseEnter={e => {
              if (!isActive("/neeko-plus")) {
                (e.currentTarget as HTMLElement).style.color = "#facc15";
                (e.currentTarget as HTMLElement).style.background = "rgba(250,204,21,0.07)";
              }
            }}
            onMouseLeave={e => {
              if (!isActive("/neeko-plus")) {
                (e.currentTarget as HTMLElement).style.color = "rgba(250,204,21,0.70)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }
            }}
          >
            <Crown size={15} style={{ opacity: 0.85, flexShrink: 0, color: "#facc15" }} />
            Neeko+
          </Link>
        )}

        {/* ── Account ───────────────────────────────────────────────────── */}
        {(() => {
          const active = isActive("/account");
          return (
            <Link
              to="/account"
              style={{ ...itemStyle(active), marginBottom: 2 }}
              onMouseEnter={e => hoverOn(e.currentTarget as HTMLElement, active)}
              onMouseLeave={e => hoverOff(e.currentTarget as HTMLElement, active)}
            >
              <User size={15} style={{ opacity: 0.75, flexShrink: 0 }} />
              Account
            </Link>
          );
        })()}

        {/* ── Divider ───────────────────────────────────────────────────── */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "10px 4px 8px" }} />

        {/* ── Info nav ──────────────────────────────────────────────────── */}
        {INFO_NAV.map(({ title, url, icon: Icon }) => {
          const active = isActive(url);
          return (
            <Link
              key={url}
              to={url}
              style={{
                ...itemStyle(active),
                fontSize: 12,
                color: active ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.35)",
                marginBottom: 1,
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.70)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.35)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              <Icon size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
              {title}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default DesktopSidebar;
