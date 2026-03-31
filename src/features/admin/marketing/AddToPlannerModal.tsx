import { useState } from "react";
import { X, Check, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import {
  DAYS_OF_WEEK,
  PLATFORM_META,
  type DayOfWeek,
  type PlatformId,
  type AddToPlannerPayload,
} from "./plannerTypes";

interface Props {
  payload: AddToPlannerPayload;
  onClose: () => void;
}

export function AddToPlannerModal({ payload, onClose }: Props) {
  const { toast } = useToast();

  const [selectedDay, setSelectedDay]         = useState<DayOfWeek>("Monday");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["instagram"]);
  const [postSlot, setPostSlot]               = useState<1 | 2>(1);
  const [saving, setSaving]                   = useState(false);

  const togglePlatform = (id: PlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (selectedPlatforms.length === 0) {
      toast({ title: "Select at least one platform", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("admin_content_schedule").insert({
        day_of_week: selectedDay,
        post_slot: postSlot,
        platforms: selectedPlatforms,
        stat_angle: payload.stat_angle,
        media_url: payload.media_url,
        caption: payload.caption,
        insight: payload.insight,
      });
      if (error) throw error;
      toast({ title: "Added to planner", description: `${selectedDay} · Post ${postSlot}` });
      onClose();
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold">Add to Content Planner</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted/50 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto" style={{ maxHeight: "70vh" }}>

          {/* Stat angle preview */}
          <div className="px-3 py-2.5 rounded-lg bg-muted/30 border border-border">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-0.5">Content</p>
            <p className="text-xs font-semibold">{payload.stat_angle}</p>
          </div>

          {/* Day selector */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Select Day</p>
            <div className="grid grid-cols-4 gap-1.5">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className="px-2 py-2 rounded-lg border text-[11px] font-semibold transition-all"
                  style={
                    selectedDay === day
                      ? { background: "#F59E0B20", borderColor: "#F59E0B60", color: "#F59E0B" }
                      : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                  }
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Platform selector */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Platforms</p>
            <div className="grid grid-cols-2 gap-1.5">
              {PLATFORM_META.map((p) => {
                const active = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all"
                    style={
                      active
                        ? { background: `${p.color}15`, borderColor: `${p.color}50`, color: p.color }
                        : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                    }
                  >
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                      style={{ background: active ? p.color : "hsl(var(--muted))", color: active ? "#fff" : "hsl(var(--muted-foreground))" }}
                    >
                      {p.shortLabel}
                    </span>
                    {p.label}
                    {active && (
                      <Check className="h-3 w-3 ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Post slot */}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Post Slot</p>
            <div className="grid grid-cols-2 gap-1.5">
              {([1, 2] as const).map((slot) => (
                <button
                  key={slot}
                  onClick={() => setPostSlot(slot)}
                  className="px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all"
                  style={
                    postSlot === slot
                      ? { background: "#F59E0B20", borderColor: "#F59E0B60", color: "#F59E0B" }
                      : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                  }
                >
                  Post {slot}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-5 py-4 border-t border-border">
          <Button variant="outline" size="sm" className="flex-1 h-9 text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="flex-1 h-9 text-xs font-semibold"
            style={{ background: "#F59E0B", color: "#000" }}
            onClick={handleSave}
            disabled={saving || selectedPlatforms.length === 0}
          >
            {saving ? "Saving…" : "Add to Planner"}
          </Button>
        </div>
      </div>
    </div>
  );
}
