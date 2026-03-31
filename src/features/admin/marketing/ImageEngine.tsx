import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import useMarketingPlayers from "./useMarketingPlayers";
import { cleanAiText, truncateSmart } from "@/utils/cleanAiText";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw, ChevronDown, Search, BookmarkPlus, Check } from "lucide-react";
import type { MarketingPlayer } from "./types";
import { addToLibrary } from "./lib/library";
import { useToast } from "@/hooks/use-toast";

type Template = "buy" | "sell" | "trap" | "breakout" | "captain" | "value";
type Size = "square" | "portrait" | "landscape";

const TEMPLATES: {
  id: Template;
  label: string;
  emoji: string;
  gradient: string;
  accent: string;
}[] = [
  { id: "buy",      label: "Buy",      emoji: "📈", gradient: "linear-gradient(135deg, #059669 0%, #065f46 100%)", accent: "rgba(52,211,153,0.25)" },
  { id: "sell",     label: "Sell",     emoji: "📉", gradient: "linear-gradient(135deg, #dc2626 0%, #7f1d1d 100%)", accent: "rgba(252,165,165,0.2)" },
  { id: "trap",     label: "Trap",     emoji: "🪤", gradient: "linear-gradient(135deg, #d97706 0%, #92400e 100%)", accent: "rgba(252,211,77,0.2)" },
  { id: "breakout", label: "Breakout", emoji: "💥", gradient: "linear-gradient(135deg, #ea580c 0%, #7c2d12 100%)", accent: "rgba(253,186,116,0.2)" },
  { id: "captain",  label: "Captain",  emoji: "⭐", gradient: "linear-gradient(135deg, #1d4ed8 0%, #1e3a5f 100%)", accent: "rgba(147,197,253,0.2)" },
  { id: "value",    label: "Value",    emoji: "💎", gradient: "linear-gradient(135deg, #0e7490 0%, #0c4a6e 100%)", accent: "rgba(103,232,249,0.2)" },
];

const SIZES: { id: Size; label: string; w: number; h: number }[] = [
  { id: "square",    label: "Square (1:1)",   w: 420, h: 420 },
  { id: "portrait",  label: "Story (9:16)",   w: 310, h: 551 },
  { id: "landscape", label: "Banner (16:9)",  w: 550, h: 309 },
];

const fmt = (n: number | null | undefined, suffix = "") =>
  n != null ? `${Math.round(Number(n))}${suffix}` : "—";

const fmtPrice = (n: number | null | undefined) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";

const posTagStyle = (pos: string | null): React.CSSProperties => {
  const map: Record<string, string> = {
    MID: "rgba(59,130,246,0.3)",
    DEF: "rgba(16,185,129,0.3)",
    FWD: "rgba(249,115,22,0.3)",
    RUC: "rgba(148,163,184,0.3)",
  };
  return {
    background: map[pos ?? ""] ?? "rgba(255,255,255,0.15)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 99,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
};

interface CardProps {
  player: MarketingPlayer | null;
  template: Template;
  size: Size;
}

function ImageCard({ player, template, size }: CardProps) {
  const tmpl = TEMPLATES.find((t) => t.id === template)!;
  const sz = SIZES.find((s) => s.id === size)!;
  const isPortrait = size === "portrait";
  const isLandscape = size === "landscape";

  const why = truncateSmart(
    cleanAiText(player?.recommendation_why ?? player?.summary_short ?? ""),
    isPortrait ? 200 : isLandscape ? 100 : 130
  );

  const priceLabel =
    player?.price_change != null && player.price_change !== 0
      ? `${fmtPrice(player.price)} (${player.price_change > 0 ? "+" : ""}${fmtPrice(player.price_change)})`
      : fmtPrice(player?.price);

  return (
    <div
      style={{
        width: sz.w,
        height: sz.h,
        background: tmpl.gradient,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        color: "#fff",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -60,
          right: -60,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: tmpl.accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -40,
          left: -40,
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: tmpl.accent,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: isLandscape ? "row" : "column",
          height: "100%",
          padding: isLandscape ? "20px 24px" : "20px",
          gap: isLandscape ? 20 : 0,
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: isLandscape ? "column" : "row",
            alignItems: isLandscape ? "flex-start" : "center",
            justifyContent: "space-between",
            marginBottom: isLandscape ? 0 : 12,
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.6, marginBottom: 4 }}>
              Neeko Sports
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,0.15)",
                padding: "4px 10px",
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              <span>{tmpl.emoji}</span>
              <span>{tmpl.label}</span>
            </div>
          </div>
          {player && !isLandscape && (
            <span style={posTagStyle(player.position)}>{player.position}</span>
          )}
        </div>

        {isLandscape ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, margin: 0 }}>
                {player?.player_name ?? "Select a player"}
              </h1>
              {player && <span style={posTagStyle(player.position)}>{player.position}</span>}
            </div>
            {player && (
              <p style={{ fontSize: 12, opacity: 0.65, margin: "2px 0 8px" }}>{player.team}</p>
            )}
            {why && (
              <p style={{ fontSize: 11, lineHeight: 1.5, opacity: 0.85, margin: 0 }}>{why}</p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: isPortrait ? "center" : "flex-start", textAlign: isPortrait ? "center" : "left", flex: 1, justifyContent: "center", gap: 4 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                border: "2px solid rgba(255,255,255,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                marginBottom: 10,
              }}
            >
              {player ? player.player_name.charAt(0).toUpperCase() : "?"}
            </div>

            <h1 style={{ fontSize: isPortrait ? 22 : 20, fontWeight: 900, lineHeight: 1.1, margin: 0 }}>
              {player?.player_name ?? "Select a player"}
            </h1>
            {player && (
              <p style={{ fontSize: 12, opacity: 0.65, margin: "2px 0" }}>
                {player.team} {player.position ? `• ${player.position}` : ""}
              </p>
            )}
            {why && (
              <p style={{ fontSize: 11, lineHeight: 1.55, opacity: 0.85, marginTop: 8 }}>{why}</p>
            )}
          </div>
        )}

        <div>
          {player && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isLandscape ? "1fr" : "repeat(3, 1fr)",
                gap: 8,
                marginBottom: 12,
              }}
            >
              {[
                { label: "Proj", value: fmt(player.projection_final, "pt") },
                { label: "Ceil", value: fmt(player.ceiling, "pt") },
                { label: "Price", value: priceLabel },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  style={{
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: 8,
                    padding: isLandscape ? "4px 10px" : "6px 8px",
                    textAlign: "center",
                    display: isLandscape ? "flex" : "block",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 9, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", opacity: 0.35, textAlign: isPortrait ? "center" : "left" }}>
            neekostats.com.au · #AFLFantasy
          </div>
        </div>
      </div>
    </div>
  );
}

const posDropdownStyle = (pos: string | null) => {
  const map: Record<string, string> = {
    MID: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    DEF: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    FWD: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    RUC: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  };
  return map[pos ?? ""] ?? "bg-muted text-muted-foreground";
};

export default function ImageEngine() {
  const { players, loading } = useMarketingPlayers();
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [search,         setSearch]         = useState("");
  const [showDropdown,   setShowDropdown]   = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<MarketingPlayer | null>(null);
  const [template,       setTemplate]       = useState<Template>("buy");
  const [size,           setSize]           = useState<Size>("square");
  const [downloading,    setDownloading]    = useState(false);
  const [savedConcept,   setSavedConcept]   = useState(false);

  const filtered = players.filter((p) =>
    p.player_name.toLowerCase().includes(search.toLowerCase())
  );

  const download = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `neeko-${template}-${
        selectedPlayer?.player_name?.replace(/\s+/g, "-").toLowerCase() ?? "card"
      }.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
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
                  <Badge className={`text-[10px] px-1.5 py-0 ${posDropdownStyle(selectedPlayer.position)}`}>
                    {selectedPlayer.position}
                  </Badge>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground flex-1">Search player...</span>
              )}
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>

            {showDropdown && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-56 overflow-y-auto">
                <div className="sticky top-0 bg-popover border-b border-border px-3 py-2">
                  <input
                    autoFocus
                    placeholder="Search by name..."
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
                  <p className="text-xs text-muted-foreground px-3 py-4 text-center">No players found</p>
                ) : (
                  filtered.slice(0, 60).map((p) => (
                    <div
                      key={p.player_id ?? p.player_name}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                      onClick={() => {
                        setSelectedPlayer(p);
                        setShowDropdown(false);
                        setSearch("");
                      }}
                    >
                      <span className="font-medium truncate flex-1">{p.player_name}</span>
                      <span className="text-xs text-muted-foreground">{p.team}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 ${posDropdownStyle(p.position)}`}>
                        {p.position}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template</p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${
                    template === t.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Size</p>
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSize(s.id)}
                  className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${
                    size === s.id
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {selectedPlayer && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Projection</span>
                <span className="font-semibold">{fmt(selectedPlayer.projection_final, "pt")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ceiling</span>
                <span className="font-semibold">{fmt(selectedPlayer.ceiling, "pt")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-semibold">{fmtPrice(selectedPlayer.price)}</span>
              </div>
              {selectedPlayer.price_change != null && selectedPlayer.price_change !== 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Change</span>
                  <span className={`font-semibold ${selectedPlayer.price_change > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {selectedPlayer.price_change > 0 ? "+" : ""}{fmtPrice(selectedPlayer.price_change)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!selectedPlayer) return;
                const tmpl = TEMPLATES.find((t) => t.id === template)!;
                const sz   = SIZES.find((s) => s.id === size)!;
                const desc = [
                  `Template: ${tmpl.label}`,
                  `Size: ${sz.label}`,
                  selectedPlayer.projection_final != null ? `Projection: ${Math.round(selectedPlayer.projection_final)}pt` : null,
                  selectedPlayer.price            != null ? `Price: $${(selectedPlayer.price / 1000).toFixed(0)}k` : null,
                  cleanAiText(selectedPlayer.recommendation_why ?? selectedPlayer.summary_short ?? ""),
                ].filter(Boolean).join("\n");
                addToLibrary({
                  type:    "image",
                  title:   `${selectedPlayer.player_name} — ${tmpl.label} card`,
                  content: desc,
                  player:  selectedPlayer.player_name,
                  tags:    ["image", template],
                });
                setSavedConcept(true);
                setTimeout(() => setSavedConcept(false), 2000);
                toast({ title: "Image concept saved to Library" });
              }}
              disabled={!selectedPlayer}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-xs hover:bg-accent transition-colors disabled:opacity-40"
            >
              {savedConcept
                ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved!</>
                : <><BookmarkPlus className="h-3.5 w-3.5" /> Save Concept</>}
            </button>
            <Button onClick={download} disabled={downloading} className="flex-1">
              {downloading ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Exporting...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Download PNG</>
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-start justify-center">
          <div ref={cardRef}>
            <ImageCard player={selectedPlayer} template={template} size={size} />
          </div>
        </div>
      </div>
    </div>
  );
}
