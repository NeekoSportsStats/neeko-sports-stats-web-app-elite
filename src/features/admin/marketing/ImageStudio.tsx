import { useState, useRef, useCallback } from "react";
import useMarketingPlayers from "./useMarketingPlayers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toPng } from "html-to-image";
import { Search, ChevronDown, RefreshCw, Download, Upload, Image as ImageIcon, Type, ChartBar as BarChart2 } from "lucide-react";

type Template = "buy" | "sell" | "breakout" | "captain" | "trap" | "value";
type Size = "square" | "portrait" | "landscape";

const TEMPLATES: { id: Template; label: string; emoji: string; bg: string; accent: string }[] = [
  { id: "buy",      label: "Buy",      emoji: "📈", bg: "from-emerald-900 to-emerald-700",  accent: "#10b981" },
  { id: "sell",     label: "Sell",     emoji: "📉", bg: "from-red-900 to-red-700",          accent: "#ef4444" },
  { id: "breakout", label: "Breakout", emoji: "💥", bg: "from-orange-900 to-orange-700",    accent: "#f97316" },
  { id: "captain",  label: "Captain",  emoji: "⭐", bg: "from-blue-900 to-blue-700",        accent: "#3b82f6" },
  { id: "trap",     label: "Trap",     emoji: "🪤", bg: "from-yellow-900 to-yellow-700",   accent: "#eab308" },
  { id: "value",    label: "Value",    emoji: "💎", bg: "from-cyan-900 to-cyan-700",        accent: "#06b6d4" },
];

const SIZES: { id: Size; label: string; w: number; h: number }[] = [
  { id: "square",    label: "Square (1:1)",     w: 400, h: 400 },
  { id: "portrait",  label: "Portrait (4:5)",   w: 400, h: 500 },
  { id: "landscape", label: "Landscape (16:9)", w: 560, h: 315 },
];

const STAT_FIELDS: { key: string; label: string }[] = [
  { key: "projection_final", label: "Projection" },
  { key: "ceiling",          label: "Ceiling" },
  { key: "floor",            label: "Floor" },
  { key: "price",            label: "Price" },
  { key: "neeko_rating",     label: "Neeko Rating" },
  { key: "value_score",      label: "Value Score" },
];

const fmt = (n: number | null, suffix = "") =>
  n != null ? `${Math.round(Number(n))}${suffix}` : "—";

const fmtPrice = (n: number | null) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";

type PlayerRow = {
  player_id: number | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling: number | null;
  floor: number | null;
  price: number | null;
  neeko_rating: number | null;
  value_score: number | null;
  [key: string]: unknown;
};

export default function ImageStudio() {
  const { players, loading } = useMarketingPlayers();
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);
  const [template, setTemplate] = useState<Template>("buy");
  const [size, setSize] = useState<Size>("square");
  const [titleText, setTitleText] = useState("TOP PICK THIS WEEK");
  const [subtitleText, setSubtitleText] = useState("");
  const [selectedStats, setSelectedStats] = useState<string[]>(["projection_final", "ceiling", "price"]);
  const [uploadedImg, setUploadedImg] = useState<string | null>(null);
  const [bgPrompt, setBgPrompt] = useState("football oval, stadium lights, night game");
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = players.filter((p) =>
    p.player_name?.toLowerCase().includes(search.toLowerCase())
  );

  const posColor = (pos: string | null) => {
    switch (pos) {
      case "MID": return "bg-blue-500/15 text-blue-700 dark:text-blue-300";
      case "DEF": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
      case "FWD": return "bg-orange-500/15 text-orange-700 dark:text-orange-300";
      case "RUC": return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
      default:    return "bg-muted text-muted-foreground";
    }
  };

  const activeTemplate = TEMPLATES.find((t) => t.id === template)!;
  const activeSize = SIZES.find((s) => s.id === size)!;

  const getStatValue = (key: string): string => {
    if (!selectedPlayer) return "—";
    if (key === "price") return fmtPrice(selectedPlayer.price);
    const val = selectedPlayer[key];
    return fmt(typeof val === "number" ? val : null, key === "projection_final" || key === "ceiling" || key === "floor" ? " pts" : "");
  };

  const toggleStat = (key: string) => {
    setSelectedStats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key].slice(0, 4)
    );
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setUploadedImg(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const download = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `neeko-${selectedPlayer?.player_name ?? "card"}-${template}.png`;
      a.click();
    } finally {
      setDownloading(false);
    }
  }, [selectedPlayer, template]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Controls */}
      <div className="space-y-5">
        {/* Player search */}
        <div className="relative">
          <div
            className="flex items-center gap-2 border border-border rounded-md px-3 py-2 cursor-pointer bg-background hover:border-foreground/30 transition-colors"
            onClick={() => setShowDropdown((v) => !v)}
          >
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            {selectedPlayer ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-medium text-sm truncate">{selectedPlayer.player_name}</span>
                <span className="text-xs text-muted-foreground">{selectedPlayer.team}</span>
                <Badge className={`text-[10px] px-1.5 py-0 ${posColor(selectedPlayer.position)}`}>
                  {selectedPlayer.position ?? "—"}
                </Badge>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground flex-1">Search player...</span>
            )}
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          {showDropdown && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
              <div className="sticky top-0 bg-popover border-b border-border px-3 py-2">
                <input
                  autoFocus
                  placeholder="Search player..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-sm bg-transparent outline-none"
                />
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3 py-4 text-center">No players found — check data source</p>
              ) : (
                filtered.slice(0, 50).map((p) => (
                  <div
                    key={p.player_id ?? p.player_name}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                    onClick={() => {
                      setSelectedPlayer(p as unknown as PlayerRow);
                      setShowDropdown(false);
                      setSearch("");
                      setSubtitleText(p.team ?? "");
                    }}
                  >
                    <span className="font-medium truncate flex-1">{p.player_name}</span>
                    <span className="text-xs text-muted-foreground">{p.team}</span>
                    {p.projection_final != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(p.projection_final)}pt</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Template */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Template</p>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  template === t.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Size</p>
          <div className="flex gap-1.5">
            {SIZES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSize(s.id)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  size === s.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Text overlay */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            <Type className="inline h-3.5 w-3.5 mr-1" />
            Text Overlay
          </p>
          <div className="space-y-2">
            <input
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              placeholder="Title (e.g. TOP 3 CAPTAINS)"
              className="w-full text-sm px-3 py-2 border border-border rounded bg-background outline-none focus:border-foreground/40"
            />
            <input
              value={subtitleText}
              onChange={(e) => setSubtitleText(e.target.value)}
              placeholder="Subtitle (e.g. team name or round)"
              className="w-full text-sm px-3 py-2 border border-border rounded bg-background outline-none focus:border-foreground/40"
            />
          </div>
        </div>

        {/* Stats to show */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            <BarChart2 className="inline h-3.5 w-3.5 mr-1" />
            Stats Overlay (max 4)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STAT_FIELDS.map((f) => (
              <button
                key={f.key}
                onClick={() => toggleStat(f.key)}
                className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                  selectedStats.includes(f.key)
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Player image upload */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            <ImageIcon className="inline h-3.5 w-3.5 mr-1" />
            Player Image (optional)
          </p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 text-xs border border-dashed border-border rounded hover:border-foreground/40 transition-colors text-muted-foreground hover:text-foreground"
          >
            <Upload className="h-4 w-4" />
            {uploadedImg ? "Replace image" : "Upload player photo"}
          </button>
        </div>

        {/* Background prompt */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Background Prompt
            <span className="ml-2 text-muted-foreground/60 normal-case font-normal">(AI-ready, future feature)</span>
          </p>
          <input
            value={bgPrompt}
            onChange={(e) => setBgPrompt(e.target.value)}
            placeholder="e.g. stadium lights, football oval, night game"
            className="w-full text-sm px-3 py-2 border border-border rounded bg-background outline-none focus:border-foreground/40"
          />
        </div>

        <Button
          onClick={download}
          disabled={!selectedPlayer || downloading}
          className="w-full"
        >
          {downloading ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {downloading ? "Exporting..." : "Export PNG"}
        </Button>
      </div>

      {/* Preview */}
      <div className="flex flex-col items-center gap-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide self-start">Preview</p>
        <div
          ref={cardRef}
          className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${activeTemplate.bg} text-white flex flex-col justify-between`}
          style={{ width: activeSize.w, height: activeSize.h, maxWidth: "100%" }}
        >
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Player image */}
          {uploadedImg && (
            <img
              src={uploadedImg}
              alt="player"
              className="absolute inset-0 w-full h-full object-cover opacity-30"
            />
          )}

          {/* Top accent bar */}
          <div
            className="relative z-10 h-1 w-full"
            style={{ backgroundColor: activeTemplate.accent }}
          />

          {/* Logo / brand */}
          <div className="relative z-10 px-5 pt-4 flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest opacity-70 uppercase">Neeko Sports</span>
            <span className="text-lg">{activeTemplate.emoji}</span>
          </div>

          {/* Main content */}
          <div className="relative z-10 px-5 pb-5 flex flex-col gap-3">
            {selectedPlayer ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-widest opacity-60 mb-1">{subtitleText || selectedPlayer.team}</p>
                  <p className="text-2xl font-black leading-tight">{selectedPlayer.player_name}</p>
                </div>

                {titleText && (
                  <div
                    className="inline-flex self-start px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider"
                    style={{ backgroundColor: activeTemplate.accent }}
                  >
                    {titleText}
                  </div>
                )}

                {selectedStats.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {selectedStats.map((key) => {
                      const field = STAT_FIELDS.find((f) => f.key === key)!;
                      return (
                        <div key={key} className="bg-white/10 rounded-lg px-3 py-2">
                          <p className="text-[10px] uppercase tracking-wider opacity-60">{field.label}</p>
                          <p className="text-base font-bold">{getStatValue(key)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="opacity-40 text-sm">Select a player to preview</p>
            )}

            <p className="text-[10px] opacity-40 tracking-widest uppercase mt-2">neekosports.com.au</p>
          </div>

          {/* Bottom accent bar */}
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5"
            style={{ backgroundColor: activeTemplate.accent }}
          />
        </div>

        {!selectedPlayer && (
          <p className="text-xs text-muted-foreground text-center">
            Select a player on the left to see the preview
          </p>
        )}
      </div>
    </div>
  );
}
