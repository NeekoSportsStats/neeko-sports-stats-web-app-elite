import { lazy, Suspense, useState } from "react";
import { RefreshCw, ListTodo, ClipboardList, BookOpen, ScrollText, CalendarOff, Settings2 } from "lucide-react";
import { AdminSectionIntro } from "@/features/admin/shared/AdminExplain";
import { AdminPageHeader } from "@/features/admin/shared/AdminPageHeader";

const AdminTodoPage      = lazy(() => import("@/features/admin/pages/AdminTodo"));
const AdminTasksPage     = lazy(() => import("@/features/admin/pages/AdminFounderTasks"));
const DataPipelinePage   = lazy(() => import("@/features/admin/DataPipelineStatusPage"));
const AdminByeManager    = lazy(() => import("@/features/admin/pages/AdminByeManager"));

type Tab = "tasks" | "todo" | "pipeline-history" | "logs" | "byes";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "tasks",            label: "Founder Tasks",     icon: ClipboardList },
  { id: "pipeline-history", label: "Pipeline History",  icon: ScrollText },
  { id: "byes",             label: "Bye Manager",       icon: CalendarOff },
  { id: "logs",             label: "Local Notes",       icon: BookOpen },
];

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function InternalNotesTab() {
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem("neeko_admin_notes") ?? ""; } catch { return ""; }
  });

  function handleChange(val: string) {
    setNotes(val);
    try { localStorage.setItem("neeko_admin_notes", val); } catch {}
  }

  return (
    <div>
      <AdminSectionIntro
        description="Local notes (browser only) — stored in this device's localStorage, not the database. Clears if browser data is reset. Do not store credentials."
      />
      <textarea
        className="w-full h-96 rounded-lg border border-border bg-muted/10 p-4 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        placeholder="Operator notes… (stored locally in this browser only)"
        value={notes}
        onChange={e => handleChange(e.target.value)}
      />
      <p className="text-[11px] text-muted-foreground mt-2">
        Stored in localStorage — clears on browser data reset. Do not store sensitive credentials here.
      </p>
    </div>
  );
}

export default function AdminAdminHub() {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <div>
      <AdminPageHeader
        icon={Settings2}
        title="Internal Ops"
        description="Founder tasks, pipeline history, bye manager, and operator notes"
      />

      <div
        className="overflow-x-auto touch-pan-x overscroll-x-contain mb-5 -mx-1"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div className="flex gap-0.5 border-b border-border/40 px-1 w-max min-w-full">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium whitespace-nowrap transition-colors min-h-[44px] ${
                tab === id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              {tab === id && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-t bg-foreground" />
              )}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={<TabFallback />}>
        {tab === "tasks"            && <AdminTasksPage />}
        {tab === "todo"             && <AdminTodoPage />}
        {tab === "pipeline-history" && <DataPipelinePage />}
        {tab === "byes"             && <AdminByeManager />}
        {tab === "logs"             && <InternalNotesTab />}
      </Suspense>
    </div>
  );
}
