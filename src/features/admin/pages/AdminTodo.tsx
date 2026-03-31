import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RefreshCw, Plus, SquareCheck as CheckSquare, Square, Trash2, ChevronDown, ChevronUp, CircleDot, Flame, Shield, TriangleAlert as AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdminTask {
  id: string;
  title: string;
  notes: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "todo" | "in_progress" | "done";
  category: "pipeline" | "ai" | "data" | "marketing" | "product" | "general";
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type FilterStatus = "all" | "todo" | "in_progress" | "done";
type FilterPriority = "all" | "critical" | "high" | "medium" | "low";
type FilterCategory = "all" | "pipeline" | "ai" | "data" | "marketing" | "product" | "general";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/10",
  high:     "text-amber-400 border-amber-500/30 bg-amber-500/10",
  medium:   "text-sky-400 border-sky-500/30 bg-sky-500/10",
  low:      "text-muted-foreground border-border bg-muted/20",
};

const STATUS_COLORS: Record<string, string> = {
  todo:        "text-muted-foreground border-border bg-muted/20",
  in_progress: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  done:        "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
};

const PRIORITY_ICONS: Record<string, React.ElementType> = {
  critical: Flame,
  high:     AlertTriangle,
  medium:   CircleDot,
  low:      Shield,
};

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.low;
  const Icon = PRIORITY_ICONS[priority] ?? CircleDot;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {priority.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.todo;
  const label = status === "in_progress" ? "IN PROGRESS" : status.toUpperCase();
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

interface NewTaskForm {
  title: string;
  notes: string;
  priority: AdminTask["priority"];
  category: AdminTask["category"];
  due_date: string;
}

const EMPTY_FORM: NewTaskForm = {
  title: "",
  notes: "",
  priority: "medium",
  category: "general",
  due_date: "",
};

export default function AdminTodo() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<NewTaskForm>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [filterStatus, setFilterStatus]     = useState<FilterStatus>("all");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("all");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");

  const hasLoaded = useRef(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("admin_tasks")
        .select("*")
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (data) setTasks(data as AdminTask[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      fetchTasks();
    }
  }, [fetchTasks]);

  async function handleAdd() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("admin_tasks").insert({
        title: form.title.trim(),
        notes: form.notes.trim(),
        priority: form.priority,
        category: form.category,
        due_date: form.due_date || null,
        status: "todo",
        created_by: user?.id,
      });
      if (error) throw error;
      toast({ title: "Task added" });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      await fetchTasks();
    } catch (err) {
      toast({ title: "Failed to add task", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: AdminTask["status"]) {
    const { error } = await supabase.from("admin_tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast({ title: "Failed to update", variant: "destructive" });
    } else {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    }
  }

  async function deleteTask(id: string) {
    const { error } = await supabase.from("admin_tasks").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    } else {
      setTasks(prev => prev.filter(t => t.id !== id));
      toast({ title: "Task deleted" });
    }
  }

  const filtered = tasks.filter(t => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    return true;
  });

  const counts = {
    todo: tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    done: tasks.filter(t => t.status === "done").length,
    critical: tasks.filter(t => t.priority === "critical" && t.status !== "done").length,
  };

  const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">To Do</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {counts.todo} open · {counts.in_progress} in progress · {counts.done} done
            {counts.critical > 0 && <span className="text-red-400 ml-2">· {counts.critical} critical</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTasks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(v => !v)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <input
              type="text"
              placeholder="Task title..."
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <textarea
              placeholder="Notes (optional)..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value as AdminTask["priority"] }))}
                  className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none"
                >
                  {["critical", "high", "medium", "low"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as AdminTask["category"] }))}
                  className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none"
                >
                  {["pipeline", "ai", "data", "marketing", "product", "general"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Due Date (optional)</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleAdd} disabled={saving || !form.title.trim()} size="sm">
                {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Add
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["all", "todo", "in_progress", "done"] as FilterStatus[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filterStatus === s ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {(["all", "critical", "high", "medium", "low"] as FilterPriority[]).map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filterPriority === p ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "all" ? "All Priority" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value as FilterCategory)}
          className="border border-border rounded px-2 py-1 text-xs bg-background text-foreground focus:outline-none"
        >
          <option value="all">All Categories</option>
          {["pipeline", "ai", "data", "marketing", "product", "general"].map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground ml-auto">{sortedFiltered.length} tasks</span>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center">
          <CheckSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-sm text-muted-foreground">No tasks match these filters.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sortedFiltered.map(task => {
            const isDone = task.status === "done";
            const isExpanded = expandedId === task.id;
            return (
              <div
                key={task.id}
                className={`rounded-lg border transition-colors ${
                  isDone ? "border-border/40 bg-muted/10 opacity-60" :
                  task.priority === "critical" ? "border-red-500/30 bg-red-500/5" :
                  task.priority === "high" ? "border-amber-500/20 bg-amber-500/5" :
                  "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => updateStatus(task.id, isDone ? "todo" : "done")}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isDone
                      ? <CheckSquare className="h-4 w-4 text-emerald-400" />
                      : <Square className="h-4 w-4" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </span>
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                        {task.category}
                      </Badge>
                      {task.due_date && (
                        <span className="text-[10px] text-muted-foreground">
                          Due {new Date(task.due_date).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}
                        </span>
                      )}
                    </div>
                    {task.notes && !isExpanded && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.notes}</p>
                    )}
                    {isExpanded && task.notes && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{task.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isDone && task.status !== "in_progress" && (
                      <button
                        onClick={() => updateStatus(task.id, "in_progress")}
                        className="text-[10px] text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 transition-colors"
                      >
                        Start
                      </button>
                    )}
                    {task.status === "in_progress" && (
                      <button
                        onClick={() => updateStatus(task.id, "todo")}
                        className="text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 transition-colors"
                      >
                        Pause
                      </button>
                    )}
                    {task.notes && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : task.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tasks.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {tasks.length} total tasks · stored in admin_tasks
        </p>
      )}
    </div>
  );
}
