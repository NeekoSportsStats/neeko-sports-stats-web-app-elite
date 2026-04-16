export function fmtPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(3)}M`;
  }

  return `${sign}$${Math.floor(abs / 1000)}K`;
}

export function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}

export function signalColor(signal: string | null): string {
  const s = (signal ?? "").toUpperCase();
  if (s === "START" || s === "SMASH_START") return "text-green-400 bg-green-400/10 border-green-400/25";
  if (s === "SIT" || s === "STRONG_SIT")     return "text-red-400 bg-red-400/10 border-red-400/25";
  return "text-white/40 bg-white/5 border-white/10";
}

export function momentumColor(v: number | null): string {
  if (v == null) return "text-white/40";
  if (v > 15)  return "text-green-400";
  if (v > 0)   return "text-green-300";
  if (v > -15) return "text-yellow-400";
  return "text-red-400";
}

export function riskColor(v: number | null): string {
  if (v == null) return "text-white/40";
  if (v >= 70) return "text-red-400";
  if (v >= 50) return "text-yellow-400";
  return "text-green-400";
}

export function positionBadge(pos: string | null): string {
  const p = pos?.toUpperCase() ?? "";
  if (p === "DEF") return "bg-white/[0.08] text-white/70 border-white/10";
  if (p === "MID") return "bg-[#F5C84C]/15 text-[#F5C84C] border-[#F5C84C]/20";
  if (p === "FWD") return "bg-orange-400/15 text-orange-300 border-orange-400/20";
  if (p === "RUC") return "bg-teal-400/15 text-teal-300 border-teal-400/20";
  return "bg-white/5 text-white/40 border-white/10";
}

export function fmtPriceChange(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";

  const abs = Math.abs(n);
  let formatted: string;

  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(3)}M`;
  } else {
    formatted = `$${Math.floor(abs / 1000)}K`;
  }

  return n >= 0 ? `+${formatted}` : `-${formatted}`;
}

export function priceChangeColor(v: number | null): string {
  if (v == null) return "text-white/40";
  if (v > 5000)  return "text-green-400";
  if (v > 0)     return "text-green-300";
  if (v > -5000) return "text-yellow-400";
  return "text-red-400";
}

export function confidenceBadge(v: number): string {
  if (v >= 67) return "text-green-400 bg-green-400/10 border-green-400/25";
  if (v >= 50) return "text-[#F5C84C] bg-[#F5C84C]/10 border-[#F5C84C]/25";
  return "text-orange-400 bg-orange-400/10 border-orange-400/25";
}

export function confidenceLabel(v: number): string {
  if (v >= 80) return "High confidence";
  if (v >= 60) return "Strong";
  return "Moderate";
}

export const FREE_VISIBLE = 3;

export function calculateValueRank(players: any[], currentPlayer: any): { rank: number; percentile: number } {
  const validPlayers = players
    .filter(p => p.edge != null)
    .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));

  const rank = validPlayers.findIndex(p => p.player_id === currentPlayer.player_id) + 1;
  const percentile = rank > 0 ? Math.round((1 - (rank / validPlayers.length)) * 100) : 0;

  return { rank, percentile };
}

export function getValueRankLabel(percentile: number): string {
  if (percentile >= 90) return "Top 10%";
  if (percentile >= 75) return "Top 25%";
  if (percentile >= 50) return "Above avg";
  if (percentile >= 25) return "Below avg";
  return "Bottom 25%";
}

export function getValueRankColor(percentile: number): string {
  if (percentile >= 75) return "text-green-400";
  if (percentile >= 50) return "text-white/60";
  return "text-red-400";
}

export function generateSmartWhy(player: any): string {
  const short = (player.why ?? '').trim();
  if (short) return short;

  const edge = Math.round(player.edge ?? 0);
  const projection = Math.round(player.projection ?? 0);
  const edgeStr = edge > 0 ? `+${edge}` : `${edge}`;
  return `${edgeStr} edge · ${projection} pts projected`;
}

export function getConsistencySignal(player: any): { label: string; color: string } | null {
  const consistency = player.consistency;

  if (consistency === null || consistency === undefined) return null;

  if (consistency > 75) {
    return { label: "Consistent", color: "text-green-400" };
  }

  if (consistency < 40) {
    return { label: "Boom/Bust", color: "text-orange-400" };
  }

  return { label: "Volatile", color: "text-yellow-400" };
}

const BUY_NEGATIVE_PHRASES = [
  'overpriced', 'value deficit', 'downside risk', 'too high compared to his projection',
  'too high compared to their projection', 'exceeds his projection', 'exceeds their projection',
  'significant downside', 'price is too high', 'clear value deficit',
  'signaling a clear value', 'significant value deficit', 'confirming significant',
];

const SELL_POSITIVE_PHRASES = [
  'aligns well', 'closely aligns', 'stable scoring profile', 'no strong edge',
  'defined scoring range', 'aligned with his price', 'aligned with their price',
  'aligns closely', 'reinforcing a hold', 'scoring profile with a defined',
];

export function isSummaryAligned(summary: string, category: string): boolean {
  const lower = summary.toLowerCase();
  const cat = (category ?? '').toUpperCase();
  if (cat === 'START' || cat === 'SMASH_START' || cat === 'TARGET') {
    return !BUY_NEGATIVE_PHRASES.some(phrase => lower.includes(phrase));
  }
  if (cat === 'SIT' || cat === 'STRONG_SIT' || cat === 'AVOID') {
    return !SELL_POSITIVE_PHRASES.some(phrase => lower.includes(phrase));
  }
  return true;
}
