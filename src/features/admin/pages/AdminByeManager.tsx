import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Save, Calendar, ToggleLeft, ToggleRight } from "lucide-react";
import { AdminSectionIntro } from "@/features/admin/shared/AdminExplain";

interface TeamBye {
  id: number;
  team_id: number;
  team_name: string;
  season: number;
  bye_round: number;
  is_bye_active: boolean;
}

const SEASONS = [2026, 2027];

export default function AdminByeManager() {
  const { toast } = useToast();
  const [season, setSeason] = useState(2026);
  const [byes, setByes] = useState<TeamBye[]>([]);
  const [edits, setEdits] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  async function fetchByes() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_team_byes", { p_season: season });
    if (error) {
      toast({ title: "Failed to load byes", description: error.message, variant: "destructive" });
    } else {
      setByes((data as TeamBye[]) ?? []);
      setEdits({});
    }
    setLoading(false);
  }

  useEffect(() => { fetchByes(); }, [season]);

  function handleEdit(teamId: number, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setEdits(prev => ({ ...prev, [teamId]: num }));
    }
  }

  async function saveBye(teamId: number) {
    const newRound = edits[teamId];
    if (newRound == null) return;
    const team = byes.find(b => b.team_id === teamId);
    if (!team) return;
    setSaving(teamId);
    const { error } = await supabase.rpc("admin_update_team_bye", {
      p_team_id: teamId,
      p_season: season,
      p_bye_round: newRound,
    });
    setSaving(null);
    if (error) {
      toast({ title: `Failed to save ${team.team_name}`, description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Bye updated", description: `${team.team_name} → Round ${newRound} (${season})` });
      setEdits(prev => { const n = { ...prev }; delete n[teamId]; return n; });
      fetchByes();
    }
  }

  async function toggleBye(teamId: number, currentState: boolean) {
    const team = byes.find(b => b.team_id === teamId);
    if (!team) return;
    setToggling(teamId);
    const newState = !currentState;
    const { error } = await supabase.rpc("admin_toggle_team_bye", {
      p_team_id: teamId,
      p_season: season,
      p_is_bye_active: newState,
    });
    setToggling(null);
    if (error) {
      toast({ title: `Toggle failed for ${team.team_name}`, description: error.message, variant: "destructive" });
    } else {
      toast({
        title: newState ? "Bye activated" : "Bye deactivated",
        description: `${team.team_name} bye is now ${newState ? "ON" : "OFF"}`,
      });
      setByes(prev => prev.map(b => b.team_id === teamId ? { ...b, is_bye_active: newState } : b));
    }
  }

  const byesByRound = byes
    .filter(b => b.is_bye_active)
    .reduce<Record<number, TeamBye[]>>((acc, b) => {
      if (!acc[b.bye_round]) acc[b.bye_round] = [];
      acc[b.bye_round].push(b);
      return acc;
    }, {});

  const activeByeCount = byes.filter(b => b.is_bye_active).length;

  return (
    <div>
      <AdminSectionIntro
        description="Manage AFL team bye rounds per season. Toggle a team's bye ON to mark all their players as unavailable in rankings and AI. Changes take effect immediately — no pipeline run needed."
      />

      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Season:</span>
        </div>
        <div className="flex gap-1">
          {SEASONS.map(s => (
            <button
              key={s}
              onClick={() => setSeason(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                season === s
                  ? "bg-foreground text-background"
                  : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {activeByeCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 text-[10px] font-semibold border border-sky-500/20">
            {activeByeCount} team{activeByeCount > 1 ? "s" : ""} on bye
          </span>
        )}
        <button
          onClick={fetchByes}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Team</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Bye Round</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Save Round</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Bye Active</th>
                </tr>
              </thead>
              <tbody>
                {byes.map((b, i) => {
                  const editVal = edits[b.team_id];
                  const isDirty = editVal != null && editVal !== b.bye_round;
                  const isSaving = saving === b.team_id;
                  const isToggling = toggling === b.team_id;
                  return (
                    <tr key={b.team_id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{b.team_name}</span>
                          {b.is_bye_active && (
                            <span className="rounded-sm bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-sky-400 uppercase tracking-wide border border-sky-500/20">BYE</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="number"
                          min={1}
                          max={25}
                          defaultValue={b.bye_round}
                          onChange={e => handleEdit(b.team_id, e.target.value)}
                          className="w-16 rounded border border-border bg-background px-2 py-1 text-sm text-center font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => saveBye(b.team_id)}
                          disabled={!isDirty || isSaving}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                            isDirty && !isSaving
                              ? "bg-foreground text-background hover:opacity-80"
                              : "text-muted-foreground/40 cursor-not-allowed"
                          }`}
                        >
                          {isSaving
                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                            : <Save className="h-3 w-3" />
                          }
                          Save
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => toggleBye(b.team_id, b.is_bye_active)}
                          disabled={isToggling}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold transition-colors ${
                            b.is_bye_active
                              ? "bg-sky-500/15 text-sky-400 border border-sky-500/20 hover:bg-sky-500/25"
                              : "border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                          title={b.is_bye_active ? "Click to deactivate bye" : "Click to activate bye"}
                        >
                          {isToggling ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : b.is_bye_active ? (
                            <ToggleRight className="h-3.5 w-3.5" />
                          ) : (
                            <ToggleLeft className="h-3.5 w-3.5" />
                          )}
                          {b.is_bye_active ? "ON" : "OFF"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {Object.keys(byesByRound).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Active Byes — {season}</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(byesByRound)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([round, teams]) => (
                    <div key={round} className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 min-w-[160px]">
                      <div className="text-xs font-semibold text-sky-400 mb-2">Round {round}</div>
                      <div className="space-y-1">
                        {teams.map(t => (
                          <div key={t.team_id} className="text-xs text-foreground">{t.team_name}</div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
