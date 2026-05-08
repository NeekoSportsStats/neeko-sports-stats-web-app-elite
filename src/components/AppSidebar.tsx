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

import { Chrome as Home, Star, User, Crown, Users, Share2, CircleHelp as HelpCircle, FileText, Mail, TableProperties, Shield } from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";

const STAT_BOARD_SUB_ITEMS = [
  { title: "Player Stats", url: "/stat-board/players"      },
  { title: "Team Stats",   url: "/stat-board/teams"        },
  { title: "Match Centre", url: "/stat-board/match-centre" },
] as const;

const FANTASY_SUB_ITEMS = [
  { title: "Current Week", url: "/fantasy/current-week" },
  { title: "Rankings",     url: "/fantasy/rankings"     },
  { title: "Market Watch", url: "/fantasy/market-watch" },
] as const;

export function AppSidebar() {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const { isPremium } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;
  const isExpanded = state === "expanded";

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isActive = (path: string) => {
    if (path === "/") return currentPath === "/";
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  // Show Stat Board sub-items whenever the user is anywhere under /stat-board
  // (including the hub page itself) and the sidebar is visible.
  const showStatBoardSubs = isActive("/stat-board") && (isExpanded || isMobile);
  const showFantasySubs   = isActive("/fantasy")    && (isExpanded || isMobile);

  const mainNav = [
    { title: "Home",        url: "/",                    icon: Home,           exact: true },
    { title: "Stat Board",  url: "/stat-board",          icon: TableProperties             },
    { title: "Fantasy Hub", url: "/fantasy",             icon: Star                        },
    { title: "Players",     url: "/sports/afl/players",  icon: User                        },
    { title: "Teams",       url: "/sports/afl/teams",    icon: Shield                      },
  ];

  const infoNav = [
    { title: "About Us",   url: "/about",    icon: Users      },
    { title: "Socials",    url: "/socials",  icon: Share2     },
    { title: "FAQ",        url: "/faq",      icon: HelpCircle },
    { title: "Policies",   url: "/policies", icon: FileText   },
    { title: "Contact Us", url: "/contact",  icon: Mail       },
  ];

  return (
    <Sidebar collapsible="offcanvas" className="z-50">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(({ title, url, icon: Icon, exact }) => {
                const active = exact ? currentPath === url : isActive(url);
                const isStatBoard  = title === "Stat Board";
                const isFantasyHub = title === "Fantasy Hub";
                return (
                  <SidebarMenuItem key={title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={url}
                        end={exact}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                          active ? "bg-muted text-primary" : "text-foreground/70"
                        }`}
                        onClick={handleLinkClick}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{title}</span>
                      </NavLink>
                    </SidebarMenuButton>

                    {/* Stat Board sub-items — shown on any /stat-board/* route */}
                    {isStatBoard && showStatBoardSubs && (
                      <ul className="mt-0.5 mb-1 ml-7 space-y-0.5" role="group" aria-label="Stat Board sections">
                        {STAT_BOARD_SUB_ITEMS.map((sub) => {
                          const subActive = currentPath === sub.url;
                          return (
                            <li key={sub.title}>
                              <NavLink
                                to={sub.url}
                                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted/40 ${
                                  subActive
                                    ? "bg-muted/60 text-primary"
                                    : "text-foreground/50 hover:text-foreground/80"
                                }`}
                                onClick={handleLinkClick}
                              >
                                <span
                                  className={`h-1 w-1 rounded-full shrink-0 ${subActive ? "bg-primary" : "bg-foreground/20"}`}
                                  aria-hidden
                                />
                                {sub.title}
                              </NavLink>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* Fantasy Hub sub-items — shown on any /fantasy/* route */}
                    {isFantasyHub && showFantasySubs && (
                      <ul className="mt-0.5 mb-1 ml-7 space-y-0.5" role="group" aria-label="Fantasy Hub sections">
                        {FANTASY_SUB_ITEMS.map((sub) => {
                          const subActive = currentPath === sub.url;
                          return (
                            <li key={sub.title}>
                              <NavLink
                                to={sub.url}
                                className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted/40 ${
                                  subActive
                                    ? "bg-muted/60 text-primary"
                                    : "text-foreground/50 hover:text-foreground/80"
                                }`}
                                onClick={handleLinkClick}
                              >
                                <span
                                  className={`h-1 w-1 rounded-full shrink-0 ${subActive ? "bg-primary" : "bg-foreground/20"}`}
                                  aria-hidden
                                />
                                {sub.title}
                              </NavLink>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </SidebarMenuItem>
                );
              })}

              {!isPremium && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/neeko-plus"
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                        isActive("/neeko-plus") ? "bg-muted text-primary" : "text-[#F5C84C]/80"
                      }`}
                      onClick={handleLinkClick}
                    >
                      <Crown className="h-4 w-4 shrink-0 text-[#F5C84C]" />
                      <span>Neeko+</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/account"
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                      isActive("/account") ? "bg-muted text-primary" : "text-foreground/70"
                    }`}
                    onClick={handleLinkClick}
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
              {infoNav.map(({ title, url, icon: Icon }) => (
                <SidebarMenuItem key={title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={url}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50 ${
                        isActive(url) ? "bg-muted text-primary" : "text-foreground/60"
                      }`}
                      onClick={handleLinkClick}
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
