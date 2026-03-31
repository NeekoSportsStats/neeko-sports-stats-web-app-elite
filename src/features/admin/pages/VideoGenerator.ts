export interface VideoSlideData {
  angleTitle: string;
  angleSubtitle: string;
  statLabel: string;
  statValue: string;
  playerName: string;
  team: string;
  position: string | null;
  accentColor: string;
  secondaryStats: Array<{ label: string; value: string }>;
  leaderboardRows?: Array<{ rank: number; name: string; stat: string }>;
  roundLabel?: string;
  statHighlight?: string;
  ctaText?: string;
  aiAnalysisText?: string;
}

export type VideoTemplate =
  | "stat_video"
  | "projection_battle"
  | "leaderboard_video"
  | "player_spotlight"
  | "breakout_alert"
  | "captain_picks"
  | "trade_targets";

export type AnimationSpeed = "slow" | "medium" | "fast";
export type VideoBackground = "dark_gradient" | "stadium_lights" | "grass_texture" | "analytics_grid" | "team_colour" | "ai_stadium" | "ai_crowd" | "ai_field" | "ai_abstract" | "ai_players";
export type ExportSize = "tiktok_reels" | "instagram_post";
export type SlideTransition = "fade" | "slide" | "zoom" | "bounce";

export interface VideoConfig {
  template: VideoTemplate;
  numSlides: number;
  slideDurationSec: number;
  animationSpeed: AnimationSpeed;
  background: VideoBackground;
  exportSize: ExportSize;
  narrationEnabled: boolean;
  transition: SlideTransition;
  showIntro: boolean;
  showOutro: boolean;
  soundEffectsEnabled: boolean;
  aiVideoUrl?: string;
}

export const DEFAULT_VIDEO_CONFIG: VideoConfig = {
  template: "stat_video",
  numSlides: 4,
  slideDurationSec: 3,
  animationSpeed: "medium",
  background: "dark_gradient",
  exportSize: "tiktok_reels",
  narrationEnabled: false,
  transition: "fade",
  showIntro: false,
  showOutro: false,
  soundEffectsEnabled: false,
};

function getDimensions(size: ExportSize): { w: number; h: number } {
  if (size === "instagram_post") return { w: 1080, h: 1080 };
  return { w: 1080, h: 1920 };
}

const FPS = 30;
const TRANSITION_FRAMES = 12;

function speedMult(speed: AnimationSpeed): number {
  if (speed === "slow")   return 0.55;
  if (speed === "fast")   return 1.7;
  return 1.0;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeInCubic(t: number): number {
  return t * t * t;
}

function fillCenteredText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number) {
  ctx.fillText(text, cx, y);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
  return currentY;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: VideoBackground,
  accentColor: string,
  vw: number,
  vh: number,
  aiVideoEl?: HTMLVideoElement,
) {
  switch (bg) {
    case "stadium_lights": {
      const grad = ctx.createLinearGradient(0, 0, vw, vh);
      grad.addColorStop(0, "#0a0f1e");
      grad.addColorStop(1, "#080c18");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, vw, vh);
      const s1 = ctx.createRadialGradient(vw * 0.25, vh * 0.1, 0, vw * 0.25, vh * 0.1, vw * 0.55);
      s1.addColorStop(0, "rgba(255,255,200,0.06)");
      s1.addColorStop(1, "transparent");
      ctx.fillStyle = s1;
      ctx.fillRect(0, 0, vw, vh);
      const s2 = ctx.createRadialGradient(vw * 0.75, vh * 0.15, 0, vw * 0.75, vh * 0.15, vw * 0.5);
      s2.addColorStop(0, "rgba(255,255,200,0.05)");
      s2.addColorStop(1, "transparent");
      ctx.fillStyle = s2;
      ctx.fillRect(0, 0, vw, vh);
      break;
    }
    case "grass_texture": {
      const grad = ctx.createLinearGradient(0, 0, vw, vh);
      grad.addColorStop(0, "#0c1a0e");
      grad.addColorStop(0.5, "#0f2211");
      grad.addColorStop(1, "#091408");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = "rgba(255,255,255,0.025)";
      ctx.lineWidth = 60;
      for (let y = -60; y < vh + 60; y += 120) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
      }
      break;
    }
    case "analytics_grid": {
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      const step = 80;
      for (let x = 0; x <= vw; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke();
      }
      for (let y = 0; y <= vh; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
      }
      const glow = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, vw * 0.7);
      glow.addColorStop(0, accentColor + "18");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, vw, vh);
      break;
    }
    case "team_colour": {
      const grad = ctx.createLinearGradient(0, 0, vw, vh);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#020617");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, vw, vh);
      const tg = ctx.createLinearGradient(0, 0, vw, 0);
      tg.addColorStop(0, accentColor + "28");
      tg.addColorStop(0.5, accentColor + "10");
      tg.addColorStop(1, "transparent");
      ctx.fillStyle = tg;
      ctx.fillRect(0, 0, vw, vh);
      break;
    }
    case "ai_crowd":
    case "ai_field":
    case "ai_players": {
      if (aiVideoEl && aiVideoEl.readyState >= 2) {
        const vAspect = aiVideoEl.videoWidth / aiVideoEl.videoHeight;
        const cAspect = vw / vh;
        let sx = 0, sy = 0, sw = aiVideoEl.videoWidth, sh = aiVideoEl.videoHeight;
        if (vAspect > cAspect) {
          sw = aiVideoEl.videoHeight * cAspect;
          sx = (aiVideoEl.videoWidth - sw) / 2;
        } else {
          sh = aiVideoEl.videoWidth / cAspect;
          sy = (aiVideoEl.videoHeight - sh) / 2;
        }
        ctx.drawImage(aiVideoEl, sx, sy, sw, sh, 0, 0, vw, vh);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, vw, vh);
      } else {
        const grad = ctx.createLinearGradient(0, 0, vw, vh);
        grad.addColorStop(0, "#08111a");
        grad.addColorStop(1, "#040a10");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, vw, vh);
      }
      const overlay = ctx.createRadialGradient(vw / 2, vh * 0.4, 0, vw / 2, vh * 0.4, vw * 0.65);
      overlay.addColorStop(0, accentColor + "18");
      overlay.addColorStop(1, "transparent");
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, vw, vh);
      break;
    }
    case "ai_abstract": {
      if (aiVideoEl && aiVideoEl.readyState >= 2) {
        const vAspect = aiVideoEl.videoWidth / aiVideoEl.videoHeight;
        const cAspect = vw / vh;
        let sx = 0, sy = 0, sw = aiVideoEl.videoWidth, sh = aiVideoEl.videoHeight;
        if (vAspect > cAspect) {
          sw = aiVideoEl.videoHeight * cAspect;
          sx = (aiVideoEl.videoWidth - sw) / 2;
        } else {
          sh = aiVideoEl.videoWidth / cAspect;
          sy = (aiVideoEl.videoHeight - sh) / 2;
        }
        ctx.drawImage(aiVideoEl, sx, sy, sw, sh, 0, 0, vw, vh);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, vw, vh);
      } else {
        ctx.fillStyle = "#050810";
        ctx.fillRect(0, 0, vw, vh);
        ctx.strokeStyle = accentColor + "12";
        ctx.lineWidth = 1;
        for (let x = 0; x <= vw; x += 100) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke();
        }
        for (let y = 0; y <= vh; y += 100) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
        }
      }
      const glow = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, vw * 0.7);
      glow.addColorStop(0, accentColor + "20");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, vw, vh);
      break;
    }
    case "ai_stadium": {
      if (aiVideoEl && aiVideoEl.readyState >= 2) {
        const vAspect = aiVideoEl.videoWidth / aiVideoEl.videoHeight;
        const cAspect = vw / vh;
        let sx = 0, sy = 0, sw = aiVideoEl.videoWidth, sh = aiVideoEl.videoHeight;
        if (vAspect > cAspect) {
          sw = aiVideoEl.videoHeight * cAspect;
          sx = (aiVideoEl.videoWidth - sw) / 2;
        } else {
          sh = aiVideoEl.videoWidth / cAspect;
          sy = (aiVideoEl.videoHeight - sh) / 2;
        }
        ctx.drawImage(aiVideoEl, sx, sy, sw, sh, 0, 0, vw, vh);
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, vw, vh);
      } else {
        const grad = ctx.createLinearGradient(0, 0, vw, vh);
        grad.addColorStop(0, "#060c1a");
        grad.addColorStop(1, "#030710");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, vw, vh);
        const s1 = ctx.createRadialGradient(vw * 0.3, vh * 0.15, 0, vw * 0.3, vh * 0.15, vw * 0.5);
        s1.addColorStop(0, "rgba(255,240,180,0.08)");
        s1.addColorStop(1, "transparent");
        ctx.fillStyle = s1;
        ctx.fillRect(0, 0, vw, vh);
        const s2 = ctx.createRadialGradient(vw * 0.7, vh * 0.12, 0, vw * 0.7, vh * 0.12, vw * 0.45);
        s2.addColorStop(0, "rgba(255,240,180,0.06)");
        s2.addColorStop(1, "transparent");
        ctx.fillStyle = s2;
        ctx.fillRect(0, 0, vw, vh);
      }
      const accentGlow = ctx.createLinearGradient(0, vh * 0.6, 0, vh);
      accentGlow.addColorStop(0, accentColor + "15");
      accentGlow.addColorStop(1, "transparent");
      ctx.fillStyle = accentGlow;
      ctx.fillRect(0, 0, vw, vh);
      break;
    }
    default: {
      const grad = ctx.createLinearGradient(0, 0, vw, vh);
      grad.addColorStop(0, "#0f172a");
      grad.addColorStop(1, "#020617");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, vw, vh);
      ctx.strokeStyle = "rgba(255,255,255,0.018)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= vw; x += 90) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, vh); ctx.stroke();
      }
      for (let y = 0; y <= vh; y += 90) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(vw, y); ctx.stroke();
      }
      const glow1 = ctx.createRadialGradient(vw / 2, -100, 0, vw / 2, -100, 900);
      glow1.addColorStop(0, accentColor + "22");
      glow1.addColorStop(1, "transparent");
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, vw, vh);
      break;
    }
  }
}

function drawAccentBar(ctx: CanvasRenderingContext2D, accentColor: string, vw: number) {
  const grad = ctx.createLinearGradient(0, 0, vw, 0);
  grad.addColorStop(0, accentColor);
  grad.addColorStop(0.6, accentColor + "88");
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, vw, 6);
}

function drawBrand(ctx: CanvasRenderingContext2D, accentColor: string, alpha: number, vw: number) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.roundRect(72, 72, 64, 64, 14);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.font = "bold 36px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 72 + 32, 72 + 32);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "bold 30px Inter, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("NEEKO SPORTS STATS", 152, 72 + 32);
  ctx.globalAlpha = 1;
  void vw;
}

function drawFooter(ctx: CanvasRenderingContext2D, accentColor: string, alpha: number, vw: number, vh: number, ctaText?: string) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(0, vh - 100, vw, 1);

  if (ctaText) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "400 26px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(ctaText, 72, vh - 72);

    ctx.fillStyle = accentColor;
    ctx.font = "bold 28px Inter, Arial, sans-serif";
    ctx.fillText("neekostats.com.au", 72, vh - 42);
  } else {
    ctx.fillStyle = accentColor;
    ctx.font = "bold 30px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("neekostats.com.au", 72, vh - 56);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = "24px Inter, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("#AFLFantasy · #FantasyFooty", vw - 72, vh - 56);
  }
  ctx.globalAlpha = 1;
}

function drawRoundLabel(ctx: CanvasRenderingContext2D, roundLabel: string, accentColor: string, alpha: number, vw: number) {
  ctx.globalAlpha = alpha;
  const labelW = ctx.measureText(roundLabel).width + 32;
  const x = vw - 72 - labelW;
  const y = 72;
  ctx.fillStyle = accentColor + "20";
  ctx.strokeStyle = accentColor + "55";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, labelW, 40, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.font = "600 22px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(roundLabel, x + labelW / 2, y + 20);
  ctx.globalAlpha = 1;
}

function drawStatHighlight(ctx: CanvasRenderingContext2D, label: string, accentColor: string, alpha: number, cx: number, y: number) {
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "700 28px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(label.toUpperCase(), cx, y);
  ctx.globalAlpha = 1;
  void accentColor;
}

function drawAIAnalysisCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  accentColor: string,
  alpha: number,
  vw: number,
  vh: number,
) {
  if (!text || alpha <= 0) return;
  const maxWidth = vw * 0.72;
  const padding = 28;
  const fontSize = Math.max(22, Math.round(vw * 0.022));
  const lineHeight = fontSize * 1.45;

  ctx.font = `500 ${fontSize}px Inter, Arial, sans-serif`;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth - padding * 2 && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const boxH = lines.length * lineHeight + padding * 2 + 30;
  const boxY = vh - 160 - boxH;
  const boxX = (vw - maxWidth) / 2;

  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, maxWidth, boxH, 16);
  ctx.fill();
  ctx.strokeStyle = accentColor + "44";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = accentColor;
  ctx.font = `700 ${Math.round(fontSize * 0.85)}px Inter, Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("AI Insight", boxX + padding, boxY + padding + fontSize * 0.85);

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `500 ${fontSize}px Inter, Arial, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, boxX + padding, boxY + padding + fontSize * 0.85 + 8 + (i + 1) * lineHeight);
  });

  ctx.globalAlpha = 1;
}

interface SlideCtx {
  ctx: CanvasRenderingContext2D;
  data: VideoSlideData;
  config: VideoConfig;
  progress: number;
  vw: number;
  vh: number;
  aiVideoEl?: HTMLVideoElement;
}

function applyTransitionEffect(
  ctx: CanvasRenderingContext2D,
  transition: SlideTransition,
  tProgress: number,
  isExit: boolean,
  vw: number,
  vh: number,
) {
  const t = isExit ? tProgress : 1 - tProgress;
  switch (transition) {
    case "fade":
      ctx.globalAlpha = 1 - t;
      break;
    case "slide": {
      const offset = isExit ? -vw * t : vw * (1 - t);
      ctx.translate(offset, 0);
      break;
    }
    case "zoom": {
      const scale = isExit ? 1 - t * 0.15 : 0.85 + t * 0.15;
      ctx.translate(vw / 2, vh / 2);
      ctx.scale(scale, scale);
      ctx.translate(-vw / 2, -vh / 2);
      ctx.globalAlpha = 1 - t * 0.5;
      break;
    }
    case "bounce": {
      const bounce = isExit
        ? -vh * easeInCubic(t)
        : vh * (1 - easeOutCubic(t));
      ctx.translate(0, bounce);
      break;
    }
  }
}

function slideTitle({ ctx, data, config, progress, vw, vh, aiVideoEl }: SlideCtx) {
  const sm = speedMult(config.animationSpeed);
  const fadeIn  = Math.min(progress * 3 * sm, 1);
  const slideUp = easeOutCubic(Math.min(progress * 2 * sm, 1));

  drawBackground(ctx, config.background, data.accentColor, vw, vh, aiVideoEl);
  drawAccentBar(ctx, data.accentColor, vw);
  drawBrand(ctx, data.accentColor, fadeIn, vw);
  drawFooter(ctx, data.accentColor, fadeIn, vw, vh, data.ctaText);
  if (data.roundLabel) drawRoundLabel(ctx, data.roundLabel, data.accentColor, fadeIn, vw);

  const cx = vw / 2;
  const cy = vh / 2;
  const yOff = (1 - slideUp) * 60;

  ctx.globalAlpha = fadeIn;

  const lineW = 80 + slideUp * 40;
  ctx.fillStyle = data.accentColor;
  ctx.fillRect(cx - lineW / 2, cy - 120 + yOff, lineW, 5);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 92px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  wrapText(ctx, data.angleTitle, cx, cy - 40 + yOff, vw - 160, 108);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "400 38px Inter, Arial, sans-serif";
  fillCenteredText(ctx, data.angleSubtitle, cx, cy + 120 + yOff);

  ctx.globalAlpha = 1;
}

function slideBigStat({ ctx, data, config, progress, vw, vh, aiVideoEl }: SlideCtx) {
  const sm    = speedMult(config.animationSpeed);
  const fadeIn = easeOutCubic(Math.min(progress * 2 * sm, 1));
  const scale  = 0.6 + easeOutCubic(Math.min(progress * 1.5 * sm, 1)) * 0.4;

  drawBackground(ctx, config.background, data.accentColor, vw, vh, aiVideoEl);
  drawAccentBar(ctx, data.accentColor, vw);
  drawBrand(ctx, data.accentColor, fadeIn, vw);
  drawFooter(ctx, data.accentColor, fadeIn, vw, vh, data.ctaText);
  if (data.roundLabel) drawRoundLabel(ctx, data.roundLabel, data.accentColor, fadeIn, vw);

  const cx = vw / 2;
  const cy = vh / 2;

  ctx.globalAlpha = fadeIn;

  const statLabel = data.statHighlight ?? data.statLabel;
  if (statLabel) drawStatHighlight(ctx, statLabel, data.accentColor, fadeIn, cx, cy - 130);

  ctx.fillStyle = data.accentColor;
  ctx.font = "700 38px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(data.statLabel.toUpperCase(), cx, cy - 120);

  ctx.save();
  ctx.translate(cx, cy + 20);
  ctx.scale(scale, scale);
  ctx.fillStyle = data.accentColor;
  ctx.font = "900 200px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(data.statValue, 0, 0);
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "700 48px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(data.playerName, cx, cy + 200);

  if (data.aiAnalysisText) {
    const aiAlpha = easeOutCubic(Math.max(0, Math.min((progress - 0.6) * 3 * sm, 1)));
    drawAIAnalysisCaption(ctx, data.aiAnalysisText, data.accentColor, fadeIn * aiAlpha, vw, vh);
  }

  ctx.globalAlpha = 1;
}

function slidePlayerSpotlight({ ctx, data, config, progress, vw, vh, aiVideoEl }: SlideCtx) {
  const sm      = speedMult(config.animationSpeed);
  const fadeIn  = easeOutCubic(Math.min(progress * 2 * sm, 1));
  const cardsIn = easeOutCubic(Math.max(0, Math.min((progress - 0.25 / sm) * 2 * sm, 1)));

  drawBackground(ctx, config.background, data.accentColor, vw, vh, aiVideoEl);
  drawAccentBar(ctx, data.accentColor, vw);
  drawBrand(ctx, data.accentColor, fadeIn, vw);
  drawFooter(ctx, data.accentColor, fadeIn, vw, vh, data.ctaText);
  if (data.roundLabel) drawRoundLabel(ctx, data.roundLabel, data.accentColor, fadeIn, vw);

  const cx = vw / 2;
  ctx.globalAlpha = fadeIn;

  const nameCY = vh * 0.35;
  const nameParts = data.playerName.split(" ");
  if (nameParts.length >= 2) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "700 64px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(nameParts.slice(0, -1).join(" "), cx, nameCY - 60);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 110px Inter, Arial, sans-serif";
    ctx.fillText(nameParts[nameParts.length - 1], cx, nameCY + 60);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 110px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(data.playerName, cx, nameCY);
  }

  const pillText = data.position ? `${data.team} · ${data.position}` : data.team;
  ctx.font = "600 34px Inter, Arial, sans-serif";
  const pillW = ctx.measureText(pillText).width + 48;
  const pillX = cx - pillW / 2;
  const pillY = nameCY + 88;
  ctx.fillStyle = data.accentColor + "22";
  ctx.strokeStyle = data.accentColor + "55";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, 60, 30);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = data.accentColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pillText, cx, pillY + 30);

  ctx.globalAlpha = fadeIn * cardsIn;
  const cardTop = nameCY + 200;
  const cardH = 140;
  const cardGap = 20;
  const cardCount = Math.min(data.secondaryStats.length, 3);
  const totalCardsW = vw - 144;
  const cardW = (totalCardsW - (cardCount - 1) * cardGap) / cardCount;

  for (let i = 0; i < cardCount; i++) {
    const stat = data.secondaryStats[i];
    const xPos = 72 + i * (cardW + cardGap);
    const slideY = (1 - cardsIn) * 40;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(xPos, cardTop + slideY, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = data.accentColor;
    ctx.font = "800 52px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(stat.value, xPos + cardW / 2, cardTop + slideY + 80);

    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.font = "500 26px Inter, Arial, sans-serif";
    ctx.fillText(stat.label.toUpperCase(), xPos + cardW / 2, cardTop + slideY + 118);
  }

  if (data.aiAnalysisText) {
    const aiAlpha = easeOutCubic(Math.max(0, Math.min((progress - 0.5) * 2 * sm, 1)));
    drawAIAnalysisCaption(ctx, data.aiAnalysisText, data.accentColor, fadeIn * aiAlpha, vw, vh);
  }

  ctx.globalAlpha = 1;
}

function slideLeaderboard({ ctx, data, config, progress, vw, vh, aiVideoEl }: SlideCtx) {
  const sm     = speedMult(config.animationSpeed);
  const fadeIn = easeOutCubic(Math.min(progress * 2 * sm, 1));
  const rows   = data.leaderboardRows ?? [];

  drawBackground(ctx, config.background, data.accentColor, vw, vh, aiVideoEl);
  drawAccentBar(ctx, data.accentColor, vw);
  drawBrand(ctx, data.accentColor, fadeIn, vw);
  drawFooter(ctx, data.accentColor, fadeIn, vw, vh, data.ctaText);
  if (data.roundLabel) drawRoundLabel(ctx, data.roundLabel, data.accentColor, fadeIn, vw);

  ctx.globalAlpha = fadeIn;
  const cx = vw / 2;
  const topY = 220;

  ctx.fillStyle = data.accentColor;
  ctx.font = "700 36px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(data.angleTitle.toUpperCase(), cx, topY);

  const rowH = 100;
  const rowPad = 14;
  const tableTop = topY + 60;
  const maxRows = Math.min(rows.length, 8);

  for (let i = 0; i < maxRows; i++) {
    const row = rows[i];
    const slideIn = easeOutCubic(Math.max(0, Math.min((progress * sm - i * 0.08) * 2, 1)));
    const yBase = tableTop + i * (rowH + rowPad) + (1 - slideIn) * 40;
    const alpha = fadeIn * slideIn;

    ctx.globalAlpha = alpha;

    const isTop = i === 0;
    ctx.fillStyle = isTop ? data.accentColor + "22" : "rgba(255,255,255,0.035)";
    ctx.strokeStyle = isTop ? data.accentColor + "44" : "rgba(255,255,255,0.06)";
    ctx.lineWidth = isTop ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(72, yBase, vw - 144, rowH, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isTop ? data.accentColor : "rgba(255,255,255,0.3)";
    ctx.font = isTop ? "800 40px Inter, Arial, sans-serif" : "600 36px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${row.rank}`, 110, yBase + rowH / 2);

    ctx.fillStyle = "#ffffff";
    ctx.font = isTop ? "700 42px Inter, Arial, sans-serif" : "500 36px Inter, Arial, sans-serif";
    ctx.fillText(row.name, 180, yBase + rowH / 2);

    ctx.fillStyle = isTop ? data.accentColor : "rgba(255,255,255,0.7)";
    ctx.font = isTop ? "800 42px Inter, Arial, sans-serif" : "700 36px Inter, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(row.stat, vw - 110, yBase + rowH / 2);
  }

  ctx.globalAlpha = 1;
}

function slideIntro({ ctx, data, config, progress, vw, vh, aiVideoEl }: SlideCtx) {
  const sm = speedMult(config.animationSpeed);
  const fadeIn = easeOutCubic(Math.min(progress * 2 * sm, 1));

  drawBackground(ctx, config.background, data.accentColor, vw, vh, aiVideoEl);

  const cx = vw / 2;
  const cy = vh / 2;

  ctx.globalAlpha = fadeIn;

  const glowG = ctx.createRadialGradient(cx, cy, 0, cx, cy, vw * 0.6);
  glowG.addColorStop(0, data.accentColor + "25");
  glowG.addColorStop(1, "transparent");
  ctx.fillStyle = glowG;
  ctx.fillRect(0, 0, vw, vh);

  ctx.fillStyle = data.accentColor;
  ctx.beginPath();
  ctx.roundRect(cx - 72, cy - 240, 144, 144, 28);
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.font = "900 80px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - 240 + 72);

  ctx.fillStyle = "#fff";
  ctx.font = "800 52px Inter, Arial, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("NEEKO SPORTS STATS", cx, cy - 40);

  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.font = "400 34px Inter, Arial, sans-serif";
  ctx.fillText(data.angleSubtitle || "AFL Fantasy Intelligence", cx, cy + 20);

  if (data.roundLabel) {
    ctx.fillStyle = data.accentColor;
    ctx.font = "700 38px Inter, Arial, sans-serif";
    ctx.fillText(data.roundLabel, cx, cy + 80);
  }

  ctx.globalAlpha = 1;
}

function slideOutro({ ctx, data, config, progress, vw, vh, aiVideoEl }: SlideCtx) {
  const sm = speedMult(config.animationSpeed);
  const fadeIn = easeOutCubic(Math.min(progress * 2 * sm, 1));
  const fadeOut = progress > 0.6 ? easeInCubic((progress - 0.6) / 0.4) : 0;
  const alpha = fadeIn * (1 - fadeOut * 0.2);

  drawBackground(ctx, config.background, data.accentColor, vw, vh, aiVideoEl);
  drawAccentBar(ctx, data.accentColor, vw);

  ctx.globalAlpha = alpha;
  const cx = vw / 2;
  const cy = vh / 2;

  ctx.fillStyle = data.accentColor;
  ctx.beginPath();
  ctx.roundRect(cx - 80, cy - 220, 160, 160, 28);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.font = "900 90px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - 220 + 80);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 56px Inter, Arial, sans-serif";
  ctx.textBaseline = "alphabetic";
  fillCenteredText(ctx, "NEEKO SPORTS STATS", cx, cy + 20);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "400 34px Inter, Arial, sans-serif";
  fillCenteredText(ctx, "AFL Fantasy Intelligence", cx, cy + 80);

  ctx.fillStyle = data.accentColor;
  ctx.font = "700 40px Inter, Arial, sans-serif";
  fillCenteredText(ctx, "Full rankings at neekostats.com.au", cx, cy + 160);

  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "500 28px Inter, Arial, sans-serif";
  fillCenteredText(ctx, "#AFLFantasy  #FantasyFooty  #AFLStats", cx, cy + 220);

  ctx.globalAlpha = 1;
}

function slideBranding({ ctx, data, config, progress, vw, vh, aiVideoEl }: SlideCtx) {
  const sm     = speedMult(config.animationSpeed);
  const fadeIn = easeOutCubic(Math.min(progress * 3 * sm, 1));
  const fadeOut = progress > 0.6 ? easeInCubic((progress - 0.6) / 0.4) : 0;
  const alpha  = fadeIn * (1 - fadeOut * 0.15);

  drawBackground(ctx, config.background, data.accentColor, vw, vh, aiVideoEl);
  drawAccentBar(ctx, data.accentColor, vw);

  ctx.globalAlpha = alpha;
  const cx = vw / 2;
  const cy = vh / 2;

  ctx.fillStyle = data.accentColor;
  ctx.beginPath();
  ctx.roundRect(cx - 80, cy - 220, 160, 160, 28);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.font = "900 90px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy - 220 + 80);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 56px Inter, Arial, sans-serif";
  ctx.textBaseline = "alphabetic";
  fillCenteredText(ctx, "NEEKO SPORTS STATS", cx, cy + 20);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "400 34px Inter, Arial, sans-serif";
  fillCenteredText(ctx, "AFL Fantasy Intelligence", cx, cy + 80);

  ctx.fillStyle = data.accentColor;
  ctx.font = "700 40px Inter, Arial, sans-serif";
  fillCenteredText(ctx, "neekostats.com.au", cx, cy + 180);

  ctx.globalAlpha = 1;
}

type SlidePainter = (s: SlideCtx) => void;

function getSlidePlan(config: VideoConfig): SlidePainter[] {
  const { template, numSlides, showIntro, showOutro } = config;

  const corePlans: Record<VideoTemplate, SlidePainter[]> = {
    stat_video:        [slideTitle, slideBigStat, slidePlayerSpotlight, slideBranding],
    projection_battle: [slideTitle, slideBigStat, slideLeaderboard, slideBranding],
    leaderboard_video: [slideTitle, slideLeaderboard, slideLeaderboard, slideBranding],
    player_spotlight:  [slideTitle, slidePlayerSpotlight, slideBigStat, slideBranding],
    breakout_alert:    [slideTitle, slideBigStat, slidePlayerSpotlight, slideBranding],
    captain_picks:     [slideTitle, slideLeaderboard, slidePlayerSpotlight, slideBranding],
    trade_targets:     [slideTitle, slideLeaderboard, slideBigStat, slideBranding],
  };

  const clamped = Math.max(2, Math.min(numSlides, 6));
  let base = corePlans[template] ?? corePlans.stat_video;
  if (clamped <= base.length) {
    base = base.slice(0, clamped);
  } else {
    const extra: SlidePainter[] = [slideBigStat, slideLeaderboard, slidePlayerSpotlight];
    const result = [...base];
    let ei = 0;
    while (result.length < clamped) {
      result.splice(result.length - 1, 0, extra[ei % extra.length]);
      ei++;
    }
    base = result.slice(0, clamped);
  }

  const plan: SlidePainter[] = [];
  if (showIntro) plan.push(slideIntro);
  plan.push(...base);
  if (showOutro) plan.push(slideOutro);

  return plan;
}

export async function generateVideo(
  data: VideoSlideData,
  onProgress: (pct: number) => void,
  config: VideoConfig = DEFAULT_VIDEO_CONFIG,
): Promise<Blob> {
  const isAIBg = config.background.startsWith("ai_");
  let aiVideoEl: HTMLVideoElement | undefined;

  if (isAIBg && config.aiVideoUrl) {
    await new Promise<void>((res) => {
      const vid = document.createElement("video");
      vid.src = config.aiVideoUrl!;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.crossOrigin = "anonymous";
      vid.oncanplay = () => { vid.play().catch(() => {}); res(); };
      vid.onerror = () => res();
      aiVideoEl = vid;
    });
  }

  return new Promise((resolve, reject) => {
    const { w: vw, h: vh } = getDimensions(config.exportSize);
    const canvas = document.createElement("canvas");
    canvas.width  = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("Canvas 2D not available")); return; }

    const slidePainters = getSlidePlan(config);

    const framesPerSlide = Math.round(config.slideDurationSec * FPS);
    const slideFrames = slidePainters.map(() => framesPerSlide);
    const totalFrames = slideFrames.reduce((a, b) => a + b, 0);

    const stream = canvas.captureStream(FPS);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (aiVideoEl) { aiVideoEl.pause(); aiVideoEl.src = ""; }
      resolve(new Blob(chunks, { type: mimeType }));
    };
    recorder.onerror = (e) => reject(new Error(`MediaRecorder error: ${(e as ErrorEvent).message ?? "unknown"}`));

    recorder.start();

    let globalFrame = 0;
    const frameDurationMs = 1000 / FPS;

    function renderFrame() {
      if (globalFrame > totalFrames) {
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
        onProgress(100);
        return;
      }

      onProgress(Math.round((globalFrame / totalFrames) * 95));

      let remaining = globalFrame;
      let slideIdx  = 0;
      let slideFrame = 0;
      for (let i = 0; i < slideFrames.length; i++) {
        if (remaining < slideFrames[i]) {
          slideIdx  = i;
          slideFrame = remaining;
          break;
        }
        remaining -= slideFrames[i];
        if (i === slideFrames.length - 1) {
          slideIdx = i;
          slideFrame = slideFrames[i] - 1;
        }
      }

      const progress = slideFrames[slideIdx] > 0 ? slideFrame / slideFrames[slideIdx] : 1;

      ctx.clearRect(0, 0, vw, vh);
      ctx.save();

      const isTransitionIn  = slideFrame < TRANSITION_FRAMES;
      const isTransitionOut = slideFrame > slideFrames[slideIdx] - TRANSITION_FRAMES - 1;

      if (config.transition !== "fade" && isTransitionIn && slideIdx > 0) {
        const tProg = 1 - slideFrame / TRANSITION_FRAMES;
        applyTransitionEffect(ctx, config.transition, tProg, false, vw, vh);
      } else if (config.transition !== "fade" && isTransitionOut && slideIdx < slidePainters.length - 1) {
        const tProg = (slideFrame - (slideFrames[slideIdx] - TRANSITION_FRAMES)) / TRANSITION_FRAMES;
        applyTransitionEffect(ctx, config.transition, tProg, true, vw, vh);
      } else if (config.transition === "fade") {
        if (isTransitionIn && slideIdx > 0) {
          ctx.globalAlpha = slideFrame / TRANSITION_FRAMES;
        } else if (isTransitionOut && slideIdx < slidePainters.length - 1) {
          ctx.globalAlpha = 1 - (slideFrame - (slideFrames[slideIdx] - TRANSITION_FRAMES)) / TRANSITION_FRAMES;
        }
      }

      slidePainters[slideIdx]({ ctx, data, config, progress, vw, vh, aiVideoEl });
      ctx.restore();

      globalFrame++;
      setTimeout(renderFrame, frameDurationMs);
    }

    setTimeout(renderFrame, 0);
  });
}
