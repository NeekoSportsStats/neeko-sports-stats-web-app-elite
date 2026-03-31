import {
  LayoutDashboard,
  HeartPulse,
  Users,
  Terminal,
  FlaskConical,
  Megaphone,
  ShieldCheck,
} from "lucide-react";

export interface AdminSection {
  path: string;
  label: string;
  icon: React.ElementType;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { path: "/admin/dashboard",       label: "Dashboard",       icon: LayoutDashboard },
  { path: "/admin/health",          label: "Health",          icon: HeartPulse },
  { path: "/admin/users",           label: "User Metrics",    icon: Users },
  { path: "/admin/command",         label: "Command Center",  icon: Terminal },
  { path: "/admin/player-lab",      label: "Player Lab",      icon: FlaskConical },
  { path: "/admin/marketing",       label: "Marketing",       icon: Megaphone },
  { path: "/admin/admin",           label: "Admin",           icon: ShieldCheck },
];

export const ADMIN_DEFAULT_PATH = "/admin/dashboard";
