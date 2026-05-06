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

import { Chrome as Home, Star, User, Crown, Users, Share2, CircleHelp as HelpCircle, FileText, Mail, TableProperties } from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";

const STAT_BOARD_SUB_ITEMS = [
  { title: "Player Stats", url: "/stat-board/players", disabled: false },
  { title: "Team Stats",   url: null,                  disabled: true },
  { title: "Match Centre", url: null,                  disabled: true },
] as const;

export function AppSidebar() {
  const { isMobile, state, setOpenMobile, setOpen } = useSidebar();
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

  const mainNav = [
    { title: "Home",        url: "/",           icon: Home,            exact: true },
    { title: "Stat Board",  url: "/stat-board",          icon: TableProperties },
    { title: "Fantasy Hub", url: "/fantasy",    icon: Star },
    { title: "Players",     url: "/sports/afl/players", icon: User },
  ];

  const infoNav = [
    { title: "About Us",   url: "/about",    icon: Users },
    { title: "Socials",    url: "/socials",  icon: Share2 },
    { title: "FAQ",        url: "/faq",      icon: HelpCircle },
    { title: "Policies",   url: "/policies", icon: FileText },
    { title: "Contact Us", url: "/contact",  icon: Mail },
  ];

  return (
    <Sidebar collapsible="offcanvas" className="z-50">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(({ title, url, icon: Icon, exact }) => {
                const active = exact ? currentPath === url : isActive(url);
                const isStatBoard = title === "Stat Board";
                const statBoardSectionActive = isStatBoard && isActive("/stat-board");
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

                    {/* Stat Board contextual sub-items — only when sidebar is expanded and user is in /stat-board */}
                    {isStatBoard && isExpanded && statBoardSectionActive && (
                      <ul className="mt-0.5 mb-1 ml-7 space-y-0.5" role="group" aria-label="Stat Board sections">
                        {STAT_BOARD_SUB_ITEMS.map((sub) => {
                          const subActive = !sub.disabled && sub.url !== null && currentPath === sub.url;
                          if (sub.disabled || sub.url === null) {
                            return (
                              <li key={sub.title}>
                                <span className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-foreground/25 cursor-default select-none">
                                  <span className="h-1 w-1 rounded-full bg-foreground/15 shrink-0" aria-hidden />
                                  {sub.title}
                                  <span className="ml-auto text-[9px] font-semibold text-foreground/20 bg-foreground/8 rounded px-1.5 py-0.5 leading-none tracking-wide uppercase">
                                    Soon
                                  </span>
                                </span>
                              </li>
                            );
                          }
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
                                <span className={`h-1 w-1 rounded-full shrink-0 ${subActive ? "bg-primary" : "bg-foreground/20"}`} aria-hidden />
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
