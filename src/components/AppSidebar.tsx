import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

import { Home, Trophy, Crown, Users, Share2, ChevronDown, User, Mail, CircleHelp as HelpCircle, FileText, X, TrendingUp } from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { open: sidebarOpen, isMobile, setOpenMobile, setOpen } = useSidebar();
  const { user, isPremium } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname;

  const [sportsOpen, setSportsOpen] = useState(
    currentPath.startsWith("/sports")
  );

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    } else {
      setOpen(false);
    }
  };

  const isActive = (path: string) => {
    if (path === "/") return currentPath === "/";
    return currentPath.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon" className="z-50">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {/* HOME */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="py-1.5">
                  <NavLink
                    to="/"
                    end
                    className="hover:bg-muted/50"
                    activeClassName="bg-muted text-primary font-medium"
                    onClick={handleLinkClick}
                  >
                    <Home className="h-4 w-4" />
                    <span>Home</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* SPORTS GROUP */}
              <Collapsible open={sportsOpen} onOpenChange={setSportsOpen}>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={`py-1.5 hover:bg-muted/50 ${
                        isActive("/sports")
                          ? "bg-muted text-primary font-medium"
                          : ""
                      }`}
                    >
                      <Trophy className="h-4 w-4" />
                      <span>Sports</span>

                      <ChevronDown
                        className={`ml-auto h-4 w-4 transition-transform ${
                          sportsOpen ? "rotate-180" : ""
                        }`}
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {/* AFL */}
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="py-0.5">
                          <NavLink
                            to="/sports/afl"
                            className="hover:bg-muted/50 pl-6 font-semibold text-xs"
                            activeClassName="bg-muted text-primary font-medium"
                            onClick={handleLinkClick}
                          >
                            AFL
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      {[
                        { title: "Rankings", url: "/sports/afl/rankings" },
                      ].map((item) => (
                        <SidebarMenuSubItem key={item.title}>
                          <SidebarMenuSubButton asChild className="py-0.5">
                            <NavLink
                              to={item.url}
                              className="hover:bg-muted/50 pl-8 text-xs"
                              activeClassName="bg-muted text-primary font-medium"
                              onClick={handleLinkClick}
                            >
                              {item.title}
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}

                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="py-0.5">
                          <NavLink
                            to="/sports/afl/edge-board"
                            className="hover:bg-muted/50 pl-8 text-xs"
                            activeClassName="bg-muted text-primary font-medium"
                            onClick={handleLinkClick}
                          >
                            Edge Board
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="py-0.5">
                          <NavLink
                            to="/sports/afl/start-sit"
                            className="hover:bg-muted/50 pl-8 text-xs"
                            activeClassName="bg-muted text-primary font-medium"
                            onClick={handleLinkClick}
                          >
                            Start / Sit
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>

                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton asChild className="py-0.5">
                          <NavLink
                            to="/sports/afl/market-watch"
                            className="hover:bg-muted/50 pl-8 text-xs"
                            activeClassName="bg-muted text-primary font-medium"
                            onClick={handleLinkClick}
                          >
                            Market Watch
                          </NavLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>

              {/* CORE — CONDITIONAL Neeko+ */}
              {!isPremium && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="py-1.5">
                    <NavLink
                      to="/neeko-plus"
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                      onClick={handleLinkClick}
                    >
                      <Crown className="h-4 w-4" />
                      <span>Neeko+</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* ACCOUNT */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="py-1.5">
                  <NavLink
                    to="/account"
                    className="hover:bg-muted/50"
                    activeClassName="bg-muted text-primary font-medium"
                    onClick={handleLinkClick}
                  >
                    <User className="h-4 w-4" />
                    <span>Account</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="my-2" />

        {/* INFO SECTION */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                { title: "About Us", url: "/about", icon: Users },
                { title: "Socials", url: "/socials", icon: Share2 },
                { title: "FAQ", url: "/faq", icon: HelpCircle },
                { title: "Policies", url: "/policies", icon: FileText },
                { title: "Contact Us", url: "/contact", icon: Mail },
              ].map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="py-1.5">
                    <NavLink
                      to={item.url}
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                      onClick={handleLinkClick}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
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