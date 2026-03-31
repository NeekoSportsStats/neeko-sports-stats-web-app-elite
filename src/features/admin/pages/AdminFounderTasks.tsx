import { useState, useEffect, useCallback, useRef } from "react";
import { callFounderTasks } from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Plus, SquareCheck as CheckSquare, Square, Trash2, Pencil, Check, X, ListTodo, ChevronDown, ChevronRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "low" | "normal" | "high";
type FilterMode = "all" | Priority | "completed";

interface Task {
  id: string;
  task_text: string;
  priority: Priority;
  completed: boolean;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_OPTS: { id: Priority; label: string; color: string; bg: string }[] = [
  { id: "high",   label: "High",   color: "#EF4444", bg: "#EF444420" },
  { id: "normal", label: "Normal", color: "#F59E0B", bg: "#F59E0B20" },
  { id: "low",    label: "Low",    color: "#6B7280", bg: "#6B728020" },
];

const FILTER_OPTS: { id: FilterMode; label: string }[] = [
  { id: "all",       label: "All" },
  { id: "high",      label: "High Priority" },
  { id: "normal",    label: "Normal" },
  { id: "low",       label: "Low" },
  { id: "completed", label: "Completed" },
];

const SHORTHAND: Record<string, Priority> = {
  "!high": "high",
  "!normal": "normal",
  "!low": "low",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityOpt(p: Priority) {
  return PRIORITY_OPTS.find((o) => o.id === p) ?? PRIORITY_OPTS[1];
}

function parseInput(raw: string): { text: string; priority: Priority } {
  let text = raw.trim();
  let priority: Priority = "normal";
  for (const [flag, p] of Object.entries(SHORTHAND)) {
    if (text.toLowerCase().endsWith(" " + flag) || text.toLowerCase() === flag) {
      text = text.slice(0, text.length - flag.length).trim();
      priority = p;
      break;
    }
  }
  return { text, priority };
}

function sortTasks(arr: Task[]): Task[] {
  const order: Record<Priority, number> = { high: 0, normal: 1, low: 2 };
  return [...arr].sort((a, b) => {
    const pd = order[a.priority] - order[b.priority];
    if (pd !== 0) return pd;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PriorityToggleProps {
  value: Priority;
  onChange: (v: Priority) => void;
  size?: "sm" | "md";
}

function PriorityToggle({ value, onChange, size = "md" }: PriorityToggleProps) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
      {PRIORITY_OPTS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`${size === "sm" ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"} font-medium border-r last:border-r-0 border-border transition-all`}
            style={
              active
                ? { background: opt.bg, color: opt.color }
                : { background: "transparent", color: "hsl(var(--muted-foreground))" }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  isEditing: boolean;
  editText: string;
  editPriority: Priority;
  isSavingEdit: boolean;
  isToggling: boolean;
  isDeleting: boolean;
  animatingOut: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEditTextChange: (v: string) => void;
  onEditPriorityChange: (v: Priority) => void;
}

function TaskRow({
  task, isEditing, editText, editPriority, isSavingEdit,
  isToggling, isDeleting, animatingOut,
  onToggle, onStartEdit, onCancelEdit, onSaveEdit, onDelete,
  onEditTextChange, onEditPriorityChange,
}: TaskRowProps) {
  const opt = priorityOpt(task.priority);

  if (isEditing) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 space-y-2.5 shadow-sm">
        <input
          type="text"
          value={editText}
          onChange={(e) => onEditTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-border"
          autoFocus
        />
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityToggle value={editPriority} onChange={onEditPriorityChange} size="sm" />
          <div className="flex gap-1.5 ml-auto">
            <button
              onClick={onCancelEdit}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onSaveEdit}
              disabled={isSavingEdit || !editText.trim()}
              className="h-7 px-3 flex items-center gap-1 rounded-md bg-foreground text-background text-xs font-semibold disabled:opacity-50 transition-opacity"
            >
              {isSavingEdit
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <><Check className="h-3.5 w-3.5" /> Save</>
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3 hover:bg-muted/30 hover:border-border transition-all duration-150"
      style={{
        opacity: animatingOut ? 0 : 1,
        transform: animatingOut ? "translateX(16px)" : "translateX(0)",
        transition: "opacity 0.25s ease, transform 0.25s ease, background-color 0.15s, border-color 0.15s",
      }}
    >
      <button
        onClick={onToggle}
        disabled={isToggling}
        className="shrink-0 transition-opacity disabled:opacity-40"
        title={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {isToggling
          ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          : task.completed
            ? <CheckSquare className="h-4 w-4 text-emerald-500" />
            : <Square className="h-4 w-4 text-muted-foreground group-hover:text-foreground/60 transition-colors" />
        }
      </button>

      <span
        className="flex-1 text-sm min-w-0 leading-snug"
        style={task.completed
          ? { textDecoration: "line-through", color: "hsl(var(--muted-foreground))", opacity: 0.7 }
          : {}
        }
      >
        {task.task_text}
      </span>

      <span
        className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
        style={{ color: opt.color, borderColor: `${opt.color}40`, background: opt.bg }}
      >
        {opt.label}
      </span>

      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onStartEdit}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-500 disabled:opacity-50"
          title="Delete"
        >
          {isDeleting
            ? <RefreshCw className="h-3 w-3 animate-spin" />
            : <Trash2 className="h-3 w-3" />
          }
        </button>
      </div>
    </div>
  );
}

interface SectionProps {
  label: string;
  count: number;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  accentColor?: string;
  children: React.ReactNode;
  emptyMessage?: string;
}

function TaskSection({ label, count, collapsible, defaultCollapsed, accentColor, children, emptyMessage }: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  return (
    <div className="rounded-xl border border-border/70 bg-card/40 overflow-hidden">
      <button
        className={`w-full flex items-center justify-between px-4 py-3 ${collapsible ? "cursor-pointer hover:bg-muted/30 transition-colors" : "cursor-default"}`}
        onClick={collapsible ? () => setCollapsed((p) => !p) : undefined}
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: accentColor ?? "#6B7280" }}
          />
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: accentColor ?? "hsl(var(--muted-foreground))" }}>
            {label}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        {collapsible && (
          collapsed
            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-border/50">
          <div className="pt-2 space-y-1.5">
            {count === 0
              ? <p className="text-xs text-muted-foreground/60 italic text-center py-3">{emptyMessage ?? "Nothing here."}</p>
              : children
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminFounderTasks() {
  const { toast } = useToast();
  const [tasks, setTasks]               = useState<Task[]>([]);
  const [loading, setLoading]           = useState(true);
  const [newText, setNewText]           = useState("");
  const [newPriority, setNewPriority]   = useState<Priority>("normal");
  const [adding, setAdding]             = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editText, setEditText]         = useState("");
  const [editPriority, setEditPriority] = useState<Priority>("normal");
  const [savingEdit, setSavingEdit]     = useState(false);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [animatingOutId, setAnimatingOutId] = useState<string | null>(null);
  const [filter, setFilter]             = useState<FilterMode>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callFounderTasks("list");
      setTasks((Array.isArray(result.tasks) ? result.tasks : []) as Task[]);
    } catch (err) {
      toast({ title: "Failed to load tasks", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const raw = newText.trim();
    if (!raw) return;
    const { text, priority: parsedPriority } = parseInput(raw);
    const priority = parsedPriority !== "normal" ? parsedPriority : newPriority;
    if (!text) return;
    setAdding(true);
    const optimisticId = `opt-${Date.now()}`;
    const optimistic: Task = {
      id: optimisticId,
      task_text: text,
      priority,
      completed: false,
      created_at: new Date().toISOString(),
    };
    setTasks((prev) => [optimistic, ...prev]);
    setNewText("");
    setTimeout(() => inputRef.current?.focus(), 50);
    try {
      const result = await callFounderTasks("add", { task_text: text, priority });
      if (result.task) {
        setTasks((prev) => prev.map((t) => t.id === optimisticId ? (result.task as Task) : t));
      }
      toast({ title: "Task added" });
    } catch (err) {
      setTasks((prev) => prev.filter((t) => t.id !== optimisticId));
      setNewText(raw);
      toast({ title: "Failed to add task", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (task: Task) => {
    setTogglingId(task.id);
    const next = !task.completed;
    if (next) {
      setAnimatingOutId(task.id);
      await new Promise((r) => setTimeout(r, 220));
      setAnimatingOutId(null);
    }
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: next } : t));
    try {
      await callFounderTasks("toggle", { id: task.id, completed: next });
      toast({ title: next ? "Task completed" : "Task reopened" });
    } catch (err) {
      setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed: !next } : t));
      toast({ title: "Failed to update", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.task_text);
    setEditPriority(task.priority);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = async (id: string) => {
    const text = editText.trim();
    if (!text) return;
    setSavingEdit(true);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, task_text: text, priority: editPriority } : t));
    setEditingId(null);
    try {
      await callFounderTasks("edit", { id, task_text: text, priority: editPriority });
      toast({ title: "Task updated" });
    } catch (err) {
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setAnimatingOutId(id);
    await new Promise((r) => setTimeout(r, 220));
    setAnimatingOutId(null);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await callFounderTasks("delete", { id });
      toast({ title: "Task deleted" });
    } catch (err) {
      load();
      toast({ title: "Failed to delete", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Derived ────────────────────────────────────────────────────────────────

  const pending   = sortTasks(tasks.filter((t) => !t.completed));
  const done      = tasks.filter((t) => t.completed);

  const urgent    = pending.filter((t) => t.priority === "high");
  const normal    = pending.filter((t) => t.priority === "normal");
  const backlog   = pending.filter((t) => t.priority === "low");

  const totalPending   = pending.length;
  const totalCompleted = done.length;
  const totalHigh      = tasks.filter((t) => t.priority === "high" && !t.completed).length;

  const visibleTasks = (() => {
    if (filter === "all")       return null;
    if (filter === "completed") return done;
    return pending.filter((t) => t.priority === filter);
  })();

  const renderRow = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      isEditing={editingId === task.id}
      editText={editText}
      editPriority={editPriority}
      isSavingEdit={savingEdit}
      isToggling={togglingId === task.id}
      isDeleting={deletingId === task.id}
      animatingOut={animatingOutId === task.id}
      onToggle={() => handleToggle(task)}
      onStartEdit={() => startEdit(task)}
      onCancelEdit={cancelEdit}
      onSaveEdit={() => saveEdit(task.id)}
      onDelete={() => handleDelete(task.id)}
      onEditTextChange={setEditText}
      onEditPriorityChange={setEditPriority}
    />
  );

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-muted-foreground" />
            Founder Tasks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Persistent task list — synced across devices.
          </p>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <StatPill label="Pending" value={totalPending} color="#F59E0B" />
          <StatPill label="Done" value={totalCompleted} color="#10B981" />
          <StatPill label="High" value={totalHigh} color="#EF4444" />
          <button
            onClick={load}
            disabled={loading}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Quick Entry ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-sm">
        <div className="flex gap-2 items-center flex-col sm:flex-row">
          <div className="relative flex-1 w-full">
            <input
              ref={inputRef}
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !adding && handleAdd()}
              placeholder="Add a task… (use !high / !low to set priority)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-border placeholder:text-muted-foreground/40"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto items-center">
            <PriorityToggle value={newPriority} onChange={setNewPriority} />
            <button
              onClick={handleAdd}
              disabled={adding || !newText.trim()}
              className="h-10 px-4 flex items-center gap-1.5 rounded-xl bg-foreground text-background text-xs font-semibold shrink-0 disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {adding
                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />
              }
              Add
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/50">
          Tip: type <code className="font-mono">!high</code> or <code className="font-mono">!low</code> at the end of your task to set priority inline.
        </p>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_OPTS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setFilter(opt.id)}
            className="px-3 py-1.5 rounded-full border text-xs font-medium transition-all"
            style={
              filter === opt.id
                ? { background: "hsl(var(--foreground))", color: "hsl(var(--background))", borderColor: "hsl(var(--foreground))" }
                : { background: "transparent", borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Task List ────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center space-y-2">
          <p className="text-sm font-medium text-muted-foreground">You're all caught up.</p>
          <p className="text-xs text-muted-foreground/60">Add a new task above to track your next improvement.</p>
        </div>
      ) : visibleTasks !== null ? (
        /* Filtered view */
        <div className="space-y-1.5">
          {visibleTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center">
              <p className="text-sm text-muted-foreground/60">No tasks match this filter.</p>
            </div>
          ) : (
            visibleTasks.map(renderRow)
          )}
        </div>
      ) : (
        /* Sectioned view (filter = "all") */
        <div className="space-y-3">

          {urgent.length > 0 && (
            <TaskSection label="Urgent" count={urgent.length} accentColor="#EF4444">
              {urgent.map(renderRow)}
            </TaskSection>
          )}

          {normal.length > 0 && (
            <TaskSection label="Pending" count={normal.length} accentColor="#F59E0B">
              {normal.map(renderRow)}
            </TaskSection>
          )}

          {backlog.length > 0 && (
            <TaskSection label="Backlog" count={backlog.length} accentColor="#6B7280">
              {backlog.map(renderRow)}
            </TaskSection>
          )}

          {pending.length === 0 && done.length === 0 && (
            <div className="rounded-xl border border-dashed border-border py-16 text-center space-y-2">
              <p className="text-sm font-medium text-muted-foreground">You're all caught up.</p>
              <p className="text-xs text-muted-foreground/60">Add a new task above to track your next improvement.</p>
            </div>
          )}

          <TaskSection
            label="Completed"
            count={done.length}
            accentColor="#10B981"
            collapsible
            defaultCollapsed
            emptyMessage="No completed tasks yet."
          >
            <div className="opacity-60">
              {done.map(renderRow)}
            </div>
          </TaskSection>

        </div>
      )}

    </div>
  );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-card">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
