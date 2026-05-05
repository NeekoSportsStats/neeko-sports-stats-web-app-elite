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

import { Chrome as Home, Trophy, TrendingUp, Star, ChartBar as BarChart2, User, Crown, Users, Share2, CircleHelp as HelpCircle, FileText, Mail, TableProperties } from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";

export function AppSidebar() {
  const { isMobile, setOpenMobile, setOpen } = useSidebar();
  const { isPremium } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;

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
    { title: "Home",         url: "/",                          icon: Home,      exact: true },
    { title: "Current Week", url: "/sports/afl/current-round",  icon: Trophy },
    { title: "Market Watch", url: "/sports/afl/market-watch",   icon: TrendingUp },
    { title: "Captains",     url: "/sports/afl/captains",       icon: Star },
    { title: "Rankings",     url: "/sports/afl/rankings",       icon: BarChart2 },
    { title: "Players",      url: "/sports/afl/players",        icon: User },
    { title: "Stat Board",   url: "/stat-board",                icon: TableProperties },
  ];

  const infoNav = [
    { title: "About Us",   url: "/about",    icon: Users },
    { title: "Socials",    url: "/socials",  icon: Share2 },
    { title: "FAQ",        url: "/faq",      icon: HelpCircle },
    { title: "Policies",   url: "/policies", icon: FileText },
    { title: "Contact Us", url: "/contact",  icon: Mail },
  ];

  return (
    <Sidebar collapsible="icon" className="z-50">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map(({ title, url, icon: Icon, exact }) => {
                const active = exact ? currentPath === url : isActive(url);
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
