import { useState, useRef, useCallback, useEffect } from "react";
import { toPng } from "html-to-image";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Download, RefreshCw, Megaphone, Copy, Check, Sparkles } from "lucide-react";

interface GraphicPlayer {
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  captain_score: number | null;
  matchup_rating: number | null;
  value_score: number | null;
  upside_rating: number | null;
}

interface GraphicType {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  orderBy: string;
  orderDir: "asc" | "desc";
  limit: number;
  statLabel: string;
  statFn: (p: GraphicPlayer) => string;
  accentColor: string;
}

const GRAPHIC_TYPES: GraphicType[] = [
  {
    id: "top_projections",
    label: "Top Fantasy Projections",
    title: "Top 10 AFL Fantasy Projections",
    subtitle: "Round Projections · Neeko Analytics",
    orderBy: "projection_final",
    orderDir: "desc",
    limit: 10,
    statLabel: "Proj",
    statFn: (p) => `${Math.round(Number(p.projection_final ?? 0))} pts`,
    accentColor: "#F59E0B",
  },
  {
    id: "captain_picks",
    label: "Captain Picks",
    title: "Top 5 Captain Picks",
    subtitle: "Captain Score Model · Neeko Analytics",
    orderBy: "captain_score",
    orderDir: "desc",
    limit: 5,
    statLabel: "Capt",
    statFn: (p) => `${Math.round(Number(p.captain_score ?? 0))}`,
    accentColor: "#FBBF24",
  },
  {
    id: "breakout_players",
    label: "Breakout Players",
    title: "Top Breakout Players 2026",
    subtitle: "Upside Model · Neeko Analytics",
    orderBy: "upside_rating",
    orderDir: "desc",
    limit: 5,
    statLabel: "Upside",
    statFn: (p) => `${Number(p.upside_rating ?? 0).toFixed(1)}`,
    accentColor: "#34D399",
  },
  {
    id: "best_matchups",
    label: "Best Matchups",
    title: "Best Matchups This Round",
    subtitle: "Matchup Rating Model · Neeko Analytics",
    orderBy: "matchup_rating",
    orderDir: "desc",
    limit: 5,
    statLabel: "Matchup",
    statFn: (p) => `${Math.round(Number(p.matchup_rating ?? 0))}/100`,
    accentColor: "#60A5FA",
  },
  {
    id: "undervalued",
    label: "Most Undervalued Players",
    title: "Most Undervalued Players",
    subtitle: "Value Score Model · Neeko Analytics",
    orderBy: "value_score",
    orderDir: "desc",
    limit: 5,
    statLabel: "Value",
    statFn: (p) => `${Number(p.value_score ?? 0).toFixed(1)}`,
    accentColor: "#A78BFA",
  },
];

const SIZE = 1080;

function GraphicCanvas({ type, players }: { type: GraphicType; players: GraphicPlayer[] }) {
  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        background: "linear-gradient(160deg, #0a0f1a 0%, #0d1525 50%, #0a0f1a 100%)",
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "64px 72px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, background: type.accentColor }} />

      <div
        style={{
          position: "absolute",
          top: -180,
          right: -180,
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${type.accentColor}18 0%, transparent 70%)`,
        }}
      />

      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: type.accentColor }}>neekostats</span>

        <div style={{ width: 60, height: 3, background: type.accentColor, margin: "20px 0" }} />

        <h1 style={{ fontSize: 56, fontWeight: 800, color: "#fff", margin: 0 }}>{type.title}</h1>

        <p style={{ fontSize: 24, color: "rgba(255,255,255,0.45)", marginTop: 10 }}>{type.subtitle}</p>
      </div>

      <div style={{ flex: 1 }}>
        {players.slice(0, type.limit).map((p, i) => {
          const isFirst = i === 0;

          return (
            <div
              key={`${p.player_name}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "18px 24px",
                borderRadius: 12,
                marginBottom: 8,
                background: isFirst
                  ? `linear-gradient(90deg, ${type.accentColor}22 0%, ${type.accentColor}08 100%)`
                  : "rgba(255,255,255,0.03)",
              }}
            >
              <span
                style={{
                  fontSize: isFirst ? 28 : 24,
                  fontWeight: 800,
                  color: isFirst ? type.accentColor : "rgba(255,255,255,0.25)",
                  width: 52,
                }}
              >
                {i + 1}
              </span>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: isFirst ? 30 : 26, fontWeight: 700, color: "#fff" }}>{p.player_name}</div>

                <div style={{ fontSize: 18, color: "rgba(255,255,255,0.45)" }}>
                  {p.team} {p.position && `· ${p.position}`}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: isFirst ? 34 : 28, fontWeight: 800, color: type.accentColor }}>
                  {type.statFn(p)}
                </div>

                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>{type.statLabel}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: type.accentColor }}>neekostats.com.au</span>
      </div>
    </div>
  );
}

const cache = new Map<string, GraphicPlayer[]>();

export default function SocialGraphicGenerator() {
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState(GRAPHIC_TYPES[0]);
  const [players, setPlayers] = useState<GraphicPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showCanvas, setShowCanvas] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  const fetchPlayers = useCallback(async (type: GraphicType) => {
    setLoading(true);

    try {
      const { data } = await supabase
        .from("v_rankings_content_engine")
        .select("*")
        .order(type.orderBy, { ascending: false })
        .limit(type.limit);

      setPlayers(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlayers(selectedType);
  }, []);

  const handleDownload = async () => {
    setShowCanvas(true);
    setDownloading(true);

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      if (!canvasRef.current) return;

      const dataUrl = await toPng(canvasRef.current, {
        width: SIZE,
        height: SIZE,
        pixelRatio: 0.75,
        cacheBust: true,
        backgroundColor: "#0a0f1a",
      });

      const link = document.createElement("a");
      link.download = `neeko-${selectedType.id}.png`;
      link.href = dataUrl;
      link.click();

      toast({ title: "Graphic downloaded" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    } finally {
      setDownloading(false);
      setShowCanvas(false);
    }
  };

  return (
    <div>
      <Button onClick={handleDownload} disabled={downloading || loading}>
        <Download className="mr-2 h-4 w-4" />
        Download Graphic
      </Button>

      {showCanvas && (
        <div style={{ position: "fixed", top: -9999, left: -9999 }}>
          <div ref={canvasRef}>
            <GraphicCanvas type={selectedType} players={players} />
          </div>
        </div>
      )}
    </div>
  );
}