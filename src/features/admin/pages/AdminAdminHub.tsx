import { lazy, Suspense, useState } from "react";
import { RefreshCw, ListTodo, ClipboardList, BookOpen, ScrollText, CalendarOff } from "lucide-react";
import { AdminSectionIntro } from "@/features/admin/shared/AdminExplain";

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
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Internal Ops</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Internal tasks, pipeline history, and operator notes.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
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
