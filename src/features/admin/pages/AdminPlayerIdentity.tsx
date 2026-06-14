import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Fingerprint, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle, ShieldAlert, Users, ClipboardList, ChevronDown, ChevronRight, Clock, Search, Download, Shield, GitMerge, Database, Eye, ChartBar as BarChart2, ArrowUpDown, ScanSearch, Circle as XCircle, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AdminPageHeader } from "../shared/AdminPageHeader";

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type AuditSeverity = "CRITICAL" | "WARNING" | "REVIEW" | "LOW" | "PASS";
type AnomalyStatus = "open" | "resolved" | "ignored";
type ActiveTab = "anomalies" | "team_audit" | "review_queue" | "stats_mismatch" | "coverage_audit" | "placeholder_guard";

interface Anomaly {
  id: string;
  severity: Severity;
  anomaly_type: string;
  player_id: number | null;
  player_name: string;
  team_name: string;
  details: Record<string, unknown>;
  status: AnomalyStatus;
  detected_at: string;
  resolved_at: string | null;
  notes: string | null;
}

interface SyncLog {
  id: string;
  run_at: string;
  players_inserted: number | null;
  players_updated: number | null;
  validation_status: string | null;
  triggered_by: string | null;
  notes: string | null;
}

interface ValidationResult {
  status: string;
  issue_count: number;
  fatal_count: number;
  warn_count: number;
  issues: Array<{ type: string; message: string; player_id?: number }>;
}

interface AuditSummary {
  teams_audited: number;
  canonical_players: number;
  raw_players: number;
  matched_players: number;
  unmatched_raw: number;
  placeholder_players: number;
  duplicate_name_risks: number;
  provider_id_conflicts: number;
  team_mismatch_risks: number;
  open_review_items: number;
}

interface TeamAuditRow {
  team_name: string;
  canonical_count: number;
  raw_count: number;
  cache_count: number;
  placeholder_count: number;
  unmatched_raw_count: number;
  duplicate_name_count: number;
  provider_conflict_count: number;
  has_override_count: number;
  last_seen_week: number;
  health_status: AuditSeverity;
}

interface PlayerAuditRow {
  player_id: number;
  canonical_name: string | null;
  raw_name: string | null;
  cache_name: string | null;
  canonical_team: string | null;
  raw_team: string | null;
  position_group: string | null;
  player_number: number | null;
  has_override: boolean;
  override_notes: string | null;
  is_placeholder: boolean;
  is_unmatched_raw: boolean;
  is_duplicate_name: boolean;
  is_provider_conflict: boolean;
  is_team_mismatch: boolean;
  in_raw_stats: boolean;
  in_rankings_cache: boolean;
  in_afl_players: boolean;
  last_seen_week: number;
  first_seen_week: number;
  games_played: number;
  severity: AuditSeverity;
  flag_reasons: string[];
}

interface ReviewQueueRow {
  player_id: number;
  player_name: string;
  team_name: string;
  severity: AuditSeverity;
  issue_type: string;
  reason: string;
  has_override: boolean;
  last_seen_week: number;
  games_played: number;
}

// ─── Severity helpers ────────────────────────────────────────────────────────

const SEV_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEV_CHIP: Record<Severity, string> = {
  critical: "bg-red-950 text-red-300 ring-1 ring-red-800",
  high:     "bg-amber-950 text-amber-300 ring-1 ring-amber-800",
  medium:   "bg-sky-950 text-sky-300 ring-1 ring-sky-800",
  low:      "bg-muted text-muted-foreground",
};

const SEV_DOT: Record<Severity, string> = {
  critical: "bg-red-500 animate-pulse",
  high:     "bg-amber-500",
  medium:   "bg-sky-400",
  low:      "bg-muted-foreground",
};

const TYPE_LABEL: Record<string, string> = {
  dual_identity:            "Dual Identity",
  high_value_placeholder:   "High-Value Placeholder",
  unknown_identity:         "Unknown Identity",
  placeholder:              "Placeholder",
  duplicate_name:           "Duplicate Name",
  has_override:             "Has Override",
};

const AUDIT_SEV_STYLES: Record<AuditSeverity, { chip: string; dot: string; label: string }> = {
  CRITICAL: { chip: "bg-red-950 text-red-300 ring-1 ring-red-800",     dot: "bg-red-500 animate-pulse",   label: "Critical" },
  WARNING:  { chip: "bg-amber-950 text-amber-300 ring-1 ring-amber-800", dot: "bg-amber-500",             label: "Warning" },
  REVIEW:   { chip: "bg-sky-950 text-sky-300 ring-1 ring-sky-800",      dot: "bg-sky-400",               label: "Review" },
  LOW:      { chip: "bg-muted text-muted-foreground",                    dot: "bg-muted-foreground",       label: "Low" },
  PASS:     { chip: "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-800", dot: "bg-emerald-500",     label: "Pass" },
};

const ISSUE_TYPE_LABEL: Record<string, string> = {
  placeholder:       "Placeholder Name",
  provider_conflict: "Provider ID Conflict",
  missing_from_cache:"Missing From Cache",
  team_mismatch:     "Team Mismatch",
  duplicate_name:    "Duplicate Name",
  has_override:      "Has Override",
};

// ─── Shared sub-components ───────────────────────────────────────────────────

function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SEV_CHIP[severity]}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEV_DOT[severity]}`} />
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

function AuditSeverityBadge({ severity }: { severity: AuditSeverity }) {
  const s = AUDIT_SEV_STYLES[severity] ?? AUDIT_SEV_STYLES.LOW;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
      {s.label}
    </span>
  );
}

function SummaryCard({
  label, value, icon: Icon, accent,
}: {
  label: string; value: number | string; icon: React.ElementType; accent: "red" | "amber" | "sky" | "muted" | "emerald";
}) {
  const colors: Record<string, string> = {
    red:     "text-red-400 bg-red-950/40 ring-red-800/40",
    amber:   "text-amber-400 bg-amber-950/40 ring-amber-800/40",
    sky:     "text-sky-400 bg-sky-950/40 ring-sky-800/40",
    muted:   "text-muted-foreground bg-muted/40 ring-border/40",
    emerald: "text-emerald-400 bg-emerald-950/40 ring-emerald-800/40",
  };
  const valueColors: Record<string, string> = {
    red: "text-red-300", amber: "text-amber-300", sky: "text-sky-300",
    muted: "text-foreground", emerald: "text-emerald-300",
  };
  return (
    <div className={`rounded-lg ring-1 p-4 flex items-center gap-3 ${colors[accent]}`}>
      <div className="shrink-0">
        <Icon className={`h-5 w-5 ${valueColors[accent]}`} />
      </div>
      <div className="min-w-0">
        <div className={`text-xl font-bold tabular-nums leading-none ${valueColors[accent]}`}>{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ─── Anomalies tab (existing) ────────────────────────────────────────────────

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const [expanded, setExpanded] = useState(false);
  const detailEntries = Object.entries(anomaly.details).filter(([, v]) => v !== null && v !== undefined);

  return (
    <div className="border-b border-border/30 last:border-0">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="shrink-0">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <SeverityChip severity={anomaly.severity} />
        <span className="text-xs text-muted-foreground shrink-0 min-w-[130px]">
          {TYPE_LABEL[anomaly.anomaly_type] ?? anomaly.anomaly_type}
        </span>
        <span className="text-sm font-medium text-foreground flex-1 truncate">{anomaly.player_name}</span>
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">{anomaly.team_name}</span>
        {anomaly.player_id && (
          <span className="text-[11px] font-mono text-muted-foreground/60 shrink-0 hidden md:block">
            #{anomaly.player_id}
          </span>
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-[2.25rem] border-l border-border/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-2">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-0.5">
                <span className="text-[11px] text-muted-foreground capitalize shrink-0">{k.replace(/_/g, " ")}</span>
                <span className="text-[11px] font-mono text-foreground/80 text-right break-all">
                  {Array.isArray(v) ? v.join(", ") : String(v ?? "—")}
                </span>
              </div>
            ))}
          </div>
          {anomaly.notes && (
            <p className="mt-3 text-[11px] text-muted-foreground italic border-t border-border/20 pt-2">
              {anomaly.notes}
            </p>
          )}
          <div className="mt-2 text-[10px] text-muted-foreground/50">
            Detected {new Date(anomaly.detected_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityGroup({ severity, anomalies }: { severity: Severity; anomalies: Anomaly[] }) {
  const [collapsed, setCollapsed] = useState(severity === "low");
  if (anomalies.length === 0) return null;

  const headerColors: Record<Severity, string> = {
    critical: "text-red-400", high: "text-amber-400", medium: "text-sky-400", low: "text-muted-foreground",
  };

  return (
    <div className="mb-4">
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/20 hover:bg-muted/40 transition-colors rounded-t-md border border-border/40"
        onClick={() => setCollapsed((c) => !c)}
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className={`text-xs font-semibold uppercase tracking-wide ${headerColors[severity]}`}>{severity}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {anomalies.length} {anomalies.length === 1 ? "issue" : "issues"}
        </span>
      </button>
      {!collapsed && (
        <div className="border border-t-0 border-border/40 rounded-b-md overflow-hidden">
          {anomalies.map((a) => <AnomalyRow key={a.id} anomaly={a} />)}
        </div>
      )}
    </div>
  );
}

// ─── Team Audit tab ──────────────────────────────────────────────────────────

function TeamAuditTab() {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [teams, setTeams] = useState<TeamAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [teamPlayers, setTeamPlayers] = useState<PlayerAuditRow[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [filterSev, setFilterSev] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.rpc("get_player_identity_audit_summary"),
      supabase.rpc("get_player_identity_team_audit"),
    ]).then(([sumRes, teamRes]) => {
      if (sumRes.data) {
        const row = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
        setSummary(row as AuditSummary);
      }
      if (teamRes.data) setTeams(teamRes.data as TeamAuditRow[]);
    }).finally(() => setLoading(false));
  }, []);

  const handleExpandTeam = useCallback(async (teamName: string) => {
    if (expandedTeam === teamName) {
      setExpandedTeam(null);
      setTeamPlayers([]);
      return;
    }
    setExpandedTeam(teamName);
    setLoadingPlayers(true);
    const { data } = await supabase.rpc("get_player_identity_player_audit", { p_team_name: teamName });
    setTeamPlayers((data as PlayerAuditRow[]) ?? []);
    setLoadingPlayers(false);
  }, [expandedTeam]);

  const filteredPlayers = teamPlayers.filter((p) => {
    const nameMatch =
      playerSearch === "" ||
      (p.canonical_name ?? "").toLowerCase().includes(playerSearch.toLowerCase()) ||
      (p.raw_name ?? "").toLowerCase().includes(playerSearch.toLowerCase()) ||
      String(p.player_id).includes(playerSearch);
    const sevMatch = filterSev === "all" || p.severity === filterSev;
    return nameMatch && sevMatch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground/50">Loading team audit…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Global summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryCard label="Teams Audited"       value={summary.teams_audited}          icon={Shield}      accent="muted" />
          <SummaryCard label="Canonical Players"   value={summary.canonical_players}      icon={Database}    accent="muted" />
          <SummaryCard label="Raw/API Players"     value={summary.raw_players}            icon={Eye}         accent="muted" />
          <SummaryCard label="Unmatched Raw"       value={summary.unmatched_raw}          icon={AlertTriangle} accent={summary.unmatched_raw > 0 ? "amber" : "muted"} />
          <SummaryCard label="Placeholders"        value={summary.placeholder_players}    icon={Users}       accent={summary.placeholder_players > 0 ? "red" : "muted"} />
          <SummaryCard label="Duplicate Names"     value={summary.duplicate_name_risks}   icon={ClipboardList} accent={summary.duplicate_name_risks > 0 ? "amber" : "muted"} />
          <SummaryCard label="Provider Conflicts"  value={summary.provider_id_conflicts}  icon={GitMerge}    accent={summary.provider_id_conflicts > 0 ? "red" : "muted"} />
          <SummaryCard label="Team Mismatches"     value={summary.team_mismatch_risks}    icon={AlertTriangle} accent={summary.team_mismatch_risks > 0 ? "amber" : "muted"} />
          <SummaryCard label="Matched Players"     value={summary.matched_players}        icon={CheckCircle} accent="emerald" />
          <SummaryCard label="Open Review Items"   value={summary.open_review_items}      icon={ShieldAlert} accent={summary.open_review_items > 0 ? "sky" : "muted"} />
        </div>
      )}

      {/* Team-level table */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Team Coverage Audit — All 18 Clubs
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Team</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Canonical</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Raw/API</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden sm:table-cell">Unmatched</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden sm:table-cell">Placeholders</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden md:table-cell">Dup Names</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden md:table-cell">Conflicts</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden lg:table-cell">Overrides</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden lg:table-cell">Last Wk</th>
                  <th className="text-center px-3 py-2.5 text-muted-foreground font-medium">Health</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => (
                  <>
                    <tr
                      key={team.team_name}
                      className={`border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer ${
                        expandedTeam === team.team_name ? "bg-muted/10" : ""
                      }`}
                      onClick={() => handleExpandTeam(team.team_name)}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{team.team_name}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{team.canonical_count}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{team.raw_count}</td>
                      <td className={`px-3 py-3 text-right tabular-nums hidden sm:table-cell ${
                        team.unmatched_raw_count > 0 ? "text-amber-400 font-semibold" : "text-muted-foreground"
                      }`}>{team.unmatched_raw_count}</td>
                      <td className={`px-3 py-3 text-right tabular-nums hidden sm:table-cell ${
                        team.placeholder_count > 0 ? "text-red-400 font-semibold" : "text-muted-foreground"
                      }`}>{team.placeholder_count}</td>
                      <td className={`px-3 py-3 text-right tabular-nums hidden md:table-cell ${
                        team.duplicate_name_count > 0 ? "text-amber-400 font-semibold" : "text-muted-foreground"
                      }`}>{team.duplicate_name_count}</td>
                      <td className={`px-3 py-3 text-right tabular-nums hidden md:table-cell ${
                        team.provider_conflict_count > 0 ? "text-red-400 font-semibold" : "text-muted-foreground"
                      }`}>{team.provider_conflict_count}</td>
                      <td className={`px-3 py-3 text-right tabular-nums hidden lg:table-cell ${
                        team.has_override_count > 0 ? "text-sky-400" : "text-muted-foreground"
                      }`}>{team.has_override_count}</td>
                      <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell text-muted-foreground">
                        {team.last_seen_week > 0 ? `Wk ${team.last_seen_week}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <AuditSeverityBadge severity={team.health_status} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {expandedTeam === team.team_name
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground inline" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground inline" />}
                      </td>
                    </tr>

                    {/* Expanded player-level detail */}
                    {expandedTeam === team.team_name && (
                      <tr key={`${team.team_name}-expanded`}>
                        <td colSpan={11} className="px-0 py-0 bg-muted/5">
                          <div className="border-t border-border/30 border-b border-border/20 px-4 py-4">
                            {/* Filter bar */}
                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                              <div className="relative flex-1 min-w-[180px] max-w-xs">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
                                <input
                                  type="text"
                                  placeholder="Search player name or ID…"
                                  value={playerSearch}
                                  onChange={(e) => setPlayerSearch(e.target.value)}
                                  className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-background border border-border/40 rounded-md focus:outline-none focus:ring-1 focus:ring-border/60 text-foreground placeholder:text-muted-foreground/40"
                                />
                              </div>
                              <select
                                value={filterSev}
                                onChange={(e) => setFilterSev(e.target.value)}
                                className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
                              >
                                <option value="all">All Severities</option>
                                <option value="CRITICAL">Critical</option>
                                <option value="WARNING">Warning</option>
                                <option value="REVIEW">Review</option>
                                <option value="LOW">Low</option>
                              </select>
                              <span className="text-[11px] text-muted-foreground ml-auto">
                                {filteredPlayers.length} players
                              </span>
                            </div>

                            {loadingPlayers ? (
                              <div className="flex items-center gap-2 py-8 justify-center">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
                                <span className="text-xs text-muted-foreground/50">Loading players…</span>
                              </div>
                            ) : filteredPlayers.length === 0 ? (
                              <div className="text-center py-8">
                                <CheckCircle className="h-6 w-6 text-emerald-500/40 mx-auto mb-2" />
                                <p className="text-xs text-muted-foreground">No players match the current filters</p>
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                  <thead>
                                    <tr className="border-b border-border/30 text-muted-foreground">
                                      <th className="text-left px-2 py-2 font-medium">Sev</th>
                                      <th className="text-left px-2 py-2 font-medium">Provider ID</th>
                                      <th className="text-left px-2 py-2 font-medium">Canonical Name</th>
                                      <th className="text-left px-2 py-2 font-medium hidden sm:table-cell">Raw Name</th>
                                      <th className="text-left px-2 py-2 font-medium hidden md:table-cell">Raw Team</th>
                                      <th className="text-center px-2 py-2 font-medium hidden md:table-cell">Cache</th>
                                      <th className="text-center px-2 py-2 font-medium hidden lg:table-cell">Override</th>
                                      <th className="text-right px-2 py-2 font-medium hidden lg:table-cell">Games</th>
                                      <th className="text-right px-2 py-2 font-medium hidden lg:table-cell">Last Wk</th>
                                      <th className="text-left px-2 py-2 font-medium">Flags</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredPlayers.map((p) => (
                                      <PlayerAuditRow key={p.player_id} player={p} />
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlayerAuditRow({ player: p }: { player: PlayerAuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const sevStyle = AUDIT_SEV_STYLES[p.severity] ?? AUDIT_SEV_STYLES.LOW;

  const displayName = p.canonical_name ?? p.cache_name ?? p.raw_name ?? `#${p.player_id}`;
  const isNameMismatch = p.canonical_name && p.raw_name && p.canonical_name !== p.raw_name;

  return (
    <>
      <tr
        className={`border-b border-border/20 cursor-pointer hover:bg-muted/10 transition-colors ${
          p.severity === "CRITICAL" ? "bg-red-950/10" :
          p.severity === "WARNING" ? "bg-amber-950/10" :
          p.severity === "REVIEW" ? "bg-sky-950/5" : ""
        }`}
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-2 py-2.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${sevStyle.chip}`}>
            <span className={`w-1 h-1 rounded-full ${sevStyle.dot}`} />
            {sevStyle.label}
          </span>
        </td>
        <td className="px-2 py-2.5 font-mono text-muted-foreground/70">
          {p.player_id ? `#${p.player_id}` : "—"}
        </td>
        <td className={`px-2 py-2.5 font-medium ${isNameMismatch ? "text-amber-300" : "text-foreground"}`}>
          {displayName}
        </td>
        <td className="px-2 py-2.5 text-muted-foreground hidden sm:table-cell">
          {p.raw_name ?? "—"}
        </td>
        <td className={`px-2 py-2.5 hidden md:table-cell ${
          p.is_team_mismatch ? "text-amber-400 font-semibold" : "text-muted-foreground"
        }`}>
          {p.raw_team ?? "—"}
        </td>
        <td className="px-2 py-2.5 text-center hidden md:table-cell">
          {p.in_rankings_cache
            ? <span className="text-emerald-400">✓</span>
            : <span className="text-red-400">✗</span>}
        </td>
        <td className="px-2 py-2.5 text-center hidden lg:table-cell">
          {p.has_override
            ? <span className="text-sky-400 font-semibold">Yes</span>
            : <span className="text-muted-foreground/40">—</span>}
        </td>
        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
          {p.games_played}
        </td>
        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
          {p.last_seen_week > 0 ? `Wk ${p.last_seen_week}` : "—"}
        </td>
        <td className="px-2 py-2.5 max-w-[200px]">
          {p.flag_reasons.length > 0 ? (
            <span className="text-muted-foreground/70 truncate block" title={p.flag_reasons.join("; ")}>
              {p.flag_reasons[0]}
              {p.flag_reasons.length > 1 && <span className="text-muted-foreground/40"> +{p.flag_reasons.length - 1}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground/30">—</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/20 bg-muted/5">
          <td colSpan={10} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-1.5 text-[11px]">
              {[
                ["Provider ID", p.player_id ? `#${p.player_id}` : "—"],
                ["Canonical Name", p.canonical_name ?? "—"],
                ["Raw/API Name", p.raw_name ?? "—"],
                ["Cache Name", p.cache_name ?? "—"],
                ["Canonical Team", p.canonical_team ?? "—"],
                ["Raw Team", p.raw_team ?? "—"],
                ["Position", p.position_group ?? "—"],
                ["Jumper #", p.player_number ? String(p.player_number) : "—"],
                ["In Raw Stats", p.in_raw_stats ? "Yes" : "No"],
                ["In Rankings Cache", p.in_rankings_cache ? "Yes" : "No"],
                ["In afl.players", p.in_afl_players ? "Yes" : "No"],
                ["Games Played", String(p.games_played)],
                ["First Seen Wk", p.first_seen_week > 0 ? `Wk ${p.first_seen_week}` : "—"],
                ["Last Seen Wk", p.last_seen_week > 0 ? `Wk ${p.last_seen_week}` : "—"],
                ["Has Override", p.has_override ? "Yes" : "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">{k}</span>
                  <span className="font-mono text-foreground/80 text-right break-all">{v}</span>
                </div>
              ))}
            </div>
            {p.flag_reasons.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border/20 space-y-1">
                {p.flag_reasons.map((r, i) => (
                  <p key={i} className="text-[11px] text-amber-400/80">⚠ {r}</p>
                ))}
              </div>
            )}
            {p.override_notes && (
              <p className="mt-2 text-[11px] text-sky-400/80 italic">Override: {p.override_notes}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Review Queue tab ────────────────────────────────────────────────────────

function ReviewQueueTab() {
  const [queue, setQueue] = useState<ReviewQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSev, setFilterSev] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const copied = useRef(false);
  const [copyLabel, setCopyLabel] = useState("Copy CSV");

  useEffect(() => {
    setLoading(true);
    supabase.rpc("get_player_identity_review_queue")
      .then(({ data }) => setQueue((data as ReviewQueueRow[]) ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = queue.filter((r) => {
    const nameMatch = search === ""
      || r.player_name.toLowerCase().includes(search.toLowerCase())
      || r.team_name.toLowerCase().includes(search.toLowerCase())
      || String(r.player_id).includes(search);
    const sevMatch = filterSev === "all" || r.severity === filterSev;
    const typeMatch = filterType === "all" || r.issue_type === filterType;
    return nameMatch && sevMatch && typeMatch;
  });

  const issueTypes = [...new Set(queue.map((r) => r.issue_type))];

  const handleCopyCSV = () => {
    if (copied.current) return;
    copied.current = true;
    const header = "player_id,player_name,team_name,severity,issue_type,reason,has_override,last_seen_week,games_played";
    const rows = filtered.map((r) =>
      [r.player_id, `"${r.player_name}"`, `"${r.team_name}"`, r.severity, r.issue_type,
       `"${r.reason}"`, r.has_override, r.last_seen_week, r.games_played].join(",")
    );
    navigator.clipboard.writeText([header, ...rows].join("\n")).catch(() => {});
    setCopyLabel("Copied!");
    setTimeout(() => { copied.current = false; setCopyLabel("Copy CSV"); }, 2500);
  };

  const sevCounts: Record<string, number> = {};
  for (const r of queue) sevCounts[r.severity] = (sevCounts[r.severity] ?? 0) + 1;

  return (
    <div className="space-y-5">
      {/* Summary chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {(["CRITICAL", "WARNING", "REVIEW"] as AuditSeverity[]).map((sev) => {
          const n = sevCounts[sev] ?? 0;
          if (n === 0) return null;
          return (
            <button
              key={sev}
              onClick={() => setFilterSev(filterSev === sev ? "all" : sev)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                AUDIT_SEV_STYLES[sev].chip
              } ${filterSev === sev ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-80 hover:opacity-100"}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${AUDIT_SEV_STYLES[sev].dot}`} />
              {sev} · {n}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search player, team, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-background border border-border/40 rounded-md focus:outline-none focus:ring-1 focus:ring-border/60 text-foreground placeholder:text-muted-foreground/40"
          />
        </div>
        <select
          value={filterSev}
          onChange={(e) => setFilterSev(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All Severities</option>
          {(["CRITICAL", "WARNING", "REVIEW", "LOW"] as AuditSeverity[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All Issue Types</option>
          {issueTypes.map((t) => (
            <option key={t} value={t}>{ISSUE_TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} of {queue.length}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyCSV}
          className="gap-2 ml-auto text-[11px]"
          disabled={filtered.length === 0}
        >
          <Download className="h-3 w-3" />
          {copyLabel}
        </Button>
      </div>

      {/* Queue table */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Manual Review Queue
            {!loading && (
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">({filtered.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50">Loading review queue…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <CheckCircle className="h-8 w-8 text-emerald-500/40" />
              <p className="text-sm text-muted-foreground">No items match current filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map((item, idx) => (
                <ReviewQueueItem key={`${item.player_id}-${item.issue_type}-${idx}`} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewQueueItem({ item }: { item: ReviewQueueRow }) {
  const [expanded, setExpanded] = useState(false);
  const sevStyle = AUDIT_SEV_STYLES[item.severity] ?? AUDIT_SEV_STYLES.LOW;

  return (
    <div className={`${
      item.severity === "CRITICAL" ? "bg-red-950/5" :
      item.severity === "WARNING"  ? "bg-amber-950/5" : ""
    }`}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="shrink-0 mt-0.5">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>

        <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevStyle.chip}`}>
          <span className={`w-1 h-1 rounded-full ${sevStyle.dot}`} />
          {sevStyle.label}
        </span>

        <span className="shrink-0 text-[11px] text-muted-foreground/70 bg-muted/40 px-1.5 py-0.5 rounded font-mono hidden sm:inline-block mt-0.5">
          {ISSUE_TYPE_LABEL[item.issue_type] ?? item.issue_type}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground truncate">{item.player_name}</span>
            <span className="text-[11px] text-muted-foreground/60 font-mono shrink-0">#{item.player_id}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {item.team_name}
            {item.has_override && (
              <span className="ml-2 text-sky-400/80">· Has override</span>
            )}
          </div>
        </div>

        <div className="text-right shrink-0 hidden md:block">
          <div className="text-[11px] text-muted-foreground/60 tabular-nums">
            {item.last_seen_week > 0 ? `Wk ${item.last_seen_week}` : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground/40">
            {item.games_played} games
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-[2.25rem] border-l border-border/30">
          <div className="mt-2 text-[11px] text-amber-400/90 bg-amber-950/20 border border-amber-800/20 rounded px-3 py-2">
            {item.reason}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 mt-3 text-[11px]">
            {[
              ["Provider ID",  `#${item.player_id}`],
              ["Team",         item.team_name],
              ["Issue Type",   ISSUE_TYPE_LABEL[item.issue_type] ?? item.issue_type],
              ["Has Override", item.has_override ? "Yes (verify still needed)" : "No"],
              ["Last Seen Wk", item.last_seen_week > 0 ? `Week ${item.last_seen_week}` : "Unknown"],
              ["Games Played", String(item.games_played)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{k}</span>
                <span className="font-mono text-foreground/80 text-right">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground/40 italic border-t border-border/20 pt-2">
            Read-only audit — no changes can be made from this view.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Stats Mismatch Audit tab ────────────────────────────────────────────────

interface StatsMismatchRow {
  player_id: number;
  player_name: string;
  team_name: string;
  severity: AuditSeverity;
  issue_type: string;
  issue_category: string;
  detail: string;
  raw_value: string | null;
  cache_value: string | null;
  games_raw: number;
  has_override: boolean;
}

interface FingerprintConflictRow {
  conflict_name: string;
  game_id: number;
  week_num: number | null;
  id_count: number;
  player_id_a: number;
  player_id_b: number;
  team_a: string | null;
  all_ids: number[];
}

const STATS_ISSUE_LABEL: Record<string, string> = {
  disposal_arithmetic:   "Disposal Arithmetic",
  projection_insane:     "Projection Out of Range",
  projection_season_gap: "Projection vs Season Gap",
  team_mismatch:         "Team Mismatch",
  ruck_no_hitouts:       "Ruckman — No Hitouts",
  missing_from_cache:    "Missing from Cache",
  missing_from_raw:      "Missing from Raw",
  identity_fingerprint:  "Identity Fingerprint Conflict",
};

const CATEGORY_ORDER: Record<string, number> = {
  "Identity Mismatch":       1,
  "Pipeline Coverage":       2,
  "Projection/Data Quality": 3,
  "Manual Review":           4,
};

const CATEGORY_COLOR: Record<string, string> = {
  "Identity Mismatch":       "text-red-400/80",
  "Pipeline Coverage":       "text-amber-400/80",
  "Projection/Data Quality": "text-sky-400/80",
  "Manual Review":           "text-muted-foreground/60",
};

function StatsMismatchQueueItem({ item }: { item: StatsMismatchRow }) {
  const [expanded, setExpanded] = useState(false);
  const sevStyle = AUDIT_SEV_STYLES[item.severity] ?? AUDIT_SEV_STYLES.LOW;
  const isIdentity = item.issue_type === "identity_fingerprint";

  return (
    <div className={`${
      isIdentity              ? "bg-red-950/10" :
      item.severity === "CRITICAL" ? "bg-red-950/5" :
      item.severity === "WARNING"  ? "bg-amber-950/5" : ""
    }`}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="shrink-0 mt-0.5">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sevStyle.chip}`}>
          <span className={`w-1 h-1 rounded-full ${sevStyle.dot}`} />
          {sevStyle.label}
        </span>
        <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded hidden sm:inline-block mt-0.5 ${
          CATEGORY_COLOR[item.issue_category] ?? "text-muted-foreground/60"
        } bg-muted/30`}>
          {item.issue_category}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded font-mono hidden lg:inline-block mt-0.5">
          {STATS_ISSUE_LABEL[item.issue_type] ?? item.issue_type}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground truncate">{item.player_name}</span>
            <span className="text-[11px] text-muted-foreground/60 font-mono shrink-0">#{item.player_id}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {item.team_name}
            {item.has_override && <span className="ml-2 text-sky-400/80">· Has override</span>}
          </div>
        </div>
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-[11px] text-muted-foreground/60 tabular-nums">{item.games_raw} games</div>
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-[2.25rem] border-l border-border/30">
          <div className={`mt-2 text-[11px] bg-opacity-20 border rounded px-3 py-2 ${
            isIdentity
              ? "text-red-300/90 bg-red-950/20 border-red-800/20"
              : "text-amber-400/90 bg-amber-950/20 border-amber-800/20"
          }`}>
            {item.detail}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 mt-3 text-[11px]">
            {[
              ["Provider ID",  `#${item.player_id}`],
              ["Team",         item.team_name],
              ["Category",     item.issue_category],
              ["Issue Type",   STATS_ISSUE_LABEL[item.issue_type] ?? item.issue_type],
              ["Has Override", item.has_override ? "Yes" : "No"],
              ["Raw Value",    item.raw_value ?? "—"],
              ["Cache Value",  item.cache_value ?? "—"],
              ["Games (raw)",  String(item.games_raw)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{k}</span>
                <span className="font-mono text-foreground/80 text-right">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground/40 italic border-t border-border/20 pt-2">
            Read-only audit — no production data is modified by this view.
          </p>
        </div>
      )}
    </div>
  );
}

function FingerprintConflictsCard({ rows }: { rows: FingerprintConflictRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="border-red-800/30 bg-red-950/10">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2 text-red-300/90">
          <GitMerge className="h-4 w-4" />
          Identity Fingerprint Conflicts
          <span className="ml-1 text-[11px] font-normal text-red-400/70">({rows.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-0">
        <div className="divide-y divide-red-900/20">
          {rows.map((r, i) => (
            <div key={i} className="px-4 py-2.5 text-[11px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{r.conflict_name}</span>
                <span className="text-muted-foreground/50">game #{r.game_id}</span>
                {r.week_num != null && <span className="text-muted-foreground/50">wk {r.week_num}</span>}
                <span className="text-red-400/80 font-mono">{r.id_count} IDs</span>
                {r.team_a && <span className="text-muted-foreground/60">{r.team_a}</span>}
              </div>
              <div className="mt-0.5 text-muted-foreground/50 font-mono">
                IDs: {r.all_ids.join(", ")} — raw_value={r.player_id_a}, cache_value={r.player_id_b}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Client-side reference CSV comparison
interface RefRow {
  player_name: string;
  team: string;
  disposals: number;
  kicks: number;
  handballs: number;
  marks: number;
  tackles: number;
  goals: number;
  behinds: number;
  hitouts: number;
  fantasy_points: number;
}

interface RefMatch {
  ref: RefRow;
  internalId: number | null;
  internalName: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "MISSING";
  issue: string | null;
}

function parseRefCSV(text: string): RefRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const get = (key: string): string => {
      const i = header.indexOf(key);
      return i >= 0 ? (cols[i] ?? "").trim().replace(/^"|"$/g, "") : "";
    };
    const num = (key: string) => parseFloat(get(key)) || 0;
    return {
      player_name:   get("player_name"),
      team:          get("team"),
      disposals:     num("disposals"),
      kicks:         num("kicks"),
      handballs:     num("handballs"),
      marks:         num("marks"),
      tackles:       num("tackles"),
      goals:         num("goals"),
      behinds:       num("behinds"),
      hitouts:       num("hitouts"),
      fantasy_points: num("fantasy_points"),
    };
  }).filter((r) => r.player_name !== "");
}

function compareRefToInternal(
  refRows: RefRow[],
  queue: StatsMismatchRow[]
): RefMatch[] {
  // Build a name->id map from the queue's player names
  const nameMap = new Map<string, number>();
  for (const q of queue) nameMap.set(q.player_name.toLowerCase(), q.player_id);

  return refRows.map((ref) => {
    const key = ref.player_name.toLowerCase();
    const internalId = nameMap.get(key) ?? null;
    const internalName = internalId ? ref.player_name : null;

    if (internalId) {
      // Name matched — check for team discrepancy
      const internalRows = queue.filter((q) => q.player_id === internalId);
      const internalTeam = internalRows[0]?.team_name ?? "";
      if (internalTeam && ref.team && internalTeam.toLowerCase() !== ref.team.toLowerCase()) {
        return { ref, internalId, internalName, confidence: "MEDIUM", issue: `Team differs: internal="${internalTeam}" ref="${ref.team}"` };
      }
      return { ref, internalId, internalName, confidence: "HIGH", issue: null };
    }

    // Fuzzy: try surname match
    const surname = key.split(" ").at(-1) ?? "";
    const fuzzyMatch = [...nameMap.entries()].find(([n]) => n.includes(surname) || surname.includes(n.split(" ").at(-1) ?? ""));
    if (fuzzyMatch) {
      return { ref, internalId: fuzzyMatch[1], internalName: fuzzyMatch[0], confidence: "LOW", issue: `Fuzzy match only — verify manually` };
    }

    return { ref, internalId: null, internalName: null, confidence: "MISSING", issue: "Player not found in internal data" };
  });
}

function ReferenceCSVPanel({ queue }: { queue: StatsMismatchRow[] }) {
  const [refRows, setRefRows] = useState<RefRow[]>([]);
  const [matches, setMatches] = useState<RefMatch[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseRefCSV(text);
        if (rows.length === 0) { setParseError("No rows parsed — check CSV format."); return; }
        setRefRows(rows);
        setMatches(compareRefToInternal(rows, queue));
        setParseError(null);
      } catch {
        setParseError("Failed to parse CSV.");
      }
    };
    reader.readAsText(file);
  };

  const missingCount  = matches.filter((m) => m.confidence === "MISSING").length;
  const lowCount      = matches.filter((m) => m.confidence === "LOW").length;
  const issueCount    = matches.filter((m) => m.issue !== null).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[11px] text-muted-foreground/70 flex-1">
          Upload an official stats CSV to compare against internal data. Columns: <span className="font-mono">player_name, team, disposals, kicks, handballs, marks, tackles, goals, behinds, hitouts, fantasy_points</span>. Never stored — parsed client-side only.
        </p>
        <Button size="sm" variant="outline" className="text-[11px] gap-2 shrink-0" onClick={() => fileRef.current?.click()}>
          <Download className="h-3 w-3" />
          Upload CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>
      {parseError && (
        <p className="text-[11px] text-red-400/80 bg-red-950/20 border border-red-800/20 rounded px-3 py-2">{parseError}</p>
      )}
      {refRows.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div className="bg-muted/20 rounded-lg px-3 py-2">
              <div className="text-muted-foreground mb-0.5">Reference rows</div>
              <div className="text-lg font-semibold tabular-nums">{refRows.length}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${missingCount > 0 ? "bg-red-950/20" : "bg-muted/20"}`}>
              <div className="text-muted-foreground mb-0.5">Missing internally</div>
              <div className={`text-lg font-semibold tabular-nums ${missingCount > 0 ? "text-red-400" : ""}`}>{missingCount}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${lowCount > 0 ? "bg-amber-950/20" : "bg-muted/20"}`}>
              <div className="text-muted-foreground mb-0.5">Fuzzy match only</div>
              <div className={`text-lg font-semibold tabular-nums ${lowCount > 0 ? "text-amber-400" : ""}`}>{lowCount}</div>
            </div>
            <div className={`rounded-lg px-3 py-2 ${issueCount > 0 ? "bg-amber-950/20" : "bg-muted/20"}`}>
              <div className="text-muted-foreground mb-0.5">With issues</div>
              <div className={`text-lg font-semibold tabular-nums ${issueCount > 0 ? "text-amber-400" : ""}`}>{issueCount}</div>
            </div>
          </div>
          <div className="divide-y divide-border/20 border border-border/30 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
            {matches.map((m, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-[11px] hover:bg-muted/10">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  m.confidence === "HIGH"    ? "bg-emerald-900/30 text-emerald-300" :
                  m.confidence === "MEDIUM"  ? "bg-amber-900/30 text-amber-300" :
                  m.confidence === "LOW"     ? "bg-orange-900/30 text-orange-300" :
                                              "bg-red-900/30 text-red-300"
                }`}>{m.confidence}</span>
                <span className="flex-1 min-w-0 font-medium text-foreground truncate">{m.ref.player_name}</span>
                <span className="text-muted-foreground/60 shrink-0 hidden sm:block">{m.ref.team}</span>
                {m.issue && <span className="text-amber-400/70 truncate hidden md:block max-w-[200px]">{m.issue}</span>}
                {m.internalId && <span className="font-mono text-muted-foreground/40 shrink-0">#{m.internalId}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatsMismatchAuditTab() {
  const [queue, setQueue] = useState<StatsMismatchRow[]>([]);
  const [fingerprints, setFingerprints] = useState<FingerprintConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterSev, setFilterSev] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const copied = useRef(false);
  const [copyLabel, setCopyLabel] = useState("Copy CSV");
  const [showRefPanel, setShowRefPanel] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      supabase.rpc("admin_get_player_stats_mismatch_queue"),
      supabase.rpc("admin_get_fingerprint_conflicts"),
    ]).then(([queueRes, fpRes]) => {
      if (queueRes.error) { setError(queueRes.error.message); return; }
      if (fpRes.error)    { setError(fpRes.error.message); return; }
      setQueue((queueRes.data as StatsMismatchRow[]) ?? []);
      setFingerprints((fpRes.data as FingerprintConflictRow[]) ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = queue.filter((r) => {
    const nameMatch = search === ""
      || r.player_name.toLowerCase().includes(search.toLowerCase())
      || r.team_name.toLowerCase().includes(search.toLowerCase())
      || String(r.player_id).includes(search);
    const sevMatch  = filterSev  === "all" || r.severity       === filterSev;
    const typeMatch = filterType === "all" || r.issue_type     === filterType;
    const catMatch  = filterCat  === "all" || r.issue_category === filterCat;
    return nameMatch && sevMatch && typeMatch && catMatch;
  });

  const issueTypes = [...new Set(queue.map((r) => r.issue_type))].sort();
  const categories = [...new Set(queue.map((r) => r.issue_category))]
    .sort((a, b) => (CATEGORY_ORDER[a] ?? 9) - (CATEGORY_ORDER[b] ?? 9));

  const sevCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  for (const r of queue) {
    sevCounts[r.severity]       = (sevCounts[r.severity] ?? 0) + 1;
    catCounts[r.issue_category] = (catCounts[r.issue_category] ?? 0) + 1;
  }

  const handleCopyCSV = () => {
    if (copied.current) return;
    copied.current = true;
    const header = "player_id,player_name,team_name,severity,issue_category,issue_type,detail,raw_value,cache_value,games_raw,has_override";
    const rows = filtered.map((r) =>
      [r.player_id, `"${r.player_name}"`, `"${r.team_name}"`, r.severity, `"${r.issue_category}"`,
       r.issue_type, `"${r.detail}"`, r.raw_value ?? "", r.cache_value ?? "", r.games_raw, r.has_override].join(",")
    );
    navigator.clipboard.writeText([header, ...rows].join("\n")).catch(() => {});
    setCopyLabel("Copied!");
    setTimeout(() => { copied.current = false; setCopyLabel("Copy CSV"); }, 2500);
  };

  const criticalCount  = sevCounts["CRITICAL"] ?? 0;
  const warningCount   = sevCounts["WARNING"]  ?? 0;
  const reviewCount    = sevCounts["REVIEW"]   ?? 0;
  const identityCount  = catCounts["Identity Mismatch"] ?? 0;
  const pipelineCount  = catCounts["Pipeline Coverage"] ?? 0;
  const projCount      = catCounts["Projection/Data Quality"] ?? 0;

  return (
    <div className="space-y-5">
      {/* Summary cards — row 1: severity */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Critical Issues"     value={loading ? "…" : criticalCount} icon={AlertTriangle} accent={criticalCount > 0 ? "red" : "muted"} />
        <SummaryCard label="Warnings"            value={loading ? "…" : warningCount}  icon={ShieldAlert}   accent={warningCount > 0 ? "amber" : "muted"} />
        <SummaryCard label="Review Items"        value={loading ? "…" : reviewCount}   icon={Eye}           accent={reviewCount > 0 ? "sky" : "muted"} />
        <SummaryCard label="Total Queue"         value={loading ? "…" : queue.length}  icon={BarChart2}     accent="muted" />
      </div>

      {/* Summary cards — row 2: categories */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Identity Mismatches"    value={loading ? "…" : identityCount}              icon={GitMerge}    accent={identityCount > 0 ? "red" : "muted"} />
        <SummaryCard label="Pipeline Coverage"      value={loading ? "…" : pipelineCount}              icon={Database}    accent={pipelineCount > 0 ? "amber" : "muted"} />
        <SummaryCard label="Projection/Data"        value={loading ? "…" : projCount}                  icon={BarChart2}   accent={projCount > 0 ? "sky" : "muted"} />
        <SummaryCard label="Fingerprint Conflicts"  value={loading ? "…" : fingerprints.length}        icon={Fingerprint} accent={fingerprints.length > 0 ? "red" : "muted"} />
      </div>

      {/* Fingerprint conflict panel */}
      {!loading && fingerprints.length > 0 && (
        <FingerprintConflictsCard rows={fingerprints} />
      )}

      {/* Severity filter chips */}
      {!loading && (
        <div className="flex items-center gap-2 flex-wrap">
          {(["CRITICAL", "WARNING", "REVIEW"] as AuditSeverity[]).map((sev) => {
            const n = sevCounts[sev] ?? 0;
            if (n === 0) return null;
            return (
              <button
                key={sev}
                onClick={() => setFilterSev(filterSev === sev ? "all" : sev)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                  AUDIT_SEV_STYLES[sev].chip
                } ${filterSev === sev ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-70 hover:opacity-100"}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${AUDIT_SEV_STYLES[sev].dot}`} />
                {sev} · {n}
              </button>
            );
          })}
          <span className="text-muted-foreground/30 text-[11px] px-1">|</span>
          {categories.map((cat) => {
            const n = catCounts[cat] ?? 0;
            return (
              <button
                key={cat}
                onClick={() => setFilterCat(filterCat === cat ? "all" : cat)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all border ${
                  filterCat === cat
                    ? "border-foreground/40 bg-muted/40 text-foreground"
                    : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                }`}
              >
                {cat} · {n}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search player, team, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-background border border-border/40 rounded-md focus:outline-none focus:ring-1 focus:ring-border/60 text-foreground placeholder:text-muted-foreground/40"
          />
        </div>
        <select
          value={filterSev}
          onChange={(e) => setFilterSev(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All Severities</option>
          {(["CRITICAL", "WARNING", "REVIEW"] as AuditSeverity[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All Issue Types</option>
          {issueTypes.map((t) => (
            <option key={t} value={t}>{STATS_ISSUE_LABEL[t] ?? t}</option>
          ))}
        </select>
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} of {queue.length}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyCSV}
          className="gap-2 ml-auto text-[11px]"
          disabled={filtered.length === 0}
        >
          <Download className="h-3 w-3" />
          {copyLabel}
        </Button>
      </div>

      {/* Queue table */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            Stats Mismatch Queue
            {!loading && (
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">({filtered.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50">Loading stats mismatch queue…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-500/40" />
              <p className="text-sm text-muted-foreground">Failed to load: {error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <CheckCircle className="h-8 w-8 text-emerald-500/40" />
              <p className="text-sm text-muted-foreground">No items match current filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map((item, idx) => (
                <StatsMismatchQueueItem key={`${item.player_id}-${item.issue_type}-${idx}`} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Official stats reference comparison */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <button
            className="w-full flex items-center gap-2 text-left"
            onClick={() => setShowRefPanel((v) => !v)}
          >
            <Database className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm flex-1">Official Stats Reference Comparison</CardTitle>
            <span className="text-[11px] text-muted-foreground/60 bg-muted/30 px-2 py-0.5 rounded">Optional · client-side only</span>
            {showRefPanel
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />}
          </button>
        </CardHeader>
        {showRefPanel && (
          <CardContent className="px-4 pb-4 pt-0">
            <ReferenceCSVPanel queue={queue} />
          </CardContent>
        )}
      </Card>

      {/* Legend */}
      <div className="text-[11px] text-muted-foreground/50 space-y-1 border-t border-border/20 pt-3">
        <p className="font-medium text-muted-foreground/70 mb-1">Issue Categories</p>
        <p><span className={`font-semibold ${CATEGORY_COLOR["Identity Mismatch"]}`}>Identity Mismatch</span> — Same player name under different IDs in the same game, or raw team differs from cache team.</p>
        <p><span className={`font-semibold ${CATEGORY_COLOR["Pipeline Coverage"]}`}>Pipeline Coverage</span> — Player present in only one data source (raw stats or rankings cache).</p>
        <p><span className={`font-semibold ${CATEGORY_COLOR["Projection/Data Quality"]}`}>Projection/Data Quality</span> — Disposal arithmetic errors, projection out of range, season_avg vs projection gap, ruckman hitout anomalies.</p>
        <p className="pt-1 font-medium text-muted-foreground/70">Severity</p>
        <p><span className="text-red-400/70 font-semibold">CRITICAL</span> — Requires immediate investigation. Identity conflicts, arithmetic mismatches, insane projections.</p>
        <p><span className="text-amber-400/70 font-semibold">WARNING</span> — Should be reviewed. Team mismatch, large projection vs season gap.</p>
        <p><span className="text-sky-400/70 font-semibold">REVIEW</span> — Low-priority. Ruckman hitout anomalies, missing from one data source.</p>
        <p className="mt-1 italic">Read-only. No production data is modified by this audit.</p>
      </div>
    </div>
  );
}

// ─── Coverage Audit tab ──────────────────────────────────────────────────────

interface CoverageAuditRow {
  player_id: number;
  player_name: string;
  team_name: string;
  games_played_2026: number;
  latest_seen_week: number;
  exclusion_bucket: string;
  exclusion_reason: string;
  recommended_action: string;
  affected_surfaces: string[];
  should_be_active: boolean;
  blocking_source: string;
  position_group: string | null;
  active: boolean;
  manual_status: string | null;
  has_override: boolean;
  has_form: boolean;
  has_projection: boolean;
}

const BUCKET_META: Record<string, { label: string; color: string; chip: string; dot: string; icon: React.ElementType }> = {
  IDENTITY_BLOCKED:       { label: "Identity Blocked",      color: "text-amber-400/80",  chip: "bg-amber-950/20 text-amber-300/80 border border-amber-800/30",  dot: "bg-amber-400",  icon: GitMerge },
  IDENTITY_UNKNOWN:       { label: "Unknown Identity",      color: "text-red-400/80",    chip: "bg-red-950/20 text-red-300/80 border border-red-800/30",        dot: "bg-red-400",    icon: Fingerprint },
  NOT_IN_PLAYERS_TABLE:   { label: "Not in Players Table",  color: "text-red-400/80",    chip: "bg-red-950/20 text-red-300/80 border border-red-800/30",        dot: "bg-red-400",    icon: XCircle },
  INTENTIONAL_NON_RANKED: { label: "Intentionally Excluded",color: "text-muted-foreground/60", chip: "bg-muted/20 text-muted-foreground/60 border border-border/30", dot: "bg-muted-foreground", icon: CheckCircle },
  INACTIVE_FLAG_LOW_GAMES:{ label: "Inactive · Low Games",  color: "text-sky-400/80",    chip: "bg-sky-950/20 text-sky-300/80 border border-sky-800/30",        dot: "bg-sky-400",    icon: Eye },
  INACTIVE_FLAG_SHOULD_FIX:{ label: "Inactive · Should Fix",color: "text-red-400/80",   chip: "bg-red-950/20 text-red-300/80 border border-red-800/30",        dot: "bg-red-400",    icon: AlertTriangle },
  NO_FORM_DATA_YET:       { label: "No Form Data Yet",      color: "text-sky-400/80",    chip: "bg-sky-950/20 text-sky-300/80 border border-sky-800/30",        dot: "bg-sky-400",    icon: Database },
  PROJECTION_MISSING:     { label: "Projection Missing",    color: "text-amber-400/80",  chip: "bg-amber-950/20 text-amber-300/80 border border-amber-800/30",  dot: "bg-amber-400",  icon: BarChart2 },
  UNKNOWN:                { label: "Unknown",               color: "text-red-400/80",    chip: "bg-red-950/20 text-red-300/80 border border-red-800/30",        dot: "bg-red-400",    icon: AlertTriangle },
};

function CoverageAuditRow({ row }: { row: CoverageAuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const meta = BUCKET_META[row.exclusion_bucket] ?? BUCKET_META.UNKNOWN;

  return (
    <div className={row.should_be_active ? "bg-red-950/5" : ""}>
      <button
        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="shrink-0 mt-0.5">
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
          <span className={`w-1 h-1 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {row.should_be_active && (
          <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-950/30 text-red-300/90 border border-red-800/30">
            Should be active
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground truncate">{row.player_name}</span>
            <span className="text-[11px] text-muted-foreground/60 font-mono shrink-0">#{row.player_id}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
            {row.team_name}
            {row.position_group && <span className="ml-2 text-muted-foreground/50">{row.position_group}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 hidden md:block">
          <div className="text-[11px] text-muted-foreground/60 tabular-nums">{row.games_played_2026}g</div>
          {row.latest_seen_week > 0 && (
            <div className="text-[10px] text-muted-foreground/40">wk {row.latest_seen_week}</div>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-[2.25rem] border-l border-border/30">
          <div className="mt-2 text-[11px] bg-amber-950/20 border border-amber-800/20 rounded px-3 py-2 text-amber-400/90">
            {row.exclusion_reason}
          </div>
          <div className="mt-2 text-[11px] bg-sky-950/20 border border-sky-800/20 rounded px-3 py-2 text-sky-400/90">
            <span className="font-semibold mr-1">Action:</span>{row.recommended_action}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 mt-3 text-[11px]">
            {[
              ["Blocking Source",  row.blocking_source],
              ["Games (2026)",     String(row.games_played_2026)],
              ["Last Week",        row.latest_seen_week > 0 ? `wk ${row.latest_seen_week}` : "unknown"],
              ["Position",         row.position_group ?? "—"],
              ["active flag",      row.active ? "true" : "false"],
              ["manual_status",    row.manual_status ?? "—"],
              ["Has Override",     row.has_override ? "yes" : "no"],
              ["Has Form",         row.has_form ? "yes" : "no"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{k}</span>
                <span className="font-mono text-foreground/80 text-right">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground/40 italic border-t border-border/20 pt-2">
            Read-only audit — no production data is modified by this view.
          </p>
        </div>
      )}
    </div>
  );
}

function CoverageAuditTab() {
  const [rows, setRows]     = useState<CoverageAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterBucket, setFilterBucket] = useState("all");
  const [filterActive, setFilterActive] = useState("all");
  const copied = useRef(false);
  const [copyLabel, setCopyLabel] = useState("Copy CSV");

  useEffect(() => {
    setLoading(true);
    setError(null);
    supabase.rpc("admin_get_raw_without_cache_audit").then(({ data, error: err }) => {
      if (err) { setError(err.message); return; }
      setRows((data as CoverageAuditRow[]) ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    const nameMatch = search === ""
      || r.player_name.toLowerCase().includes(search.toLowerCase())
      || r.team_name.toLowerCase().includes(search.toLowerCase())
      || String(r.player_id).includes(search);
    const bucketMatch = filterBucket === "all" || r.exclusion_bucket === filterBucket;
    const activeMatch = filterActive === "all"
      || (filterActive === "should_be_active" && r.should_be_active)
      || (filterActive === "excluded" && !r.should_be_active);
    return nameMatch && bucketMatch && activeMatch;
  });

  const buckets = [...new Set(rows.map((r) => r.exclusion_bucket))].sort();
  const bucketCounts: Record<string, number> = {};
  for (const r of rows) bucketCounts[r.exclusion_bucket] = (bucketCounts[r.exclusion_bucket] ?? 0) + 1;

  const shouldBeActive    = rows.filter((r) => r.should_be_active).length;
  const identityBlocked   = bucketCounts["IDENTITY_BLOCKED"] ?? 0;
  const unknownIdentity   = (bucketCounts["IDENTITY_UNKNOWN"] ?? 0) + (bucketCounts["NOT_IN_PLAYERS_TABLE"] ?? 0);
  const inactiveFlag      = (bucketCounts["INACTIVE_FLAG_LOW_GAMES"] ?? 0) + (bucketCounts["INACTIVE_FLAG_SHOULD_FIX"] ?? 0);
  const noFormData        = (bucketCounts["NO_FORM_DATA_YET"] ?? 0) + (bucketCounts["PROJECTION_MISSING"] ?? 0);
  const totalMissing      = rows.length;

  const handleCopyCSV = () => {
    if (copied.current) return;
    copied.current = true;
    const header = "player_id,player_name,team_name,games_played_2026,latest_seen_week,exclusion_bucket,blocking_source,should_be_active,recommended_action";
    const csvRows = filtered.map((r) =>
      [r.player_id, `"${r.player_name}"`, `"${r.team_name}"`, r.games_played_2026, r.latest_seen_week,
       r.exclusion_bucket, r.blocking_source, r.should_be_active, `"${r.recommended_action}"`].join(",")
    );
    navigator.clipboard.writeText([header, ...csvRows].join("\n")).catch(() => {});
    setCopyLabel("Copied!");
    setTimeout(() => { copied.current = false; setCopyLabel("Copy CSV"); }, 2500);
  };

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Total Missing"       value={loading ? "…" : totalMissing}    icon={ScanSearch}  accent={totalMissing > 0 ? "amber" : "muted"} />
        <SummaryCard label="Should Be Active"    value={loading ? "…" : shouldBeActive}  icon={AlertTriangle} accent={shouldBeActive > 0 ? "red" : "muted"} />
        <SummaryCard label="Identity Blocked"    value={loading ? "…" : identityBlocked} icon={GitMerge}    accent={identityBlocked > 0 ? "amber" : "muted"} />
        <SummaryCard label="Unresolved Names"    value={loading ? "…" : unknownIdentity} icon={Fingerprint} accent={unknownIdentity > 0 ? "red" : "muted"} />
        <SummaryCard label="Inactive Flag"       value={loading ? "…" : inactiveFlag}    icon={Eye}         accent={inactiveFlag > 0 ? "sky" : "muted"} />
        <SummaryCard label="Pipeline Pending"    value={loading ? "…" : noFormData}      icon={Database}    accent={noFormData > 0 ? "sky" : "muted"} />
      </div>

      {/* Bucket filter chips */}
      {!loading && (
        <div className="flex items-center gap-2 flex-wrap">
          {buckets.map((b) => {
            const meta = BUCKET_META[b] ?? BUCKET_META.UNKNOWN;
            const n = bucketCounts[b] ?? 0;
            return (
              <button
                key={b}
                onClick={() => setFilterBucket(filterBucket === b ? "all" : b)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all ${meta.chip} ${
                  filterBucket === b ? "ring-2 ring-offset-1 ring-offset-background ring-border/60" : "opacity-70 hover:opacity-100"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label} · {n}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search player, team, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-background border border-border/40 rounded-md focus:outline-none focus:ring-1 focus:ring-border/60 text-foreground placeholder:text-muted-foreground/40"
          />
        </div>
        <select
          value={filterBucket}
          onChange={(e) => setFilterBucket(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All Buckets</option>
          {buckets.map((b) => (
            <option key={b} value={b}>{BUCKET_META[b]?.label ?? b}</option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All</option>
          <option value="should_be_active">Should be active</option>
          <option value="excluded">Defensibly excluded</option>
        </select>
        <span className="text-[11px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyCSV}
          className="gap-2 ml-auto text-[11px]"
          disabled={filtered.length === 0}
        >
          <Download className="h-3 w-3" />
          {copyLabel}
        </Button>
      </div>

      {/* Table */}
      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScanSearch className="h-4 w-4 text-muted-foreground" />
            Raw-Without-Cache Players
            {!loading && (
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">({filtered.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50">Loading coverage audit…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-500/40" />
              <p className="text-sm text-muted-foreground">Failed to load: {error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <CheckCircle className="h-8 w-8 text-emerald-500/40" />
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 ? "All raw players are in the rankings cache" : "No items match current filters"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {filtered.map((row) => (
                <CoverageAuditRow key={row.player_id} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="text-[11px] text-muted-foreground/50 space-y-1 border-t border-border/20 pt-3">
        <p className="font-medium text-muted-foreground/70 mb-1">Exclusion Buckets</p>
        {Object.entries(BUCKET_META).map(([key, meta]) => (
          <p key={key}>
            <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
            {" — "}
            {key === "IDENTITY_BLOCKED"        && "Intentional duplicate prevention. Primary ID is canonical."}
            {key === "IDENTITY_UNKNOWN"        && "Placeholder name — provider has not resolved this player's identity."}
            {key === "NOT_IN_PLAYERS_TABLE"    && "player_id was never seeded into afl.players."}
            {key === "INTENTIONAL_NON_RANKED"  && "Manually marked delisted or retired — excluded by policy."}
            {key === "INACTIVE_FLAG_LOW_GAMES" && "active=false with < 5 games — below auto-reactivation threshold."}
            {key === "INACTIVE_FLAG_SHOULD_FIX"&& "active=false despite ≥ 5 games — missed by reactivation sweep."}
            {key === "NO_FORM_DATA_YET"        && "Too new or pipeline hasn't run yet — auto-resolves on next pipeline run."}
            {key === "PROJECTION_MISSING"      && "Form exists but no projection row — re-run bootstrap migration."}
            {key === "UNKNOWN"                 && "Uncategorised — manual investigation required."}
          </p>
        ))}
        <p className="mt-1 italic">Read-only. No production data is modified by this audit.</p>
      </div>
    </div>
  );
}

// ─── Placeholder Guard tab ──────────────────────────────────────────────────

interface PlaceholderRow {
  player_id: number;
  player_name: string;
  team_name: string;
  position: string | null;
  games_played: number;
  season_avg: number | null;
  projection: number | null;
  price: number;
  jumper_number: number | null;
}

function placeholderSeverity(games: number): AuditSeverity {
  if (games >= 5) return "CRITICAL";
  if (games >= 3) return "WARNING";
  return "REVIEW";
}

function PlaceholderGuardTab() {
  const [rows, setRows] = useState<PlaceholderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSev, setFilterSev] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    supabase
      .rpc("admin_get_placeholder_identities")
      .then(({ data }) => setRows((data as PlaceholderRow[]) ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    const sev = placeholderSeverity(r.games_played ?? 0);
    const sevMatch = filterSev === "all" || sev === filterSev;
    const nameMatch = search === ""
      || r.player_name.toLowerCase().includes(search.toLowerCase())
      || r.team_name.toLowerCase().includes(search.toLowerCase())
      || String(r.player_id).includes(search);
    return sevMatch && nameMatch;
  });

  const sevCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const sev = placeholderSeverity(r.games_played ?? 0);
    acc[sev] = (acc[sev] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Alert banner */}
      <div className="rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3">
        <div className="flex items-start gap-3">
          <EyeOff className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-red-300">
              {rows.length} Provider Placeholder Identities — Hidden from All Public Surfaces
            </p>
            <p className="text-[11px] text-red-300/70 leading-relaxed">
              These players have real 2026 stats and projections but the data provider never sent a real name.
              They are classified as <strong>C (UNRESOLVED)</strong> — no DB evidence exists to confirm any identity.
              All public views, canonical views, and RPCs have been patched with{" "}
              <code className="font-mono bg-red-950/40 px-1 rounded">player_name NOT LIKE 'Player#%'</code>{" "}
              guards. Admin tables retain full access for investigation.
            </p>
            <p className="text-[11px] text-red-300/50 mt-1">
              To resolve: obtain real player names from the provider, then add an entry to{" "}
              <code className="font-mono bg-red-950/40 px-1 rounded">afl.player_identity_overrides</code>.
            </p>
          </div>
        </div>
      </div>

      {/* Severity summary chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {(["CRITICAL", "WARNING", "REVIEW"] as AuditSeverity[]).map((sev) => {
          const n = sevCounts[sev] ?? 0;
          if (n === 0) return null;
          return (
            <button
              key={sev}
              onClick={() => setFilterSev(filterSev === sev ? "all" : sev)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${
                AUDIT_SEV_STYLES[sev].chip
              } ${filterSev === sev ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-80 hover:opacity-100"}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${AUDIT_SEV_STYLES[sev].dot}`} />
              {sev === "CRITICAL" ? "CRITICAL (5+ games)" : sev === "WARNING" ? "WARNING (3-4 games)" : "REVIEW (1-2 games)"}
              {" · "}{n}
            </button>
          );
        })}
        <span className="text-[11px] text-muted-foreground ml-auto">{rows.length} total placeholder IDs</span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="Search by team or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-background border border-border/40 rounded-md focus:outline-none focus:ring-1 focus:ring-border/60 text-foreground placeholder:text-muted-foreground/40"
          />
        </div>
        <select
          value={filterSev}
          onChange={(e) => setFilterSev(e.target.value)}
          className="text-[11px] bg-background border border-border/40 rounded-md px-2 py-1.5 text-foreground focus:outline-none"
        >
          <option value="all">All Severities</option>
          <option value="CRITICAL">CRITICAL (5+ games)</option>
          <option value="WARNING">WARNING (3–4 games)</option>
          <option value="REVIEW">REVIEW (1–2 games)</option>
        </select>
        <span className="text-[11px] text-muted-foreground">{filtered.length} shown</span>
      </div>

      <Card className="border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            Placeholder Identity Registry
            {!loading && (
              <span className="ml-1 text-[11px] text-muted-foreground font-normal">({filtered.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground/50">Loading placeholder rows…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <CheckCircle className="h-8 w-8 text-emerald-500/40" />
              <p className="text-sm text-muted-foreground">No placeholder rows match current filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Severity</th>
                    <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Provider ID</th>
                    <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Team</th>
                    <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden sm:table-cell">Jumper #</th>
                    <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Games</th>
                    <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden md:table-cell">Season Avg</th>
                    <th className="text-right px-3 py-2.5 text-muted-foreground font-medium hidden md:table-cell">Projection</th>
                    <th className="text-center px-3 py-2.5 text-muted-foreground font-medium">Public</th>
                    <th className="text-left px-3 py-2.5 text-muted-foreground font-medium hidden lg:table-cell">Next Step</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => {
                    const sev = placeholderSeverity(row.games_played ?? 0);
                    const sevStyle = AUDIT_SEV_STYLES[sev];
                    return (
                      <tr
                        key={row.player_id}
                        className={`border-b border-border/20 ${
                          sev === "CRITICAL" ? "bg-red-950/10" :
                          sev === "WARNING"  ? "bg-amber-950/5" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${sevStyle.chip}`}>
                            <span className={`w-1 h-1 rounded-full ${sevStyle.dot}`} />
                            {sevStyle.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground/80">
                          #{row.player_id}
                        </td>
                        <td className="px-3 py-2.5 text-foreground font-medium">{row.team_name}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {row.jumper_number != null ? `#${row.jumper_number}` : "—"}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                          sev === "CRITICAL" ? "text-red-300" :
                          sev === "WARNING"  ? "text-amber-300" : "text-sky-300"
                        }`}>
                          {row.games_played}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {row.season_avg != null ? Number(row.season_avg).toFixed(1) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                          {row.projection != null ? Number(row.projection).toFixed(1) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/80 font-medium bg-emerald-950/20 border border-emerald-800/20 rounded px-1.5 py-0.5">
                            <EyeOff className="h-2.5 w-2.5" />
                            Hidden
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground/60 hidden lg:table-cell">
                          Add to <code className="font-mono text-[10px] bg-muted/30 px-1 rounded">player_identity_overrides</code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="text-[11px] text-muted-foreground/50 space-y-1 border-t border-border/20 pt-3">
        <p className="font-medium text-muted-foreground/70 mb-1">Severity Thresholds</p>
        <p><span className="text-red-400/70 font-semibold">CRITICAL (5+ games)</span> — High-volume unknown identity. Provider data gap is significant. Escalate to provider for name resolution.</p>
        <p><span className="text-amber-400/70 font-semibold">WARNING (3–4 games)</span> — Moderate exposure. Player has enough games to affect projections. Needs resolution soon.</p>
        <p><span className="text-sky-400/70 font-semibold">REVIEW (1–2 games)</span> — Low volume. May be a new player or injured player with sparse data. Monitor.</p>
        <p className="pt-1">All rows are blocked at <code className="font-mono bg-muted/30 px-1 rounded">player_name NOT LIKE 'Player#%'</code> in all public views and RPCs.
          Raw stats are preserved intact. No production data is modified by this view.</p>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AdminPlayerIdentity() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("anomalies");

  // Anomalies tab state
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [anomalyRes, logRes] = await Promise.all([
        supabase
          .from("player_identity_anomalies")
          .select("*")
          .eq("status", "open")
          .order("detected_at", { ascending: false }),
        supabase
          .from("player_identity_sync_log")
          .select("id, run_at, players_inserted, players_updated, validation_status, triggered_by, notes")
          .order("run_at", { ascending: false })
          .limit(10),
      ]);
      if (anomalyRes.data) setAnomalies(anomalyRes.data as Anomaly[]);
      if (logRes.data) setSyncLogs(logRes.data as SyncLog[]);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefreshAnomalies = useCallback(async () => {
    setRefreshing(true);
    try {
      await supabase.rpc("refresh_player_identity_anomalies");
      await loadData();
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  const handleRunValidation = useCallback(async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const { data } = await supabase.rpc("validate_afl_player_identity");
      if (data) setValidationResult(data as ValidationResult);
    } finally {
      setValidating(false);
    }
  }, []);

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const highCount     = anomalies.filter((a) => a.severity === "high").length;
  const placeholders  = anomalies.filter((a) =>
    a.anomaly_type === "placeholder" || a.anomaly_type === "high_value_placeholder"
  ).length;
  const duplicates    = anomalies.filter((a) => a.anomaly_type === "duplicate_name").length;

  const grouped = (["critical", "high", "medium", "low"] as Severity[]).map((sev) => ({
    severity: sev,
    items: anomalies
      .filter((a) => a.severity === sev)
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]),
  }));

  const totalOpen = anomalies.length;

  const tabs: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
    { id: "anomalies",        label: "Open Anomalies",      icon: Fingerprint },
    { id: "team_audit",       label: "Team Coverage Audit", icon: Shield },
    { id: "review_queue",     label: "Review Queue",        icon: ClipboardList },
    { id: "stats_mismatch",   label: "Stats Mismatch Audit", icon: BarChart2 },
    { id: "coverage_audit",   label: "Coverage Audit",      icon: ScanSearch },
    { id: "placeholder_guard", label: "Placeholder IDs",    icon: EyeOff },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Player Identity"
        description="Anomaly detection, team-by-team audit, and manual review queue"
        icon={Fingerprint}
      />

      {/* Tab nav */}
      <div className="flex items-center gap-1 border-b border-border/40 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
            {id === "anomalies" && totalOpen > 0 && !loading && (
              <span className="ml-1 bg-red-500/20 text-red-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                {totalOpen}
              </span>
            )}
            {id === "placeholder_guard" && (
              <span className="ml-1 bg-red-500/20 text-red-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-full animate-pulse">
                !
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Open Anomalies ── */}
      {activeTab === "anomalies" && (
        <div className="space-y-6">
          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshAnomalies}
              disabled={refreshing || loading}
              className="gap-2"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing…" : "Refresh Anomalies"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunValidation}
              disabled={validating}
              className="gap-2"
            >
              <ShieldAlert className={`h-3.5 w-3.5 ${validating ? "animate-pulse" : ""}`} />
              {validating ? "Validating…" : "Run Identity Validation"}
            </Button>
            {lastRefreshed && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 ml-auto">
                <Clock className="h-3 w-3" />
                Last loaded {lastRefreshed.toLocaleTimeString("en-AU", { timeStyle: "short" })}
              </span>
            )}
          </div>

          {/* Validation result */}
          {validationResult && (
            <Card className="border-border/50">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                  Identity Validation Result
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <div className="flex items-center gap-4 mb-3">
                  <span className={`text-sm font-semibold ${
                    validationResult.status === "ok" ? "text-emerald-400" : "text-amber-400"
                  }`}>
                    {validationResult.status?.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {validationResult.issue_count} issue{validationResult.issue_count !== 1 ? "s" : ""} —{" "}
                    {validationResult.fatal_count} fatal, {validationResult.warn_count} warnings
                  </span>
                </div>
                {validationResult.issues?.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {validationResult.issues.map((issue, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground border-b border-border/20 pb-1">
                        <span className="font-mono text-amber-400/80 mr-2">[{issue.type}]</span>
                        {issue.message}
                        {issue.player_id && (
                          <span className="ml-2 font-mono text-muted-foreground/60">#{issue.player_id}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Critical Issues"  value={loading ? "…" : criticalCount} icon={AlertTriangle} accent={criticalCount > 0 ? "red" : "muted"} />
            <SummaryCard label="High Priority"    value={loading ? "…" : highCount}     icon={ShieldAlert}  accent={highCount > 0 ? "amber" : "muted"} />
            <SummaryCard label="Placeholders"     value={loading ? "…" : placeholders}  icon={Users}        accent={placeholders > 0 ? "sky" : "muted"} />
            <SummaryCard label="Duplicate Names"  value={loading ? "…" : duplicates}    icon={ClipboardList} accent={duplicates > 0 ? "amber" : "muted"} />
          </div>

          {/* Anomaly table */}
          <Card className="border-border/50">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Fingerprint className="h-4 w-4 text-muted-foreground" />
                Open Anomalies
                {!loading && (
                  <span className="ml-1 text-[11px] text-muted-foreground font-normal">({totalOpen})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground/50">Loading anomalies…</span>
                </div>
              ) : totalOpen === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <CheckCircle className="h-8 w-8 text-emerald-500/40" />
                  <p className="text-sm text-muted-foreground">No open anomalies detected</p>
                  <p className="text-[11px] text-muted-foreground/60">
                    Click "Refresh Anomalies" to run detection
                  </p>
                </div>
              ) : (
                <div className="px-4 pb-4 pt-2">
                  {grouped.map(({ severity, items }) => (
                    <SeverityGroup key={severity} severity={severity} anomalies={items} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent sync logs */}
          <Card className="border-border/50">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Recent Identity Sync Runs
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {syncLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">No sync logs found</p>
              ) : (
                <div className="space-y-0 divide-y divide-border/30">
                  {syncLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground font-medium">
                          {new Date(log.run_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                        {log.notes && (
                          <div className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{log.notes}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground font-mono">
                        {log.players_inserted != null && <span>+{log.players_inserted} ins</span>}
                        {log.players_updated  != null && <span>{log.players_updated} upd</span>}
                        {log.validation_status && (
                          <span className={log.validation_status === "ok" ? "text-emerald-400" : "text-amber-400"}>
                            {log.validation_status}
                          </span>
                        )}
                        {log.triggered_by && (
                          <span className="text-muted-foreground/50">{log.triggered_by}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tab: Team Coverage Audit ── */}
      {activeTab === "team_audit" && <TeamAuditTab />}

      {/* ── Tab: Review Queue ── */}
      {activeTab === "review_queue" && <ReviewQueueTab />}

      {/* ── Tab: Stats Mismatch Audit ── */}
      {activeTab === "stats_mismatch" && <StatsMismatchAuditTab />}

      {/* ── Tab: Coverage Audit ── */}
      {activeTab === "coverage_audit" && <CoverageAuditTab />}

      {/* ── Tab: Placeholder Guard ── */}
      {activeTab === "placeholder_guard" && <PlaceholderGuardTab />}
    </div>
  );
}
