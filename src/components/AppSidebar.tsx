import { useState, useEffect, useRef } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import {
  Chrome as Home,
  Star,
  User,
  Crown,
  Users,
  Share2,
  CircleHelp as HelpCircle,
  FileText,
  Mail,
  TableProperties,
  Shield,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";
import { STAT_BOARD_CHILDREN, FANTASY_CHILDREN } from "@/components/navConfig";

// ── Nav structure ─────────────────────────────────────────────────────────────

export const EXPANDABLE_GROUPS = [
  {
    key:      "stat-board",
    title:    "Stats Hub",
    url:      "/stat-board",
    icon:     TableProperties,
    children: STAT_BOARD_CHILDREN,
  },
  {
    key:      "fantasy",
    title:    "Fantasy Hub",
    url:      "/fantasy",
    icon:     Star,
    children: FANTASY_CHILDREN,
  },
] as const;

const SIMPLE_NAV = [
  { title: "Home",    url: "/",                   icon: Home,   exact: true },
  { title: "Players", url: "/sports/afl/players", icon: User,   exact: false },
  { title: "Teams",   url: "/sports/afl/teams",   icon: Shield, exact: false },
] as const;

const INFO_NAV = [
  { title: "About Us",   url: "/about",    icon: Users      },
  { title: "Socials",    url: "/socials",  icon: Share2     },
  { title: "FAQ",        url: "/faq",      icon: HelpCircle },
  { title: "Policies",   url: "/policies", icon: FileText   },
  { title: "Contact Us", url: "/contact",  icon: Mail       },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  const { isPremium } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;
  const isExpanded = state === "expanded";

  // Derive the active group key from the current path so the correct
  // group is pre-expanded when the sidebar first opens on that route.
  const activeGroupKey = EXPANDABLE_GROUPS.find(g =>
    currentPath === g.url || currentPath.startsWith(g.url + "/")
  )?.key ?? null;

  // Mobile: which group is currently expanded (null = none).
  // Initialise to the active group so it opens pre-expanded on the current route.
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupKey);

  // Track previous openMobile value to detect sidebar opening.
  const prevOpenMobile = useRef(openMobile);

  // When the mobile sidebar opens, pre-expand the group matching the current route.
  useEffect(() => {
    if (isMobile && openMobile && !prevOpenMobile.current) {
      setOpenGroup(activeGroupKey);
    }
    prevOpenMobile.current = openMobile;
  }, [openMobile, isMobile, activeGroupKey]);

  // When the route changes (e.g. back/forward), sync the active group.
  useEffect(() => {
    if (isMobile) setOpenGroup(activeGroupKey);
  }, [currentPath, isMobile, activeGroupKey]);

  const isActive = (path: string, exact = false) => {
    if (exact) return currentPath === path;
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  const closeSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  // Desktop: expand group when on a child route (route-driven, no state needed).
  // Mobile: expand controlled by openGroup state (tap-driven).
  const groupIsOpen = (key: string, url: string): boolean => {
    if (isMobile) return openGroup === key;
    return isActive(url) && isExpanded;
  };

  // Mobile tap logic: toggle expand/collapse only — never navigate.
  const handleParentClick = (key: string, _url: string) => {
    if (!isMobile) return; // desktop uses NavLink directly
    setOpenGroup(openGroup === key ? null : key);
  };

  return (
    <Sidebar collapsible="offcanvas" className="z-50">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>

              {/* Simple top item: Home */}
              {SIMPLE_NAV.filter(n => n.url === "/").map(({ title, url, icon: Icon, exact }) => {
                const active = isActive(url, exact);
                return (
                  <SidebarMenuItem key={title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={url}
                        end={exact}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                          active ? "bg-muted text-primary" : "text-foreground/70"
                        }`}
                        onClick={closeSidebar}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Expandable groups: Stats Hub, Fantasy Hub */}
              {EXPANDABLE_GROUPS.map(({ key, title, url, icon: Icon, children }) => {
                const parentActive = isActive(url);
                const open = groupIsOpen(key, url);

                return (
                  <SidebarMenuItem key={key}>

                    {/* Parent row */}
                    {isMobile ? (
                      // Mobile: button with expand/navigate double-tap logic
                      <SidebarMenuButton asChild>
                        <button
                          onClick={() => handleParentClick(key, url)}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                            parentActive ? "bg-muted text-primary" : "text-foreground/70"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 text-left">{title}</span>
                          {open
                            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground/40 transition-transform" />
                            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-foreground/30 transition-transform" />
                          }
                        </button>
                      </SidebarMenuButton>
                    ) : (
                      // Desktop: normal NavLink
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={url}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                            parentActive ? "bg-muted text-primary" : "text-foreground/70"
                          }`}
                          onClick={closeSidebar}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{title}</span>
                          {open
                            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground/40" />
                            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-foreground/25" />
                          }
                        </NavLink>
                      </SidebarMenuButton>
                    )}

                    {/* Child links */}
                    {open && (
                      <ul
                        className="mt-0.5 mb-1 ml-7 space-y-0.5"
                        role="group"
                        aria-label={`${title} sections`}
                      >
                        {children.map((child) => {
                          const childActive = currentPath === child.url;
                          return (
                            <li key={child.title}>
                              <NavLink
                                to={child.url}
                                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                                  childActive
                                    ? "bg-muted/60 text-primary"
                                    : "text-foreground/50 hover:bg-muted/40 hover:text-foreground/80"
                                }`}
                                onClick={() => { setOpenGroup(null); closeSidebar(); }}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                    childActive ? "bg-primary" : "bg-foreground/18"
                                  }`}
                                  aria-hidden
                                />
                                {child.title}
                              </NavLink>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </SidebarMenuItem>
                );
              })}

              {/* Simple nav items: Players, Teams */}
              {SIMPLE_NAV.filter(n => n.url !== "/").map(({ title, url, icon: Icon, exact }) => {
                const active = isActive(url, exact);
                return (
                  <SidebarMenuItem key={title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={url}
                        end={exact}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                          active ? "bg-muted text-primary" : "text-foreground/70"
                        }`}
                        onClick={closeSidebar}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {/* Neeko+ CTA */}
              {!isPremium && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/neeko-plus"
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                        isActive("/neeko-plus") ? "bg-muted text-primary" : "text-[#F5C84C]/80"
                      }`}
                      onClick={closeSidebar}
                    >
                      <Crown className="h-4 w-4 shrink-0 text-[#F5C84C]" />
                      <span>Neeko+</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Account */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/account"
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                      isActive("/account") ? "bg-muted text-primary" : "text-foreground/70"
                    }`}
                    onClick={closeSidebar}
                  >
                    <User className="h-4 w-4 shrink-0" />
                    <span>Account</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2" />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {INFO_NAV.map(({ title, url, icon: Icon }) => (
                <SidebarMenuItem key={title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={url}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                        isActive(url) ? "bg-muted text-primary" : "text-foreground/60"
                      }`}
                      onClick={closeSidebar}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>
    </Sidebar>
  );
}
