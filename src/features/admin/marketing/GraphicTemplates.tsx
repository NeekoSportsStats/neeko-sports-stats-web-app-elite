import React from "react";
import { getTeamBackgroundTheme } from "@/config/teamBackgroundThemes";
import { getTeamAccentColour } from "@/config/aflTeamColours";
import { resolveStadiumBackground } from "@/config/aflStadiumBackgrounds";
import { getPublicStorageUrl } from "@/lib/storage/getPublicStorageUrl";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ContentPlayer {
  player_id: number | null;
  player_name: string;
  team: string;
  position: string | null;
  projection_final: number | null;
  ceiling_estimate: number | null;
  floor_estimate: number | null;
  captain_score: number | null;
  matchup_rating: number | null;
  upside_rating: number | null;
  consistency_score: number | null;
  risk_rating: number | null;
}

export interface StatAngle {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  orderBy: keyof ContentPlayer;
  orderDir: "asc" | "desc";
  limit: number;
  statLabel: string;
  statFn: (p: ContentPlayer) => string;
  accentColor: string;
  insightFn: (players: ContentPlayer[]) => string;
  layoutHint?: LayoutEngine;
}

export type LayoutEngine =
  | "stat_card"
  | "leaderboard"
  | "battle"
  | "captain_pick"
  | "breakout_alert"
  | "trade_target"
  | "avoid_player"
  | "matchup_advantage";
export type BackgroundTheme = "dark_gradient" | "stadium" | "grass" | "team_colour" | "analytics_grid";
export type BackgroundSource = "gradient" | "stock_image" | "stock_video" | "team_theme" | "upload";
export type LogoPosition = "top_left" | "top_center" | "bottom_center" | "watermark" | "none";
export type AccentColourMode = "neeko_gold" | "team_colour" | "white" | "custom";
export type RankHighlight = "top_player" | "top_3" | "all" | "none";
export type CtaPosition = "bottom_center" | "bottom_right" | "hidden";

export interface LayoutOffsets {
  titleX: number;
  titleY: number;
  statCardScale: number;
  playerImageScale: number;
  logoScale: number;
  overlayOpacity: number;
  backgroundBlur: number;
}

export const DEFAULT_LAYOUT_OFFSETS: LayoutOffsets = {
  titleX: 0,
  titleY: 0,
  statCardScale: 1,
  playerImageScale: 1,
  logoScale: 1,
  overlayOpacity: 1,
  backgroundBlur: 0,
};

export interface GraphicOptions {
  layout: LayoutEngine;
  background: BackgroundTheme;
  backgroundSource?: BackgroundSource;
  backgroundMediaUrl?: string;
  showTeamAccent: boolean;
  playerImageUrl?: string;
  logoUrl?: string;
  logoPosition?: LogoPosition;
  roundLabel?: string;
  statHighlight?: string;
  ctaText?: string;
  ctaPosition?: CtaPosition;
  accentColourMode?: AccentColourMode;
  customAccentColour?: string;
  rankHighlight?: RankHighlight;
  layoutOffsets?: LayoutOffsets;
  autoTeamAccent?: boolean;
  venue?: string | null;
  aiAnalysisText?: string;
}

// ─── Team colours (expanded) ───────────────────────────────────────────────────

const TEAM_COLOURS: Record<string, { primary: string; secondary: string }> = {
  ADEL: { primary: "#002B5C", secondary: "#E21A3A" },
  BL:   { primary: "#7B0046", secondary: "#0066CC" },
  CARL: { primary: "#031A29", secondary: "#FFFFFF" },
  COLL: { primary: "#000000", secondary: "#FFFFFF" },
  ESS:  { primary: "#000000", secondary: "#D50032" },
  FRE:  { primary: "#2C0E53", secondary: "#CF3B1E" },
  GEEL: { primary: "#001C3F", secondary: "#FFCD00" },
  GC:   { primary: "#E40B16", secondary: "#FFCD00" },
  GWS:  { primary: "#F15A25", secondary: "#333" },
  HAW:  { primary: "#442B17", secondary: "#FFCD00" },
  MELB: { primary: "#0C2340", secondary: "#BA0C2F" },
  NM:   { primary: "#013B9F", secondary: "#FFFFFF" },
  PORT: { primary: "#008AAB", secondary: "#000000" },
  RICH: { primary: "#F1C400", secondary: "#000000" },
  STK:  { primary: "#ED0F05", secondary: "#000000" },
  SYD:  { primary: "#E00E18", secondary: "#FFFFFF" },
  WB:   { primary: "#003087", secondary: "#E00B0B" },
  WCE:  { primary: "#002B81", secondary: "#F2A900" },
};

export function getTeamColour(team: string): { primary: string; secondary: string } {
  const key = team?.trim().toUpperCase();
  return TEAM_COLOURS[key] ?? { primary: "#1e293b", secondary: "#64748b" };
}

export function resolveAccentColor(
  angle: StatAngle,
  options: GraphicOptions,
  teamColour?: { primary: string; secondary: string },
  firstTeamName?: string,
): string {
  if (options.autoTeamAccent && firstTeamName) {
    const teamAccent = getTeamAccentColour(firstTeamName);
    if (teamAccent) return teamAccent;
  }
  switch (options.accentColourMode) {
    case "custom":      return options.customAccentColour ?? angle.accentColor;
    case "white":       return "#FFFFFF";
    case "team_colour": return teamColour?.primary ?? angle.accentColor;
    default:            return angle.accentColor;
  }
}

// ─── Background helpers ────────────────────────────────────────────────────────

function bgStyle(theme: BackgroundTheme, accentColor: string, teamPrimary: string): React.CSSProperties {
  switch (theme) {
    case "stadium":
      return {
        background: `
          radial-gradient(ellipse 160% 80% at 50% 110%, ${accentColor}18 0%, transparent 70%),
          radial-gradient(ellipse 80% 40% at 50% 0%, ${accentColor}10 0%, transparent 60%),
          linear-gradient(170deg, #0b1628 0%, #060e1e 50%, #000810 100%)
        `,
      };
    case "grass":
      return {
        background: `
          repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 48px),
          repeating-linear-gradient(90deg, rgba(255,255,255,0.008) 0px, rgba(255,255,255,0.008) 1px, transparent 1px, transparent 48px),
          linear-gradient(170deg, #061208 0%, #04100a 100%)
        `,
      };
    case "team_colour":
      return {
        background: `linear-gradient(155deg, ${teamPrimary}22 0%, #07111e 40%, #020917 100%)`,
      };
    case "analytics_grid":
      return {
        background: `
          linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px),
          linear-gradient(150deg, #0a0f1e 0%, #020511 100%)
        `,
        backgroundSize: "72px 72px, 72px 72px, 100% 100%",
      };
    default:
      return {
        background: "linear-gradient(135deg, #0f172a 0%, #020617 100%)",
      };
  }
}

// ─── Shared primitives ─────────────────────────────────────────────────────────

function AccentBar({ color }: { color: string }) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 8,
      background: color,
      zIndex: 10,
    }} />
  );
}

function BrandBar({ accentColor, right }: { accentColor: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: accentColor, letterSpacing: "0.02em", lineHeight: 1 }}>
        neekostats
      </span>
      {right && <><div style={{ flex: 1 }} />{right}</>}
    </div>
  );
}

function Footer({ accentColor }: { accentColor: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.07)",
    }}>
      <span style={{ fontSize: 17, fontWeight: 700, color: accentColor }}>neekostats.com.au</span>
      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.28)", letterSpacing: "0.04em" }}>
        #AFLFantasy · #FantasyFooty · #AFL
      </span>
    </div>
  );
}

// ─── Player image layer ────────────────────────────────────────────────────────
// Renders a very subtle ghost image if a URL is provided.
// Falls back silently if the image fails to load.

function PlayerGhostImage({ url, w, h }: { url: string; w: number; h: number }) {
  const [ok, setOk] = React.useState(true);
  if (!ok) return null;
  return (
    <div style={{
      position: "absolute",
      right: 0,
      bottom: 0,
      width: Math.round(w * 0.55),
      height: Math.round(h * 0.75),
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: 1,
    }}>
      <img
        src={url}
        alt=""
        onError={() => setOk(false)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "bottom right",
          opacity: 0.18,
          filter: "blur(1.5px) saturate(0.6)",
          userSelect: "none",
        }}
      />
    </div>
  );
}

// ─── Logo overlay ──────────────────────────────────────────────────────────────

function LogoOverlay({ position, logoUrl, w, h }: { position: LogoPosition; logoUrl: string; w: number; h: number }) {
  const [ok, setOk] = React.useState(true);
  if (!ok || !logoUrl || position === "none") return null;

  const size = position === "watermark" ? Math.round(w * 0.12) : Math.round(w * 0.09);
  const style: React.CSSProperties = { position: "absolute", width: size, height: size, pointerEvents: "none", zIndex: 10 };

  if (position === "top_left") {
    style.top = 18; style.left = 18;
  } else if (position === "top_center") {
    style.top = 18; style.left = "50%"; style.transform = "translateX(-50%)";
  } else if (position === "bottom_center") {
    style.bottom = 18; style.left = "50%"; style.transform = "translateX(-50%)";
  } else if (position === "watermark") {
    style.bottom = 18; style.right = 18; style.opacity = 0.12;
  }

  return (
    <div style={style}>
      <img
        src={logoUrl}
        alt="Logo"
        onError={() => setOk(false)}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
}

// ─── Round label badge ─────────────────────────────────────────────────────────

function RoundLabelBadge({ label, accentColor, w }: { label: string; accentColor: string; w: number }) {
  const fontSize = Math.max(13, Math.round(w * 0.014));
  return (
    <div style={{
      position: "absolute", top: 18, right: 18,
      background: `${accentColor}22`,
      border: `1px solid ${accentColor}55`,
      borderRadius: 6, padding: "4px 10px",
      fontSize, fontWeight: 700, color: accentColor,
      letterSpacing: "0.06em", textTransform: "uppercase",
      pointerEvents: "none", zIndex: 10,
    }}>
      {label}
    </div>
  );
}

// ─── CTA overlay ───────────────────────────────────────────────────────────────

function CtaOverlay({ text, position, accentColor, w, h }: { text: string; position: CtaPosition; accentColor: string; w: number; h: number }) {
  if (position === "hidden" || !text) return null;

  const fontSize = Math.max(13, Math.round(w * 0.013));
  const style: React.CSSProperties = {
    position: "absolute",
    background: "rgba(0,0,0,0.65)",
    backdropFilter: "blur(4px)",
    padding: "7px 16px",
    borderRadius: 8,
    fontSize, fontWeight: 600,
    color: "rgba(255,255,255,0.85)",
    pointerEvents: "none", zIndex: 10,
  };

  if (position === "bottom_center") {
    style.bottom = 22;
    style.left = "50%";
    style.transform = "translateX(-50%)";
    style.whiteSpace = "nowrap";
  } else if (position === "bottom_right") {
    style.bottom = 22;
    style.right = 22;
    style.textAlign = "right";
  }

  return (
    <div style={style}>
      <span style={{ color: accentColor, fontWeight: 700 }}>→ </span>
      {text}
    </div>
  );
}

// ─── AI Analysis text overlay ──────────────────────────────────────────────────

function AIAnalysisOverlay({ text, accentColor, w }: { text: string; accentColor: string; w: number }) {
  if (!text) return null;
  const fontSize = Math.max(11, Math.round(w * 0.012));
  return (
    <div style={{
      position: "absolute",
      left: "50%",
      bottom: 60,
      transform: "translateX(-50%)",
      maxWidth: "70%",
      background: "rgba(0,0,0,0.72)",
      backdropFilter: "blur(6px)",
      borderRadius: 10,
      border: `1px solid ${accentColor}33`,
      padding: "8px 14px",
      pointerEvents: "none",
      zIndex: 11,
    }}>
      <p style={{
        fontSize,
        fontWeight: 500,
        color: "rgba(255,255,255,0.9)",
        lineHeight: 1.45,
        margin: 0,
        textAlign: "center",
      }}>
        <span style={{ color: accentColor, fontWeight: 700 }}>AI Insight: </span>
        {text}
      </p>
    </div>
  );
}

// ─── Stat highlight label ──────────────────────────────────────────────────────

function StatHighlightLabel({ label, accentColor }: { label: string; accentColor: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: `${accentColor}18`,
      border: `1px solid ${accentColor}44`,
      borderRadius: 20, padding: "4px 12px",
      fontSize: 14, fontWeight: 700, color: accentColor,
      letterSpacing: "0.08em", textTransform: "uppercase",
      marginBottom: 8,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor, display: "inline-block" }} />
      {label}
    </div>
  );
}

// ─── Team colour left-border accent ───────────────────────────────────────────

function TeamAccentBorder({ teamPrimary }: { teamPrimary: string }) {
  return (
    <div style={{
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: 6,
      background: `linear-gradient(180deg, ${teamPrimary} 0%, ${teamPrimary}44 60%, transparent 100%)`,
    }} />
  );
}

// ─── Stadium background image layer ───────────────────────────────────────────
// Renders a stadium photo with blur + dark overlay + gradient.
// Used automatically when a match venue is provided.

function StadiumBackgroundLayer({ imageUrl, blur = 4 }: { imageUrl: string; blur?: number }) {
  const scale = 1 + blur * 0.025;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden" }}>
      <img
        src={imageUrl}
        alt=""
        style={{
          width: "100%", height: "100%",
          objectFit: "cover",
          filter: `blur(${blur}px) brightness(0.38) saturate(0.65)`,
          transform: `scale(${scale})`,
        }}
      />
      {/* 40% dark overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.40)",
      }} />
      {/* Gradient overlay for readability */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.75) 100%)",
      }} />
    </div>
  );
}

// ─── Stock / team background layer ────────────────────────────────────────────

function BackgroundLayer({
  options, w: _w, h: _h, resolvedAccent: _resolvedAccent, teamPrimary: _teamPrimary, firstTeam,
}: {
  options: GraphicOptions;
  w: number;
  h: number;
  resolvedAccent: string;
  teamPrimary: string;
  firstTeam: string;
}) {
  const source = options.backgroundSource ?? "gradient";
  const offsets = options.layoutOffsets;
  const blur = offsets?.backgroundBlur ?? 0;

  // ── Auto-apply stadium background from venue ──────────────────────────────
  // When a venue is set, it takes priority over the manual backgroundSource
  // unless the user has explicitly chosen a stock image/video/upload.
  const manualOverride =
    source === "stock_image" || source === "stock_video" || source === "upload";

  if (!manualOverride && options.venue) {
    const stadium = resolveStadiumBackground(options.venue);
    if (stadium) {
      return <StadiumBackgroundLayer imageUrl={stadium.url} blur={4} />;
    }
    // Venue set but not found → fall through to team_theme / gradient fallback
  }

  if (source === "stock_image" && options.backgroundMediaUrl) {
    const resolvedImgUrl = getPublicStorageUrl(options.backgroundMediaUrl) ?? options.backgroundMediaUrl;
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 0, overflow: "hidden",
      }}>
        <img
          src={resolvedImgUrl}
          alt=""
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            filter: `blur(${blur}px) brightness(0.4) saturate(0.7)`,
            transform: blur > 0 ? `scale(${1 + blur * 0.02})` : undefined,
          }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.6) 100%)`,
        }} />
      </div>
    );
  }

  if (source === "stock_video" && options.backgroundMediaUrl) {
    const resolvedVidUrl = getPublicStorageUrl(options.backgroundMediaUrl) ?? options.backgroundMediaUrl;
    return (
      <div style={{
        position: "absolute", inset: 0, zIndex: 0, overflow: "hidden",
      }}>
        <video
          src={resolvedVidUrl}
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            filter: `blur(${Math.max(blur, 2)}px) brightness(0.35) saturate(0.6)`,
            transform: `scale(${1 + Math.max(blur, 2) * 0.02})`,
          }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.65) 100%)`,
        }} />
      </div>
    );
  }

  // ── Venue fallback: team theme ─────────────────────────────────────────────
  // When a venue was provided but wasn't matched, fall back to team theme.
  if (options.venue || source === "team_theme") {
    const theme = getTeamBackgroundTheme(firstTeam);
    if (theme) {
      return (
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          ...theme.bgStyle,
        }} />
      );
    }
  }

  return null;
}

// ─── Shared wrapper ────────────────────────────────────────────────────────────

function CanvasShell({
  w, h, angle, options, teamColour, resolvedAccent, children, firstTeam,
}: {
  w: number; h: number;
  angle: StatAngle;
  options: GraphicOptions;
  teamColour: { primary: string; secondary: string };
  resolvedAccent: string;
  children: React.ReactNode;
  firstTeam?: string;
}) {
  const isWide = w > h;
  const pad = isWide ? "40px 60px" : "52px 60px";
  const source = options.backgroundSource ?? "gradient";
  const offsets = options.layoutOffsets;

  // Suppress CSS gradient background when a stadium venue or media URL is active
  const hasVenueBackground = !!options.venue;
  const useGradientBg = !hasVenueBackground && (source === "gradient" || source === "upload" || (!options.backgroundMediaUrl && source !== "team_theme"));

  const gridOverlay = options.background !== "analytics_grid"
    ? "linear-gradient(rgba(255,255,255,0.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.012) 1px,transparent 1px)"
    : undefined;

  const overlayOpacity = offsets?.overlayOpacity ?? 1;

  return (
    <div style={{
      width: w, height: h,
      fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      padding: pad,
      boxSizing: "border-box",
      zIndex: 0,
      ...(useGradientBg ? bgStyle(options.background, resolvedAccent, teamColour.primary) : { background: "#000" }),
    }}>

      {/* Custom background layer (stock image/video/team theme) */}
      {!useGradientBg && (
        <BackgroundLayer
          options={options}
          w={w}
          h={h}
          resolvedAccent={resolvedAccent}
          teamPrimary={teamColour.primary}
          firstTeam={firstTeam ?? ""}
        />
      )}

      {/* Grid overlay for non-grid themes */}
      {gridOverlay && (
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: gridOverlay,
          backgroundSize: "72px 72px",
          pointerEvents: "none",
          opacity: overlayOpacity,
          zIndex: 1,
        }} />
      )}
      {/* Radial glow */}
      <div style={{
        position: "absolute", top: -200, right: -160,
        width: 560, height: 560, borderRadius: "50%",
        background: `radial-gradient(circle,${resolvedAccent}14 0%,transparent 65%)`,
        pointerEvents: "none",
        zIndex: 1,
      }} />
      <AccentBar color={resolvedAccent} />
      {options.showTeamAccent && <TeamAccentBorder teamPrimary={teamColour.primary} />}
      {options.playerImageUrl && (
        <PlayerGhostImage
          url={options.playerImageUrl}
          w={Math.round(w * (offsets?.playerImageScale ?? 1))}
          h={Math.round(h * (offsets?.playerImageScale ?? 1))}
        />
      )}
      {options.logoUrl && options.logoPosition && options.logoPosition !== "none" && (
        <LogoOverlay position={options.logoPosition} logoUrl={options.logoUrl} w={w} h={h} />
      )}
      {options.roundLabel && (
        <RoundLabelBadge label={options.roundLabel} accentColor={resolvedAccent} w={w} />
      )}
      {options.ctaText && options.ctaPosition && options.ctaPosition !== "hidden" && (
        <CtaOverlay
          text={options.ctaText}
          position={options.ctaPosition}
          accentColor={resolvedAccent}
          w={w}
          h={h}
        />
      )}
      {options.aiAnalysisText && (
        <AIAnalysisOverlay
          text={options.aiAnalysisText}
          accentColor={resolvedAccent}
          w={w}
        />
      )}
      <div style={{
        position: "relative",
        zIndex: 2,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        transform: (offsets?.titleX || offsets?.titleY)
          ? `translate(${offsets.titleX}px, ${offsets.titleY}px)`
          : undefined,
        transformOrigin: "top left",
      }}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 1: STAT CARD
// ═══════════════════════════════════════════════════════════════════════════════
// Used for: Player Spotlight, Breakout Watch, Captain Picks, Value Picks,
//           Projection Risers, Hot Streak, Form Players, Differential Picks
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutStatCard({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const top = players[0];
  if (!top) return <div style={{ width: w, height: h, background: "#060a14" }} />;
  const isWide = w > h;
  const isTall = h > w;
  const teamColour = getTeamColour(top.team);
  const ac = resolveAccentColor(angle, options, teamColour, players[0]?.team);

  const proj   = Math.round(Number(top.projection_final ?? 0));
  const ceil   = Math.round(Number(top.ceiling_estimate ?? 0));
  const floor  = Math.round(Number(top.floor_estimate ?? 0));
  const cons   = Number(top.consistency_score ?? 0).toFixed(0);
  const matchup = Math.round(Number(top.matchup_rating ?? 0));

  const stats = [
    { label: "Projection",    val: proj   > 0 ? `${proj} pts`        : "—" },
    { label: "Ceiling",       val: ceil   > 0 ? `${ceil} pts`        : "—" },
    { label: "Floor",         val: floor  > 0 ? `${floor} pts`       : "—" },
    { label: "Consistency",   val: Number(cons) > 0 ? `${cons}%`     : "—" },
    { label: "Matchup",       val: matchup > 0 ? `${matchup} / 100`  : "—" },
  ];

  const nameParts = top.player_name.split(" ");
  const lastName  = nameParts.slice(-1)[0];
  const firstName = nameParts.slice(0, -1).join(" ");

  return (
    <CanvasShell w={w} h={h} angle={angle} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={players[0]?.team ?? ""}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: isWide ? 8 : 16 }}>
        <BrandBar accentColor={ac} right={
          <span style={{ fontSize: 12, fontWeight: 700, color: ac, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {angle.label}
          </span>
        } />
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: isWide ? "row" : "column",
        alignItems: isWide ? "center" : "flex-start",
        justifyContent: isTall ? "center" : "flex-start",
        gap: isWide ? 48 : 0,
      }}>
        {/* Player info */}
        <div style={{ textAlign: isWide ? "left" : "center", width: isWide ? undefined : "100%", ...(isWide ? { flex: 1 } : {}) }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: ac,
            textTransform: "uppercase", letterSpacing: "0.12em",
            marginBottom: isWide ? 8 : 12,
          }}>
            #{1} {angle.label}
          </div>
          <div style={{
            fontSize: isWide ? 56 : (isTall ? 88 : 72),
            fontWeight: 900, color: "#fff",
            lineHeight: 0.95, letterSpacing: "-0.03em",
            marginBottom: 4,
          }}>
            {lastName}
          </div>
          <div style={{
            fontSize: isWide ? 28 : (isTall ? 40 : 34),
            fontWeight: 700, color: "rgba(255,255,255,0.45)",
            letterSpacing: "-0.01em", marginBottom: 14,
          }}>
            {firstName}
          </div>

          {/* Stat Highlight Label */}
          {options.statHighlight && (
            <StatHighlightLabel label={options.statHighlight} accentColor={ac} />
          )}

          {/* Big hero stat */}
          <div style={{
            fontSize: isWide ? 44 : (isTall ? 64 : 56),
            fontWeight: 900, color: ac,
            lineHeight: 1, fontVariantNumeric: "tabular-nums",
            marginBottom: 8,
          }}>
            {angle.statFn(top)}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16,
          }}>
            {angle.statLabel}
          </div>

          {/* Team / position pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: `${ac}12`, border: `1px solid ${ac}30`,
            borderRadius: 20, padding: "5px 14px",
          }}>
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{top.team}</span>
            {top.position && (
              <>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: ac, display: "inline-block" }} />
                <span style={{ fontSize: 14, color: ac, fontWeight: 700 }}>{top.position}</span>
              </>
            )}
          </div>
        </div>

        {/* Stats card */}
        <div style={{ ...(isWide ? { width: 320, flexShrink: 0 } : { width: "100%", marginTop: 28 }) }}>
          <div style={{
            background: `${ac}10`,
            border: `1.5px solid ${ac}28`,
            borderRadius: 20,
            padding: isWide ? "24px 28px" : "22px 28px",
            display: "flex", flexDirection: "column", gap: 13,
          }}>
            {stats.map(({ label, val }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{label}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, marginTop: isWide ? 20 : 24 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 2: LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════
// Used for: Top Projections, Captain Rankings, Best Value, Most Consistent,
//           Trade Targets, Avoid Players, Worst Matchups, Rookie Watch
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutLeaderboard({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const isWide = w > h;
  const isTall = h > w * 1.3;
  const maxRows = isTall ? 10 : isWide ? 8 : 8;
  const rows = players.slice(0, maxRows);
  const teamColour = rows[0] ? getTeamColour(rows[0].team) : { primary: "#1e293b", secondary: "#64748b" };
  const ac = resolveAccentColor(angle, options, teamColour, players[0]?.team);

  const rankHighlight = options.rankHighlight ?? "top_player";
  const isHighlighted = (i: number) => {
    if (rankHighlight === "none")       return false;
    if (rankHighlight === "top_player") return i === 0;
    if (rankHighlight === "top_3")      return i < 3;
    return true;
  };

  const rankColor = (i: number) =>
    i === 0 ? "#F59E0B" : i === 1 ? "#94A3B8" : i === 2 ? "#CD7C37" : "rgba(255,255,255,0.2)";

  return (
    <CanvasShell w={w} h={h} angle={angle} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={players[0]?.team ?? ""}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: isTall ? 16 : 10 }}>
        <BrandBar accentColor={ac} right={
          <div style={{
            background: `${ac}1a`, border: `1px solid ${ac}40`,
            borderRadius: 8, padding: "5px 14px",
            fontSize: 13, fontWeight: 700, color: ac,
            textTransform: "uppercase", letterSpacing: "0.07em",
          }}>
            {angle.statLabel}
          </div>
        } />
        <div style={{ width: 44, height: 3, background: ac, borderRadius: 2, marginTop: 18, marginBottom: 12 }} />
        <h1 style={{
          fontSize: isWide ? 36 : (isTall ? 52 : 42),
          fontWeight: 900, color: "#fff",
          lineHeight: 1.05, margin: 0, letterSpacing: "-0.025em",
        }}>
          {angle.title}
        </h1>
        <p style={{ fontSize: 17, color: "rgba(255,255,255,0.35)", marginTop: 6, fontWeight: 400 }}>
          {angle.subtitle}
        </p>
      </div>

      {/* Rows */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: isWide ? "row" : "column",
        gap: 5,
        flexWrap: isWide ? "wrap" : "nowrap",
        alignContent: "flex-start",
      }}>
        {rows.map((p, i) => {
          const highlighted = isHighlighted(i);
          const tc = options.showTeamAccent ? getTeamColour(p.team) : null;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center",
              padding: highlighted ? "14px 20px" : "10px 20px",
              borderRadius: 10,
              background: highlighted
                ? `linear-gradient(90deg,${ac}1c 0%,${ac}06 100%)`
                : i < 3 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.022)",
              border: highlighted
                ? `1px solid ${ac}40`
                : "1px solid rgba(255,255,255,0.05)",
              borderLeft: tc ? `3px solid ${tc.primary}` : undefined,
              ...(isWide ? { width: "calc(50% - 3px)", flexShrink: 0 } : {}),
            }}>
              <span style={{
                fontSize: highlighted ? 22 : 17,
                fontWeight: 900, color: rankColor(i),
                width: 38, flexShrink: 0, fontVariantNumeric: "tabular-nums",
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: highlighted ? 22 : 18,
                  fontWeight: 700, color: "#fff",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {p.player_name}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", marginTop: 1 }}>
                  {p.team}{p.position ? ` · ${p.position}` : ""}
                </div>
              </div>
              <div style={{
                fontSize: highlighted ? 26 : 20,
                fontWeight: 800,
                color: highlighted ? ac : "#fff",
                fontVariantNumeric: "tabular-nums", flexShrink: 0,
              }}>
                {angle.statFn(p)}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ flexShrink: 0, marginTop: 18 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 3: PLAYER BATTLE
// ═══════════════════════════════════════════════════════════════════════════════
// Used for: Start/Sit, Captain Battle, Midfield Comparison, Ruck Comparison
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutBattle({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const p1 = players[0];
  const p2 = players[1];
  if (!p1 || !p2) return <div style={{ width: w, height: h, background: "#060a14" }} />;
  const isWide = w > h;
  const isTall = h > w;
  const teamColour1 = getTeamColour(p1.team);
  const teamColour2 = getTeamColour(p2.team);
  const ac = resolveAccentColor(angle, options, teamColour1, p1?.team);

  const battleStats = [
    { label: "Projection",  v1: p1.projection_final,  v2: p2.projection_final,  fmt: (n: number | null) => n != null ? `${Math.round(Number(n))} pts` : "—" },
    { label: "Ceiling",     v1: p1.ceiling_estimate,  v2: p2.ceiling_estimate,  fmt: (n: number | null) => n != null ? `${Math.round(Number(n))} pts` : "—" },
    { label: "Matchup",     v1: p1.matchup_rating,    v2: p2.matchup_rating,    fmt: (n: number | null) => n != null ? `${Math.round(Number(n))} / 100` : "—" },
    { label: "Form",        v1: p1.consistency_score, v2: p2.consistency_score, fmt: (n: number | null) => n != null ? `${Number(n).toFixed(0)}%` : "—" },
  ];

  const isBetter = (v1: number | null, v2: number | null) =>
    v1 != null && v2 != null ? Number(v1) >= Number(v2) : null;

  const vsSize = isTall ? 60 : 52;

  return (
    <CanvasShell w={w} h={h} angle={angle} options={{ ...options, playerImageUrl: undefined }} teamColour={teamColour1} resolvedAccent={ac} firstTeam={p1?.team ?? ""}>
      <div style={{ flexShrink: 0, marginBottom: isTall ? 20 : 10 }}>
        <BrandBar accentColor={ac} />
        <div style={{ width: 44, height: 3, background: ac, borderRadius: 2, marginTop: 16, marginBottom: 12 }} />
        <h1 style={{
          fontSize: isWide ? 34 : (isTall ? 54 : 44),
          fontWeight: 900, color: "#fff", margin: 0, letterSpacing: "-0.025em",
        }}>
          {angle.title}
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.38)", marginTop: 5 }}>
          Who do you start this round?
        </p>
      </div>

      {/* Battle panels */}
      <div style={{
        flex: 1, display: "flex",
        flexDirection: isTall ? "column" : "row",
        alignItems: "stretch", gap: 0, position: "relative",
      }}>
        {[p1, p2].map((p, side) => {
          const tc = options.showTeamAccent
            ? (side === 0 ? teamColour1 : teamColour2)
            : null;
          return (
            <div key={side} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: isWide ? "24px 20px" : (isTall ? "24px 28px" : "32px 24px"),
              borderRadius: side === 0
                ? (isTall ? "16px 16px 0 0" : "16px 0 0 16px")
                : (isTall ? "0 0 16px 16px" : "0 16px 16px 0"),
              background: side === 0
                ? `linear-gradient(155deg,${ac}1a 0%,${ac}07 100%)`
                : "rgba(255,255,255,0.03)",
              border: side === 0
                ? `1.5px solid ${ac}44`
                : "1.5px solid rgba(255,255,255,0.07)",
              borderTop: tc ? `4px solid ${tc.primary}` : undefined,
              position: "relative",
            }}>
              {side === 0 && (
                <div style={{
                  position: "absolute", top: 12, left: 12,
                  background: ac, borderRadius: 6,
                  padding: "3px 10px", fontSize: 10, fontWeight: 800,
                  color: "#000", textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  TOP PICK
                </div>
              )}
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: side === 0 ? ac : "rgba(255,255,255,0.28)",
                textTransform: "uppercase", letterSpacing: "0.1em",
                marginBottom: isTall ? 12 : 10,
              }}>
                #{side + 1} {angle.statLabel}
              </div>
              <div style={{
                fontSize: isWide ? 32 : (isTall ? 52 : 40),
                fontWeight: 900, color: "#fff",
                textAlign: "center", lineHeight: 1.1,
                letterSpacing: "-0.02em", marginBottom: 8,
              }}>
                {p.player_name}
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.35)", marginBottom: isTall ? 16 : 12 }}>
                {p.team}{p.position ? ` · ${p.position}` : ""}
              </div>
              <div style={{
                fontSize: isWide ? 42 : (isTall ? 64 : 52),
                fontWeight: 900,
                color: side === 0 ? ac : "#fff",
                lineHeight: 1, fontVariantNumeric: "tabular-nums",
                marginBottom: 6,
              }}>
                {angle.statFn(p)}
              </div>
              <div style={{
                fontSize: 12, color: "rgba(255,255,255,0.25)",
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {angle.statLabel}
              </div>
            </div>
          );
        })}

        {/* VS badge */}
        <div style={{
          position: "absolute",
          top: isTall ? "50%" : "50%",
          left: isTall ? "50%" : "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 10,
          width: vsSize, height: vsSize, borderRadius: "50%",
          background: "#070d1b",
          border: `2px solid ${ac}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: ac }}>VS</span>
        </div>
      </div>

      {/* Stat comparison table */}
      <div style={{ flexShrink: 0, marginTop: isTall ? 20 : 14 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: isTall ? "10px 8px" : "7px 8px",
          marginBottom: 16,
        }}>
          {battleStats.map(({ label, v1, v2, fmt }) => {
            const p1Better = isBetter(v1, v2);
            return (
              <React.Fragment key={label}>
                <div style={{
                  textAlign: "right",
                  fontSize: isWide ? 16 : 18,
                  fontWeight: 800,
                  color: p1Better === true ? ac : "#fff",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {fmt(v1)}
                </div>
                <div style={{
                  textAlign: "center",
                  fontSize: 11, fontWeight: 600,
                  color: "rgba(255,255,255,0.28)",
                  textTransform: "uppercase", letterSpacing: "0.07em",
                  alignSelf: "center",
                }}>
                  {label}
                </div>
                <div style={{
                  textAlign: "left",
                  fontSize: isWide ? 16 : 18,
                  fontWeight: 800,
                  color: p1Better === false ? ac : "#fff",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {fmt(v2)}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAROUSEL SLIDE WRAPPER
// Wraps a single player card for carousel exports
// ═══════════════════════════════════════════════════════════════════════════════

export function CarouselTitleSlide({
  angle, w, h, options, totalPlayers,
}: {
  angle: StatAngle; w: number; h: number; options: GraphicOptions; totalPlayers: number;
}) {
  const teamColour = { primary: "#1e293b", secondary: "#64748b" };
  const ac = resolveAccentColor(angle, options, teamColour, undefined);
  const isTall = h > w;

  return (
    <CanvasShell w={w} h={h} angle={angle} options={{ ...options, playerImageUrl: undefined }} teamColour={teamColour} resolvedAccent={ac} firstTeam={""}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <BrandBar accentColor={ac} />
      </div>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
      }}>
        {/* Decorative glow */}
        <div style={{
          position: "absolute", top: "30%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: 500, height: 500, borderRadius: "50%",
          background: `radial-gradient(circle,${ac}18 0%,transparent 65%)`,
          pointerEvents: "none",
        }} />

        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 28,
        }}>
          <div style={{ width: 56, height: 3, background: ac, borderRadius: 2 }} />
          <span style={{
            fontSize: 13, fontWeight: 800, color: ac,
            textTransform: "uppercase", letterSpacing: "0.14em",
          }}>
            Carousel
          </span>
          <div style={{ width: 56, height: 3, background: ac, borderRadius: 2 }} />
        </div>

        <h1 style={{
          fontSize: isTall ? 72 : 52,
          fontWeight: 900, color: "#fff",
          lineHeight: 1.05, letterSpacing: "-0.03em",
          marginBottom: 20, maxWidth: w - 120,
          margin: "0 auto 20px",
        }}>
          {angle.title}
        </h1>
        <p style={{
          fontSize: isTall ? 32 : 24,
          color: "rgba(255,255,255,0.38)",
          fontWeight: 400, marginBottom: 32,
        }}>
          {angle.subtitle}
        </p>

        <div style={{
          background: `${ac}14`,
          border: `1px solid ${ac}35`,
          borderRadius: 12, padding: "10px 24px",
          fontSize: 18, fontWeight: 700,
          color: ac,
        }}>
          Swipe for Top {totalPlayers} Players →
        </div>
      </div>

      <div style={{ flexShrink: 0, marginTop: 24 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

export function CarouselPlayerSlide({
  angle, player, rank, w, h, options,
}: {
  angle: StatAngle; player: ContentPlayer; rank: number; w: number; h: number; options: GraphicOptions;
}) {
  const teamColour = getTeamColour(player.team);
  const ac = resolveAccentColor(angle, options, teamColour, player.team);
  const isTall = h > w;
  const isWide = w > h;
  const nameParts = player.player_name.split(" ");
  const lastName  = nameParts.slice(-1)[0];
  const firstName = nameParts.slice(0, -1).join(" ");

  const proj  = Math.round(Number(player.projection_final ?? 0));
  const ceil  = Math.round(Number(player.ceiling_estimate ?? 0));
  const cons  = Number(player.consistency_score ?? 0).toFixed(0);
  const matchup = Math.round(Number(player.matchup_rating ?? 0));

  const secondary = [
    { label: "Projection", val: proj   > 0 ? `${proj} pts`       : "—" },
    { label: "Ceiling",    val: ceil   > 0 ? `${ceil} pts`       : "—" },
    { label: "Consistency",val: Number(cons) > 0 ? `${cons}%`    : "—" },
    { label: "Matchup",    val: matchup > 0 ? `${matchup} / 100` : "—" },
  ];

  return (
    <CanvasShell w={w} h={h} angle={angle} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={player.team ?? ""}>
      <div style={{ flexShrink: 0, marginBottom: isTall ? 12 : 6 }}>
        <BrandBar accentColor={ac} right={
          <div style={{
            background: `${ac}1a`, border: `1px solid ${ac}40`,
            borderRadius: 8, padding: "4px 12px",
            fontSize: 13, fontWeight: 800,
            color: ac,
            fontVariantNumeric: "tabular-nums",
          }}>
            #{rank}
          </div>
        } />
      </div>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: isTall ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: isTall ? "center" : "left",
      }}>
        {/* Rank badge */}
        <div style={{
          fontSize: 13, fontWeight: 700, color: ac,
          textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12,
        }}>
          #{rank} {angle.label}
        </div>

        {/* Name */}
        <div style={{
          fontSize: isTall ? 96 : (isWide ? 56 : 80),
          fontWeight: 900, color: "#fff",
          lineHeight: 0.9, letterSpacing: "-0.035em", marginBottom: 4,
        }}>
          {lastName}
        </div>
        <div style={{
          fontSize: isTall ? 48 : (isWide ? 28 : 40),
          fontWeight: 700, color: "rgba(255,255,255,0.42)",
          letterSpacing: "-0.01em", marginBottom: 20,
        }}>
          {firstName}
        </div>

        {/* Hero stat */}
        <div style={{
          fontSize: isTall ? 80 : (isWide ? 52 : 68),
          fontWeight: 900, color: ac,
          lineHeight: 1, fontVariantNumeric: "tabular-nums", marginBottom: 6,
        }}>
          {angle.statFn(player)}
        </div>
        <div style={{
          fontSize: 13, color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20,
        }}>
          {angle.statLabel}
        </div>

        {/* Team/position */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}12`, border: `1px solid ${ac}30`,
          borderRadius: 20, padding: "5px 14px", marginBottom: 24,
        }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{player.team}</span>
          {player.position && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: ac, display: "inline-block" }} />
              <span style={{ fontSize: 14, color: ac, fontWeight: 700 }}>{player.position}</span>
            </>
          )}
        </div>

        {/* Secondary stat grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
          width: isTall ? "100%" : Math.min(w - 120, 480),
        }}>
          {secondary.map(({ label, val }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12, padding: "14px 16px", textAlign: "center",
            }}>
              <div style={{ fontSize: isTall ? 26 : 20, fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                {val}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 3 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flexShrink: 0, marginTop: 20 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 4: CAPTAIN PICK
// Hero layout: badge, big projection number, player name, context line
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutCaptainPick({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const top = players[0];
  if (!top) return <div style={{ width: w, height: h, background: "#060a14" }} />;
  const isTall = h > w;
  const isWide = w > h;
  const teamColour = getTeamColour(top.team);
  const ac = resolveAccentColor(angle, options, teamColour, players[0]?.team);
  const proj = Math.round(Number(top.projection_final ?? 0));
  const captScore = Math.round(Number(top.captain_score ?? 0));
  const nameParts = top.player_name.split(" ");
  const lastName  = nameParts.slice(-1)[0];
  const firstName = nameParts.slice(0, -1).join(" ");

  return (
    <CanvasShell w={w} h={h} angle={angle} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={players[0]?.team ?? ""}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: isTall ? 16 : 8 }}>
        <BrandBar accentColor={ac} />
      </div>

      {/* Body */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: isTall ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: isTall ? "center" : "left",
        gap: 0,
      }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}18`, border: `1.5px solid ${ac}50`,
          borderRadius: 30, padding: isTall ? "8px 24px" : "6px 18px",
          marginBottom: isTall ? 28 : 20,
        }}>
          <span style={{
            fontSize: isTall ? 16 : 13, fontWeight: 900,
            color: ac, textTransform: "uppercase", letterSpacing: "0.14em",
          }}>
            CAPTAIN PICK
          </span>
        </div>

        {/* Big projection number */}
        <div style={{
          fontSize: isTall ? 180 : (isWide ? 120 : 150),
          fontWeight: 900, color: ac,
          lineHeight: 0.85, fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.05em",
          marginBottom: isTall ? 12 : 8,
        }}>
          {proj > 0 ? proj : angle.statFn(top)}
        </div>

        {/* Context label */}
        <div style={{
          fontSize: isTall ? 22 : 16, fontWeight: 600,
          color: "rgba(255,255,255,0.32)",
          textTransform: "uppercase", letterSpacing: "0.12em",
          marginBottom: isTall ? 32 : 22,
        }}>
          {proj > 0 ? "ROUND PROJECTION" : angle.statLabel}
        </div>

        {/* Player name */}
        <div style={{
          fontSize: isTall ? 100 : (isWide ? 64 : 80),
          fontWeight: 900, color: "#fff",
          lineHeight: 0.9, letterSpacing: "-0.03em",
          marginBottom: 4,
        }}>
          {lastName}
        </div>
        <div style={{
          fontSize: isTall ? 50 : (isWide ? 34 : 42),
          fontWeight: 700, color: "rgba(255,255,255,0.45)",
          letterSpacing: "-0.01em", marginBottom: isTall ? 20 : 14,
        }}>
          {firstName}
        </div>

        {/* Team / position pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}12`, border: `1px solid ${ac}30`,
          borderRadius: 20, padding: "5px 14px",
          marginBottom: isTall ? 28 : 20,
        }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{top.team}</span>
          {top.position && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: ac, display: "inline-block" }} />
              <span style={{ fontSize: 14, color: ac, fontWeight: 700 }}>{top.position}</span>
            </>
          )}
        </div>

        {/* Captain score stat */}
        {captScore > 0 && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14, padding: isTall ? "16px 28px" : "12px 22px",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: isTall ? 36 : 28, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                {captScore}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
                Captain Score
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, marginTop: isTall ? 28 : 20 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 5: BREAKOUT ALERT
// Highlights projected improvement with a prominent +value display
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutBreakoutAlert({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const top = players[0];
  if (!top) return <div style={{ width: w, height: h, background: "#060a14" }} />;
  const isTall = h > w;
  const isWide = w > h;
  const teamColour = getTeamColour(top.team);
  const ac = resolveAccentColor(angle, options, teamColour, players[0]?.team);
  const upside = Number(top.upside_rating ?? 0).toFixed(1);
  const proj   = Math.round(Number(top.projection_final ?? 0));
  const ceil   = Math.round(Number(top.ceiling_estimate ?? 0));
  const diff   = ceil > proj ? ceil - proj : null;
  const nameParts = top.player_name.split(" ");
  const lastName  = nameParts.slice(-1)[0];
  const firstName = nameParts.slice(0, -1).join(" ");

  return (
    <CanvasShell w={w} h={h} angle={angle} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={players[0]?.team ?? ""}>
      {/* Glow pulse */}
      <div style={{
        position: "absolute",
        top: "40%", left: "50%", transform: "translate(-50%,-50%)",
        width: isTall ? 600 : 400, height: isTall ? 600 : 400,
        borderRadius: "50%",
        background: `radial-gradient(circle,${ac}20 0%,transparent 65%)`,
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: isTall ? 12 : 6, position: "relative", zIndex: 2 }}>
        <BrandBar accentColor={ac} />
      </div>

      {/* Body */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: isTall ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: isTall ? "center" : "left",
        position: "relative", zIndex: 2,
      }}>
        {/* Alert badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}20`, border: `1.5px solid ${ac}55`,
          borderRadius: 30, padding: isTall ? "8px 24px" : "6px 18px",
          marginBottom: isTall ? 28 : 18,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: ac, display: "inline-block",
            boxShadow: `0 0 10px ${ac}`,
          }} />
          <span style={{
            fontSize: isTall ? 16 : 13, fontWeight: 900,
            color: ac, textTransform: "uppercase", letterSpacing: "0.14em",
          }}>
            BREAKOUT ALERT
          </span>
        </div>

        {/* Improvement value */}
        {diff != null && diff > 0 ? (
          <div style={{
            fontSize: isTall ? 160 : (isWide ? 100 : 130),
            fontWeight: 900, color: ac,
            lineHeight: 0.85, fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em", marginBottom: isTall ? 8 : 6,
          }}>
            +{diff}
          </div>
        ) : (
          <div style={{
            fontSize: isTall ? 120 : (isWide ? 80 : 100),
            fontWeight: 900, color: ac,
            lineHeight: 0.85, fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em", marginBottom: isTall ? 8 : 6,
          }}>
            {upside}/10
          </div>
        )}
        <div style={{
          fontSize: isTall ? 20 : 15, fontWeight: 600,
          color: "rgba(255,255,255,0.32)",
          textTransform: "uppercase", letterSpacing: "0.12em",
          marginBottom: isTall ? 28 : 18,
        }}>
          {diff != null && diff > 0 ? "PROJECTED IMPROVEMENT" : "UPSIDE RATING"}
        </div>

        {/* Player name */}
        <div style={{
          fontSize: isTall ? 92 : (isWide ? 60 : 76),
          fontWeight: 900, color: "#fff",
          lineHeight: 0.9, letterSpacing: "-0.03em", marginBottom: 4,
        }}>
          {lastName}
        </div>
        <div style={{
          fontSize: isTall ? 46 : (isWide ? 30 : 38),
          fontWeight: 700, color: "rgba(255,255,255,0.45)",
          letterSpacing: "-0.01em", marginBottom: isTall ? 18 : 12,
        }}>
          {firstName}
        </div>

        {/* Team pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}12`, border: `1px solid ${ac}30`,
          borderRadius: 20, padding: "5px 14px",
          marginBottom: isTall ? 24 : 16,
        }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{top.team}</span>
          {top.position && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: ac, display: "inline-block" }} />
              <span style={{ fontSize: 14, color: ac, fontWeight: 700 }}>{top.position}</span>
            </>
          )}
        </div>

        {/* Projection context */}
        {proj > 0 && (
          <div style={{
            display: "inline-flex", gap: 20,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14, padding: isTall ? "14px 28px" : "10px 20px",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: isTall ? 32 : 24, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{proj}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Projection</div>
            </div>
            {ceil > 0 && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: isTall ? 32 : 24, fontWeight: 900, color: ac, fontVariantNumeric: "tabular-nums" }}>{ceil}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Ceiling</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, marginTop: isTall ? 24 : 16, position: "relative", zIndex: 2 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 6: TRADE TARGET
// Shows projection score + value indicator prominently
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutTradeTarget({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const top = players[0];
  if (!top) return <div style={{ width: w, height: h, background: "#060a14" }} />;
  const isTall = h > w;
  const isWide = w > h;
  const teamColour = getTeamColour(top.team);
  const ac = resolveAccentColor(angle, options, teamColour, players[0]?.team);
  const proj    = Math.round(Number(top.projection_final ?? 0));
  const upside  = Number(top.upside_rating ?? 0).toFixed(1);
  const ceil    = Math.round(Number(top.ceiling_estimate ?? 0));
  const floor   = Math.round(Number(top.floor_estimate ?? 0));
  const nameParts = top.player_name.split(" ");
  const lastName  = nameParts.slice(-1)[0];
  const firstName = nameParts.slice(0, -1).join(" ");

  return (
    <CanvasShell w={w} h={h} angle={angle} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={players[0]?.team ?? ""}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: isTall ? 16 : 8 }}>
        <BrandBar accentColor={ac} />
      </div>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: isTall ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: isTall ? "center" : "left",
      }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}18`, border: `1.5px solid ${ac}50`,
          borderRadius: 30, padding: isTall ? "8px 24px" : "6px 18px",
          marginBottom: isTall ? 28 : 18,
        }}>
          <span style={{
            fontSize: isTall ? 16 : 13, fontWeight: 900,
            color: ac, textTransform: "uppercase", letterSpacing: "0.14em",
          }}>
            TRADE TARGET
          </span>
        </div>

        {/* Player name */}
        <div style={{
          fontSize: isTall ? 96 : (isWide ? 64 : 80),
          fontWeight: 900, color: "#fff",
          lineHeight: 0.9, letterSpacing: "-0.03em", marginBottom: 4,
        }}>
          {lastName}
        </div>
        <div style={{
          fontSize: isTall ? 48 : (isWide ? 32 : 40),
          fontWeight: 700, color: "rgba(255,255,255,0.45)",
          letterSpacing: "-0.01em", marginBottom: isTall ? 20 : 14,
        }}>
          {firstName}
        </div>

        {/* Team pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}12`, border: `1px solid ${ac}30`,
          borderRadius: 20, padding: "5px 14px",
          marginBottom: isTall ? 28 : 20,
        }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{top.team}</span>
          {top.position && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: ac, display: "inline-block" }} />
              <span style={{ fontSize: 14, color: ac, fontWeight: 700 }}>{top.position}</span>
            </>
          )}
        </div>

        {/* Projection — large */}
        <div style={{ marginBottom: isTall ? 24 : 16 }}>
          <div style={{
            fontSize: isTall ? 24 : 18, fontWeight: 700,
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase", letterSpacing: "0.12em",
            marginBottom: 4,
          }}>
            Projection
          </div>
          <div style={{
            fontSize: isTall ? 140 : (isWide ? 96 : 116),
            fontWeight: 900, color: ac,
            lineHeight: 0.85, fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em",
          }}>
            {proj > 0 ? proj : angle.statFn(top)}
          </div>
        </div>

        {/* Value indicator row */}
        <div style={{
          display: "inline-flex", gap: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: isTall ? "14px 28px" : "10px 20px",
        }}>
          {[
            { label: "Upside", val: `${upside}/10` },
            { label: "Ceiling", val: ceil > 0 ? `${ceil}` : "—" },
            { label: "Floor",   val: floor > 0 ? `${floor}` : "—" },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: "center", minWidth: isTall ? 80 : 60 }}>
              <div style={{ fontSize: isTall ? 28 : 22, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{val}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flexShrink: 0, marginTop: isTall ? 28 : 20 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 7: AVOID PLAYER
// Warning-style layout with low projection and risk indicator
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutAvoidPlayer({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const top = players[0];
  if (!top) return <div style={{ width: w, height: h, background: "#060a14" }} />;
  const isTall = h > w;
  const isWide = w > h;
  const teamColour = getTeamColour(top.team);
  const ac = resolveAccentColor(angle, options, teamColour, players[0]?.team);
  const proj    = Math.round(Number(top.projection_final ?? 0));
  const risk    = Math.round(Number(top.risk_rating ?? 0));
  const matchup = Math.round(Number(top.matchup_rating ?? 0));
  const nameParts = top.player_name.split(" ");
  const lastName  = nameParts.slice(-1)[0];
  const firstName = nameParts.slice(0, -1).join(" ");
  const warnColor = "#EF4444";

  return (
    <CanvasShell w={w} h={h} angle={{ ...angle, accentColor: warnColor }} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={top.team}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: isTall ? 16 : 8 }}>
        <BrandBar accentColor={warnColor} />
      </div>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: isTall ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: isTall ? "center" : "left",
      }}>
        {/* Warning badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          background: `${warnColor}1a`, border: `1.5px solid ${warnColor}55`,
          borderRadius: 30, padding: isTall ? "8px 24px" : "6px 18px",
          marginBottom: isTall ? 28 : 18,
        }}>
          <span style={{
            fontSize: isTall ? 20 : 16, lineHeight: 1,
          }}>
            ⚠
          </span>
          <span style={{
            fontSize: isTall ? 16 : 13, fontWeight: 900,
            color: warnColor, textTransform: "uppercase", letterSpacing: "0.14em",
          }}>
            AVOID THIS WEEK
          </span>
        </div>

        {/* Player name */}
        <div style={{
          fontSize: isTall ? 100 : (isWide ? 66 : 82),
          fontWeight: 900, color: "#fff",
          lineHeight: 0.9, letterSpacing: "-0.03em", marginBottom: 4,
        }}>
          {lastName}
        </div>
        <div style={{
          fontSize: isTall ? 50 : (isWide ? 34 : 42),
          fontWeight: 700, color: "rgba(255,255,255,0.45)",
          letterSpacing: "-0.01em", marginBottom: isTall ? 18 : 12,
        }}>
          {firstName}
        </div>

        {/* Team pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${warnColor}12`, border: `1px solid ${warnColor}30`,
          borderRadius: 20, padding: "5px 14px",
          marginBottom: isTall ? 28 : 20,
        }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{top.team}</span>
          {top.position && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: warnColor, display: "inline-block" }} />
              <span style={{ fontSize: 14, color: warnColor, fontWeight: 700 }}>{top.position}</span>
            </>
          )}
        </div>

        {/* Low projection */}
        <div style={{ marginBottom: isTall ? 24 : 16 }}>
          <div style={{
            fontSize: isTall ? 22 : 17, fontWeight: 700,
            color: "rgba(255,255,255,0.32)",
            textTransform: "uppercase", letterSpacing: "0.12em",
            marginBottom: 4,
          }}>
            Projection
          </div>
          <div style={{
            fontSize: isTall ? 140 : (isWide ? 96 : 116),
            fontWeight: 900, color: warnColor,
            lineHeight: 0.85, fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em",
          }}>
            {proj > 0 ? proj : angle.statFn(top)}
          </div>
        </div>

        {/* Context row */}
        <div style={{
          display: "inline-flex", gap: 12,
          background: `${warnColor}08`,
          border: `1px solid ${warnColor}20`,
          borderRadius: 14, padding: isTall ? "14px 28px" : "10px 20px",
        }}>
          {[
            { label: "Risk Score",    val: risk    > 0 ? `${risk}/100`  : "—" },
            { label: "Matchup",       val: matchup > 0 ? `${matchup}/100` : "—" },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: "center", minWidth: isTall ? 100 : 80 }}>
              <div style={{ fontSize: isTall ? 28 : 22, fontWeight: 900, color: warnColor, fontVariantNumeric: "tabular-nums" }}>{val}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flexShrink: 0, marginTop: isTall ? 28 : 20 }}>
        <Footer accentColor={warnColor} />
      </div>
    </CanvasShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT ENGINE 8: MATCHUP ADVANTAGE
// Player name, matchup rating, and contextual stat insight
// ═══════════════════════════════════════════════════════════════════════════════

export function LayoutMatchupAdvantage({
  angle, players, w, h, options,
}: {
  angle: StatAngle; players: ContentPlayer[]; w: number; h: number; options: GraphicOptions;
}) {
  const top = players[0];
  if (!top) return <div style={{ width: w, height: h, background: "#060a14" }} />;
  const isTall = h > w;
  const isWide = w > h;
  const teamColour = getTeamColour(top.team);
  const ac = resolveAccentColor(angle, options, teamColour, players[0]?.team);
  const matchup = Math.round(Number(top.matchup_rating ?? 0));
  const proj    = Math.round(Number(top.projection_final ?? 0));
  const ceil    = Math.round(Number(top.ceiling_estimate ?? 0));
  const nameParts = top.player_name.split(" ");
  const lastName  = nameParts.slice(-1)[0];
  const firstName = nameParts.slice(0, -1).join(" ");

  return (
    <CanvasShell w={w} h={h} angle={angle} options={options} teamColour={teamColour} resolvedAccent={ac} firstTeam={players[0]?.team ?? ""}>
      {/* Header */}
      <div style={{ flexShrink: 0, marginBottom: isTall ? 16 : 8 }}>
        <BrandBar accentColor={ac} />
      </div>

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: isTall ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: isTall ? "center" : "left",
      }}>
        {/* Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}18`, border: `1.5px solid ${ac}50`,
          borderRadius: 30, padding: isTall ? "8px 24px" : "6px 18px",
          marginBottom: isTall ? 28 : 18,
        }}>
          <span style={{
            fontSize: isTall ? 16 : 13, fontWeight: 900,
            color: ac, textTransform: "uppercase", letterSpacing: "0.14em",
          }}>
            BEST MATCHUP
          </span>
        </div>

        {/* Player name */}
        <div style={{
          fontSize: isTall ? 100 : (isWide ? 66 : 82),
          fontWeight: 900, color: "#fff",
          lineHeight: 0.9, letterSpacing: "-0.03em", marginBottom: 4,
        }}>
          {lastName}
        </div>
        <div style={{
          fontSize: isTall ? 50 : (isWide ? 34 : 42),
          fontWeight: 700, color: "rgba(255,255,255,0.45)",
          letterSpacing: "-0.01em", marginBottom: isTall ? 18 : 12,
        }}>
          {firstName}
        </div>

        {/* Team pill */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: `${ac}12`, border: `1px solid ${ac}30`,
          borderRadius: 20, padding: "5px 14px",
          marginBottom: isTall ? 32 : 22,
        }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>{top.team}</span>
          {top.position && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: ac, display: "inline-block" }} />
              <span style={{ fontSize: 14, color: ac, fontWeight: 700 }}>{top.position}</span>
            </>
          )}
        </div>

        {/* Matchup rating — centrepiece */}
        <div style={{ marginBottom: isTall ? 12 : 8 }}>
          <div style={{
            fontSize: isTall ? 22 : 17, fontWeight: 700,
            color: "rgba(255,255,255,0.32)",
            textTransform: "uppercase", letterSpacing: "0.12em",
            marginBottom: 4,
          }}>
            Avg vs Opponent
          </div>
          <div style={{
            fontSize: isTall ? 150 : (isWide ? 100 : 120),
            fontWeight: 900, color: ac,
            lineHeight: 0.85, fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.04em",
          }}>
            {matchup > 0 ? matchup : angle.statFn(top)}
          </div>
          <div style={{
            fontSize: isTall ? 20 : 15, fontWeight: 600,
            color: "rgba(255,255,255,0.25)",
            textTransform: "uppercase", letterSpacing: "0.12em",
            marginTop: 4,
          }}>
            {matchup > 0 ? "MATCHUP RATING / 100" : angle.statLabel}
          </div>
        </div>

        {/* Stat insight row */}
        <div style={{
          display: "inline-flex", gap: 12, marginTop: isTall ? 20 : 14,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, padding: isTall ? "14px 28px" : "10px 20px",
        }}>
          {[
            { label: "Projection", val: proj > 0 ? `${proj}` : "—" },
            { label: "Ceiling",    val: ceil > 0 ? `${ceil}` : "—" },
          ].map(({ label, val }) => (
            <div key={label} style={{ textAlign: "center", minWidth: isTall ? 90 : 70 }}>
              <div style={{ fontSize: isTall ? 32 : 26, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{val}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flexShrink: 0, marginTop: isTall ? 28 : 20 }}>
        <Footer accentColor={ac} />
      </div>
    </CanvasShell>
  );
}

// ─── Main dispatcher ───────────────────────────────────────────────────────────

export function GraphicCanvas({
  layout, angle, players, w, h, options,
}: {
  layout: LayoutEngine;
  angle: StatAngle;
  players: ContentPlayer[];
  w: number; h: number;
  options: GraphicOptions;
}) {
  switch (layout) {
    case "stat_card":          return <LayoutStatCard          angle={angle} players={players} w={w} h={h} options={options} />;
    case "battle":             return <LayoutBattle            angle={angle} players={players} w={w} h={h} options={options} />;
    case "captain_pick":       return <LayoutCaptainPick       angle={angle} players={players} w={w} h={h} options={options} />;
    case "breakout_alert":     return <LayoutBreakoutAlert     angle={angle} players={players} w={w} h={h} options={options} />;
    case "trade_target":       return <LayoutTradeTarget       angle={angle} players={players} w={w} h={h} options={options} />;
    case "avoid_player":       return <LayoutAvoidPlayer       angle={angle} players={players} w={w} h={h} options={options} />;
    case "matchup_advantage":  return <LayoutMatchupAdvantage  angle={angle} players={players} w={w} h={h} options={options} />;
    default:                   return <LayoutLeaderboard       angle={angle} players={players} w={w} h={h} options={options} />;
  }
}
