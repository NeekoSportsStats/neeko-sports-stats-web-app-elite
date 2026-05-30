import type { ElementType } from "react";
import { LayoutDashboard, HeartPulse, Users, Terminal, Lightbulb, FlaskConical, Settings2, Fingerprint, ChartBar as BarChart2 } from "lucide-react";

export interface AdminSection {
  path: string;
  label: string;
  icon: ElementType;
}

// Main Operator Console navigation — Marketing is intentionally hidden from
// the nav bar (accessible via /admin/marketing directly for admins).
export const ADMIN_SECTIONS: AdminSection[] = [
  { path: "/admin/dashboard",            label: "Dashboard",          icon: LayoutDashboard },
  { path: "/admin/health",               label: "Health",             icon: HeartPulse },
  { path: "/admin/users",                label: "Users & Billing",    icon: Users },
  { path: "/admin/command",              label: "Command Center",     icon: Terminal },
  { path: "/admin/content-intel",        label: "Content Intel",      icon: Lightbulb },
  { path: "/admin/marketing-insights",   label: "Marketing Analytics", icon: BarChart2 },
  { path: "/admin/player-lab",            label: "Player Lab",         icon: FlaskConical },
  { path: "/admin/player-identity",       label: "Player Identity",    icon: Fingerprint },
  { path: "/admin/internal-ops",         label: "Internal Ops",       icon: Settings2 },
];

export const ADMIN_DEFAULT_PATH = "/admin/dashboard";
