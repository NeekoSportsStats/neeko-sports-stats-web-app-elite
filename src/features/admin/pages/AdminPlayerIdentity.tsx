import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RefreshCw,
  Fingerprint,
  TriangleAlert as AlertTriangle,
  CircleCheck as CheckCircle,
  ShieldAlert,
  Users,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Clock,
  Search,
  Download,
  Shield,
  GitMerge,
  Database,
  Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AdminPageHeader } from "../shared/AdminPageHeader";

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low";
type AuditSeverity = "CRITICAL" | "WARNING" | "REVIEW" | "LOW" | "PASS";
type AnomalyStatus = "open" | "resolved" | "ignored";
type ActiveTab = "anomalies" | "team_audit" | "review_queue";

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
    { id: "anomalies",   label: "Open Anomalies",    icon: Fingerprint },
    { id: "team_audit",  label: "Team Coverage Audit", icon: Shield },
    { id: "review_queue", label: "Review Queue",     icon: ClipboardList },
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
    </div>
  );
}
