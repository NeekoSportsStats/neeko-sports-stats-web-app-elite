import { getPublicStorageUrl } from "@/lib/storage/getPublicStorageUrl";
import type {
  StatAngle,
  ContentPlayer,
  GraphicOptions,
  LayoutEngine,
  BackgroundTheme,
  BackgroundSource,
  LogoPosition,
  AccentColourMode,
  RankHighlight,
  CtaPosition,
  LayoutOffsets,
} from "./GraphicTemplates";

// ─── Canonical Draft Type ──────────────────────────────────────────────────────

export interface ContentEngineDraft {
  plannerPostId:       string | null;
  mode:                "create" | "edit";
  contentMode:         "graphic" | "video";
  statAngleId:         string;
  template:            LayoutEngine;
  playerMode:          "auto" | "manual";
  backgroundSource:    BackgroundSource;
  selectedBackground:  BackgroundTheme;
  backgroundMediaUrl:  string | null;
  customUploadUrl:     string;
  accentMode:          AccentColourMode;
  customAccent:        string;
  autoTeamAccent:      boolean;
  showTeamAccent:      boolean;
  logoUrl:             string;
  logoPosition:        LogoPosition;
  playerImageUrl:      string;
  roundLabel:          string;
  statHighlight:       string;
  ctaText:             string;
  ctaPosition:         CtaPosition;
  rankHighlight:       RankHighlight;
  statInsight:         string;
  socialCaption:       string;
  appendHashtags:      boolean;
  exportSizeId:        string;
  includeAiAnalysis:   boolean;
  status:              "draft" | "ready" | "posted";
  lastSavedAt:         string | null;
}

export const DEFAULT_DRAFT: ContentEngineDraft = {
  plannerPostId:       null,
  mode:                "create",
  contentMode:         "graphic",
  statAngleId:         "top_projections",
  template:            "leaderboard",
  playerMode:          "auto",
  backgroundSource:    "gradient",
  selectedBackground:  "dark_gradient",
  backgroundMediaUrl:  null,
  customUploadUrl:     "",
  accentMode:          "neeko_gold",
  customAccent:        "#F59E0B",
  autoTeamAccent:      false,
  showTeamAccent:      false,
  logoUrl:             "",
  logoPosition:        "none",
  playerImageUrl:      "",
  roundLabel:          "",
  statHighlight:       "",
  ctaText:             "",
  ctaPosition:         "bottom_center",
  rankHighlight:       "top_player",
  statInsight:         "",
  socialCaption:       "",
  appendHashtags:      true,
  exportSizeId:        "instagram",
  includeAiAnalysis:   false,
  status:              "draft",
  lastSavedAt:         null,
};

// ─── Safe draft merge (for loading from DB) ────────────────────────────────────

export function mergeDraft(base: ContentEngineDraft, partial: Partial<ContentEngineDraft>): ContentEngineDraft {
  return {
    ...base,
    ...partial,
    plannerPostId: partial.plannerPostId ?? base.plannerPostId,
    mode:          partial.mode          ?? base.mode,
  };
}

// ─── Build GraphicOptions from draft (single source of truth) ─────────────────

export function buildGraphicRenderConfig(
  draft: ContentEngineDraft,
  angle: StatAngle,
  players: ContentPlayer[],
  exportSizeId: string,
  layoutOffsets?: LayoutOffsets | undefined,
): {
  options:      GraphicOptions;
  effectivePlayers: ContentPlayer[];
  exportW:      number;
  exportH:      number;
  isCarousel:   boolean;
} {
  const EXPORT_SIZES: Record<string, { w: number; h: number }> = {
    instagram: { w: 1080, h: 1080 },
    portrait:  { w: 1080, h: 1350 },
    landscape: { w: 1920, h: 1080 },
    twitter:   { w: 1200, h: 675  },
    story:     { w: 1080, h: 1920 },
    carousel:  { w: 1080, h: 1080 },
  };

  const size      = EXPORT_SIZES[exportSizeId] ?? EXPORT_SIZES.instagram;
  const isCarousel = exportSizeId === "carousel";
  const layout    = isCarousel ? "leaderboard" : draft.template;

  const rawMediaUrl = draft.backgroundSource === "upload"
    ? (draft.customUploadUrl.trim() || undefined)
    : (draft.backgroundMediaUrl ?? undefined);

  const resolvedMediaUrl = rawMediaUrl
    ? (getPublicStorageUrl(rawMediaUrl) ?? rawMediaUrl)
    : undefined;

  const options: GraphicOptions = {
    layout:                layout as LayoutEngine,
    background:            draft.selectedBackground,
    backgroundSource:      draft.backgroundSource,
    backgroundMediaUrl:    resolvedMediaUrl,
    showTeamAccent:        draft.showTeamAccent,
    playerImageUrl:        draft.playerImageUrl.trim() || undefined,
    logoUrl:               draft.logoUrl.trim()        || undefined,
    logoPosition:          draft.logoPosition !== "none" ? draft.logoPosition : undefined,
    roundLabel:            draft.roundLabel.trim()     || undefined,
    statHighlight:         draft.statHighlight.trim()  || undefined,
    ctaText:               draft.ctaText.trim()        || undefined,
    ctaPosition:           draft.ctaText.trim() ? draft.ctaPosition : "hidden",
    accentColourMode:      draft.accentMode,
    customAccentColour:    draft.accentMode === "custom" ? draft.customAccent : undefined,
    rankHighlight:         draft.rankHighlight,
    autoTeamAccent:        draft.autoTeamAccent,
    layoutOffsets,
    aiAnalysisText:        undefined,
  };

  return {
    options,
    effectivePlayers: players,
    exportW: size.w,
    exportH: size.h,
    isCarousel,
  };
}

// ─── Serialise draft to DB row ────────────────────────────────────────────────

export function draftToDbRow(draft: ContentEngineDraft, extra?: {
  week_start?: string;
  day?: string;
  sort_order?: number;
  title?: string;
  source?: string;
}) {
  return {
    stat_angle:        draft.statAngleId,
    template:          draft.template,
    background:        draft.selectedBackground,
    background_type:   draft.backgroundSource,
    accent_color:      draft.customAccent,
    caption:           draft.socialCaption,
    hashtags:          draft.appendHashtags ? "#aflfantasy #aflfantasy2026 #fantasyfooty #aflstats" : "",
    export_format:     draft.exportSizeId,
    status:            draft.status,
    draft_state:       JSON.stringify(draft),
    ...(extra ?? {}),
  };
}

// ─── Parse DB row back to draft ───────────────────────────────────────────────

export function dbRowToDraft(row: Record<string, unknown>): ContentEngineDraft {
  const imageUrl = (row.image_url as string | null) ?? null;

  if (row.draft_state && typeof row.draft_state === "string") {
    try {
      const parsed = JSON.parse(row.draft_state) as Partial<ContentEngineDraft>;
      const merged = mergeDraft(DEFAULT_DRAFT, {
        ...parsed,
        plannerPostId: row.id as string,
        mode: "edit",
        status: (row.status as ContentEngineDraft["status"]) ?? parsed.status ?? "draft",
      });
      if (imageUrl && !merged.backgroundMediaUrl) {
        return { ...merged, backgroundSource: "stock_image", backgroundMediaUrl: imageUrl };
      }
      return merged;
    } catch { /* fall through */ }
  }
  if (row.draft_state && typeof row.draft_state === "object") {
    const parsed = row.draft_state as Partial<ContentEngineDraft>;
    const merged = mergeDraft(DEFAULT_DRAFT, {
      ...parsed,
      plannerPostId: row.id as string,
      mode: "edit",
      status: (row.status as ContentEngineDraft["status"]) ?? parsed.status ?? "draft",
    });
    if (imageUrl && !merged.backgroundMediaUrl) {
      return { ...merged, backgroundSource: "stock_image", backgroundMediaUrl: imageUrl };
    }
    return merged;
  }
  return mergeDraft(DEFAULT_DRAFT, {
    plannerPostId:      row.id as string,
    mode:               "edit",
    statAngleId:        (row.stat_angle as string)     || DEFAULT_DRAFT.statAngleId,
    template:           (row.template as LayoutEngine) || DEFAULT_DRAFT.template,
    selectedBackground: (row.background as BackgroundTheme) || DEFAULT_DRAFT.selectedBackground,
    backgroundSource:   imageUrl
      ? "stock_image"
      : ((row.background_type as BackgroundSource) || DEFAULT_DRAFT.backgroundSource),
    backgroundMediaUrl: imageUrl ?? null,
    customAccent:       (row.accent_color as string)   || DEFAULT_DRAFT.customAccent,
    accentMode:         "custom",
    exportSizeId:       (row.export_format as string)  || DEFAULT_DRAFT.exportSizeId,
    socialCaption:      (row.caption as string)        || DEFAULT_DRAFT.socialCaption,
    status:             (row.status as ContentEngineDraft["status"]) || "draft",
  });
}
