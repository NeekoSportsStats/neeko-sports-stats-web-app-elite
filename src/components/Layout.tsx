import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Crown, LogOut } from "lucide-react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function Layout() {
  const { user, isPremium, signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full bg-background">
        <AppSidebar />

        <div className="w-full flex flex-col">
          {/* HEADER */}
          <header className="fixed top-0 left-0 right-0 z-40 w-full border-b border-transparent bg-background/80 backdrop-blur-sm">
            <div className="container flex h-14 items-center px-4">
              <SidebarTrigger className="mr-2 lg:mr-4" />

              {/* LOGO */}
              <div className="flex items-center mr-auto">
                <Link to="/" className="flex items-center hover:opacity-80 transition">
                  <img
                    src="/logo.png"
                    alt="Neeko Sports Logo"
                    className="h-[6rem] w-auto -my-3"
                  />
                </Link>
              </div>

              {/* RIGHT BUTTONS */}
              <div className="flex items-center gap-1.5 lg:gap-2">
                {isPremium && (
                  <Link to="/account">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Crown className="h-4 w-4 text-primary" />
                    </Button>
                  </Link>
                )}

                {!isPremium && (
                  <Link to="/neeko-plus">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Crown className="h-4 w-4" />
                      <span className="hidden sm:inline">Neeko+</span>
                    </Button>
                  </Link>
                )}

                {user && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={signOut}
                    className="gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </Button>
                )}

                {!user && (
                  <Link to="/auth">
                    <Button variant="default" size="sm">
                      Sign In
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </header>

          {/* BODY */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default Layout;
