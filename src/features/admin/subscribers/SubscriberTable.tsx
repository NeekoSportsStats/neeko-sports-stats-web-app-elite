import { useState, useCallback, useEffect } from "react";
import { RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchAdminDashboardData } from "@/lib/adminApi";

interface SubscriberRow {
  id: string;
  email: string | null;
  subscription_status: string | null;
  is_active: boolean;
  is_canceled: boolean;
  is_manual_premium: boolean;
  billing_period_end: string | null;
  premium_expires_at: string | null;
  manual_premium_expires_at: string | null;
  created_at: string | null;
}

type FilterType = "all" | "active" | "cancelled" | "expired";

function bestExpiry(row: SubscriberRow): string {
  const candidates = [row.billing_period_end, row.premium_expires_at, row.manual_premium_expires_at]
    .filter(Boolean)
    .map((d) => new Date(d!).getTime())
    .filter((t) => !isNaN(t));
  if (!candidates.length) return "—";
  return new Date(Math.max(...candidates)).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StripeStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="secondary" className="text-xs">—</Badge>;
  if (status === "active" || status === "trialing")
    return <Badge className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">{status}</Badge>;
  if (status === "canceled" || status === "cancelled")
    return <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300">{status}</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

function AccessBadge({ active }: { active: boolean }) {
  if (active)
    return <Badge className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">active</Badge>;
  return <Badge className="text-xs bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300">expired</Badge>;
}

const FILTERS: { id: FilterType; label: string }[] = [
  { id: "all",       label: "All" },
  { id: "active",    label: "Active" },
  { id: "cancelled", label: "Cancelled" },
  { id: "expired",   label: "Expired" },
];

export function SubscriberTable() {
  const [rows, setRows] = useState<SubscriberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData("subscribers");
      if (Array.isArray(data.subscribers)) {
        setRows(data.subscribers as SubscriberRow[]);
      }
    } catch { } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((row) => {
    if (filter === "active") return row.is_active;
    if (filter === "expired") return !row.is_active;
    if (filter === "cancelled") return row.is_canceled;
    return true;
  });

  const activeCount = rows.filter((r) => r.is_active).length;
  const cancelledCount = rows.filter((r) => r.is_canceled).length;
  const expiredCount = rows.filter((r) => !r.is_active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {activeCount} active · {cancelledCount} cancelled · {expiredCount} expired
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border pb-2">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
              filter === id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} {filtered.length === 1 ? "user" : "users"}
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading subscribers...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No users match this filter.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Stripe Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Access</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Cancelled</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground max-w-[240px] truncate">
                    {row.email ?? <span className="text-muted-foreground italic">no email</span>}
                    {row.is_manual_premium && (
                      <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">MANUAL</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StripeStatusBadge status={row.subscription_status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <AccessBadge active={row.is_active} />
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {row.is_canceled
                      ? <span className="text-amber-600 dark:text-amber-400 font-medium">Yes</span>
                      : <span className="text-muted-foreground">No</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {bestExpiry(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
