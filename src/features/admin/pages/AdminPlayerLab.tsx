import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  RefreshCw, DollarSign, Target, TrendingUp, Users,
  Search, Check, X,
} from "lucide-react";
import { CreditCard as Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSectionIntro } from "@/features/admin/shared/AdminExplain";
import { FantasyPricesTab } from "@/features/admin/price-ingest/FantasyPricesTab";
import { NameResolverTab } from "@/features/admin/price-ingest/NameResolverTab";
import { PriceChangeDebugTab } from "@/features/admin/price-ingest/PriceChangeDebugTab";
import { FantasyPlayerMatchingTab } from "@/features/admin/price-ingest/FantasyPlayerMatchingTab";

import { PlayerExplorerTable } from "../player-lab/components/PlayerExplorerTable";
import { AccuracyTabContent } from "../player-lab/components/AccuracyTabContent";
import { SignalsTabContent } from "../player-lab/components/SignalsTabContent";
import { fmtNum, fmtPrice, RecoBadge, SortIcon, DataWarningBanner } from "../player-lab/components/SharedUI";
import type { PriceRow, SortDir } from "../player-lab/types";

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = "explorer" | "accuracy" | "pricing" | "signals";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "explorer", label: "Player Explorer", icon: Users },
  { id: "accuracy", label: "Accuracy",        icon: Target },
  { id: "pricing",  label: "Pricing",         icon: DollarSign },
  { id: "signals",  label: "Signals",         icon: TrendingUp },
];

// ─── Price Full Table ─────────────────────────────────────────────────────────

type PriceFilter = "all" | "risers" | "fallers" | "value_high" | "projection_high" | "edited";

const PRICE_FILTERS: { id: PriceFilter; label: string }[] = [
  { id: "all",             label: "All" },
  { id: "risers",          label: "Price Risers" },
  { id: "fallers",         label: "Price Fallers" },
  { id: "value_high",      label: "High Value (>2.5)" },
  { id: "projection_high", label: "Proj >90" },
  { id: "edited",          label: "Manually Edited" },
];

function PriceFullTable() {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [editedIds, setEditedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [sortCol, setSortCol] = useState<string>("price_change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [hideOut, setHideOut] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("v_player_price_full").select("*").limit(600);
    console.log("Price full table:", data?.length, "rows | error:", error);
    setRows((data as PriceRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    let res = rows;
    if (hideOut) res = res.filter(r => r.status !== "OUT");
    if (search) res = res.filter(r => r.player_name?.toLowerCase().includes(search.toLowerCase()) || r.team?.toLowerCase().includes(search.toLowerCase()));
    if (priceFilter === "risers")          res = res.filter(r => (r.price_change ?? 0) > 0);
    if (priceFilter === "fallers")         res = res.filter(r => (r.price_change ?? 0) < 0);
    if (priceFilter === "value_high")      res = res.filter(r => (r.value_score ?? 0) > 2.5);
    if (priceFilter === "projection_high") res = res.filter(r => (r.projection_final ?? 0) > 90);
    if (priceFilter === "edited")          res = res.filter(r => editedIds.has(r.player_id));
    return [...res].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortCol] as number ?? 0;
      const bv = (b as unknown as Record<string, unknown>)[sortCol] as number ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, search, priceFilter, sortCol, sortDir, editedIds]);

  function handleSort(col: string) {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function startEdit(r: PriceRow) {
    setEditingId(r.player_id);
    setEditValue(String(r.current_price ?? ""));
  }

  async function saveEdit(playerId: number) {
    const newPrice = parseInt(editValue.replace(/[^0-9]/g, ""), 10);
    if (isNaN(newPrice) || newPrice <= 0) { setEditingId(null); return; }
    setSaving(true);
    const { error } = await supabase
      .schema("afl" as never)
      .from("player_prices")
      .update({ price: newPrice, updated_at: new Date().toISOString() })
      .eq("player_id", playerId);
    if (error) {
      console.error("Price update failed:", error);
    } else {
      setRows(prev => prev.map(r => r.player_id === playerId ? { ...r, current_price: newPrice } : r));
      setEditedIds(prev => new Set([...prev, playerId]));
    }
    setSaving(false);
    setEditingId(null);
  }

  const warnings: string[] = [];
  if (!loading && rows.length > 0) {
    const changedCount = rows.filter(r => (r.price_change ?? 0) !== 0).length;
    if (changedCount === 0) {
      warnings.push("No price changes detected. Prices may not have been updated yet this week.");
    }
  }

  const cols = [
    { key: "player_name",      label: "Player" },
    { key: "team",             label: "Team" },
    { key: "position",         label: "Pos" },
    { key: "status",           label: "Status" },
    { key: "current_price",    label: "Price" },
    { key: "prev_price",       label: "Last Price" },
    { key: "price_change",     label: "Δ Price" },
    { key: "price_change_pct", label: "Δ %" },
    { key: "value_score",      label: "Value" },
    { key: "projection_final", label: "Proj" },
    { key: "neeko_rating",     label: "Rating" },
    { key: "recommendation_short", label: "Reco" },
    { key: "edit",             label: "Edit" },
  ];

  return (
    <div className="space-y-4">
      <DataWarningBanner warnings={warnings} />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5 flex-wrap">
          {PRICE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setPriceFilter(f.id)}
              className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${
                priceFilter === f.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none w-40"
          />
        </div>
        <button
          onClick={() => setHideOut(v => !v)}
          className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${
            hideOut
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-border/50 text-muted-foreground hover:text-foreground"
          }`}
        >
          {hideOut ? "Hiding OUT" : "Show OUT"}
        </button>
        <Button size="sm" variant="outline" onClick={fetchData}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <span className="text-[11px] text-muted-foreground">{filtered.length} players</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {cols.map(c => (
                  <th key={c.key} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {c.key !== "edit" ? (
                      <button onClick={() => handleSort(c.key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                        {c.label} <SortIcon col={c.key} activeCol={sortCol} dir={sortDir} />
                      </button>
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={cols.length} className="text-center py-10 text-muted-foreground">No price data</td></tr>
              ) : filtered.map(r => {
                const delta = r.price_change ?? 0;
                const isEditing = editingId === r.player_id;
                const wasEdited = editedIds.has(r.player_id);
                return (
                  <tr key={r.player_id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="px-2 py-2 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {r.player_name}
                        {wasEdited && (
                          <span className="text-[9px] border border-sky-500/30 bg-sky-500/10 text-sky-400 px-1 py-0.5 rounded font-semibold">MANUAL EDIT</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{r.team}</td>
                    <td className="px-2 py-2 text-muted-foreground font-mono">{r.position}</td>
                    <td className="px-2 py-2">
                      {r.status ? (
                        <span className={`inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          r.status === "OUT" ? "bg-red-500/15 text-red-400 border-red-500/25"
                          : r.status === "TEST" ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                        }`}>{r.status}</span>
                      ) : (
                        <span className="text-muted-foreground/40 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums font-semibold">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(r.player_id); if (e.key === "Escape") setEditingId(null); }}
                          className="w-24 px-1.5 py-0.5 text-xs bg-background border border-ring rounded focus:outline-none font-mono"
                        />
                      ) : fmtPrice(r.current_price)}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{fmtPrice(r.prev_price)}</td>
                    <td className={`px-2 py-2 tabular-nums font-semibold ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {delta !== 0 ? (delta > 0 ? "+" : "") + fmtPrice(delta) : "—"}
                    </td>
                    <td className={`px-2 py-2 tabular-nums ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {delta !== 0 ? (delta > 0 ? "+" : "") + fmtNum(r.price_change_pct, 1) + "%" : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-amber-400">{fmtNum(r.value_score, 2)}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtNum(r.projection_final, 0)}</td>
                    <td className="px-2 py-2 tabular-nums">{fmtNum(r.neeko_rating, 0)}</td>
                    <td className="px-2 py-2"><RecoBadge color={r.recommendation_color} short={r.recommendation_short} /></td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button onClick={() => saveEdit(r.player_id)} disabled={saving} className="p-1 text-emerald-400 hover:text-emerald-300">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(r)} className="p-1 text-muted-foreground hover:text-foreground">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Pricing Tab ──────────────────────────────────────────────────────────────

type PricingSubTab = "full_table" | "ingest" | "resolver" | "changes" | "matching";

const PRICING_TABS: { id: PricingSubTab; label: string }[] = [
  { id: "full_table", label: "Full Price Table" },
  { id: "ingest",     label: "Price Ingest" },
  { id: "resolver",   label: "Name Resolver" },
  { id: "changes",    label: "Price Changes" },
  { id: "matching",   label: "Player Matching" },
];

function PricingTab() {
  const [sub, setSub] = useState<PricingSubTab>("full_table");
  return (
    <div>
      <AdminSectionIntro
        description="Full price intelligence table with inline editing, delta tracking, and filters. Plus ingestion tools for new price data."
        detail="Full Price Table = v_player_price_full (current + historical delta). Price Ingest = paste AFL Fantasy CSV. Name Resolver = fix unmatched names. Player Matching = fantasy_player_market table."
      />
      <div className="flex gap-2 mb-5 border-b border-border">
        {PRICING_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              sub === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === "full_table" && <PriceFullTable />}
      {sub === "ingest"     && <FantasyPricesTab />}
      {sub === "resolver"   && <NameResolverTab />}
      {sub === "changes"    && <PriceChangeDebugTab />}
      {sub === "matching"   && <FantasyPlayerMatchingTab />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPlayerLab() {
  const [tab, setTab] = useState<Tab>("explorer");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Player Lab</h1>
        <p className="text-muted-foreground text-sm mt-1">Intelligence terminal — projection debugging, signal analysis, accuracy diagnostics, and price inspection.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === "explorer" && <PlayerExplorerTable />}
        {tab === "accuracy" && <AccuracyTabContent />}
        {tab === "pricing"  && <PricingTab />}
        {tab === "signals"  && <SignalsTabContent />}
      </div>
    </div>
  );
}
