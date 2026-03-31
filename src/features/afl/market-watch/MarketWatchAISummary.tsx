import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MWAISummary } from "./types";

interface Props {
  season: number | null;
  roundNumber: number | null;
}

export function MarketWatchAISummary({ season, roundNumber }: Props) {
  const [data, setData] = useState<MWAISummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: rows } = await supabase
          .from("v_market_watch_summary")
          .select("*")
          .maybeSingle();
        if (!cancelled) setData(rows as MWAISummary | null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [season, roundNumber]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      await fetch(`${supabaseUrl}/functions/v1/generate-market-watch-summary`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
      });
      const { data: rows } = await supabase
        .from("v_market_watch_summary")
        .select("*")
        .maybeSingle();
      setData(rows as MWAISummary | null);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-3 w-3 rounded-full bg-white/10 animate-pulse" />
          <div className="h-3 w-36 rounded bg-white/10 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-white/[0.05] animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-white/[0.05] animate-pulse" />
          <div className="h-3 w-4/6 rounded bg-white/[0.05] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mb-6 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-white/20" />
          <p className="text-sm text-white/35">Market Watch AI Insight not yet generated for this round.</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/15 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Generating..." : "Generate"}
        </button>
      </div>
    );
  }

  const generatedDate = new Date(data.generated_at).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className="mb-6 rounded-xl border border-[#F5C84C]/20 bg-gradient-to-br from-[#F5C84C]/[0.05] to-transparent overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-5 py-4 gap-3"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-[#F5C84C] shrink-0" />
          <div className="text-left">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#F5C84C]/70">
              Market Watch AI Insight
            </p>
            <p className="text-[10px] text-white/25 mt-0.5">
              Round {data.round_number} · {generatedDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
            disabled={generating}
            title="Regenerate"
            className="flex items-center gap-1 text-[10px] text-white/20 hover:text-white/50 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
          </button>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-white/25" />
            : <ChevronDown className="h-3.5 w-3.5 text-white/25" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-[#F5C84C]/[0.08]">
          <p className="text-sm text-white/70 leading-relaxed pt-4">
            {data.summary}
          </p>
        </div>
      )}
    </div>
  );
}
