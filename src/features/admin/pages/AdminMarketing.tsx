import { lazy, Suspense, useState } from "react";
import { RefreshCw, Zap, MessageSquare } from "lucide-react";

const AdminContentEngine = lazy(() => import("@/features/admin/marketing/AdminContentEngine"));
const RedditEngine       = lazy(() => import("@/features/admin/marketing/RedditEngine"));

type Tab = "engine" | "reddit";

const TABS: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  {
    id: "engine",
    label: "Content Engine",
    icon: Zap,
    description: "AI-generated 7-day content plan — 21 complete posts with scripts, hooks, and visual directions",
  },
  {
    id: "reddit",
    label: "Reddit",
    icon: MessageSquare,
    description: "Generate posts and replies for Reddit engagement",
  },
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function AdminMarketing() {
  const [tab, setTab] = useState<Tab>("engine");
  const activeTab = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Marketing</h1>
      </div>

      <div className="flex gap-1 overflow-x-auto mb-1 pb-0.5" style={{ scrollbarWidth: "none" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium whitespace-nowrap rounded-md transition-colors ${
              tab === id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mb-6 px-1">{activeTab.description}</p>

      <Suspense fallback={<TabFallback />}>
        {tab === "engine" && <AdminContentEngine />}
        {tab === "reddit" && <RedditEngine />}
      </Suspense>
    </div>
  );
}
