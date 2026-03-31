import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode } from "react";
import { type ContentEngineDraft, DEFAULT_DRAFT, mergeDraft, dbRowToDraft } from "@/features/admin/marketing/contentEngineDraft";

// ─── Legacy shape kept for backward compat (used by video panel etc.) ─────────

export interface ContentEngineState {
  contentMode:        string;
  selectedAngleId:    string;
  selectedLayout:     string;
  selectedBackground: string;
  backgroundSource:   string;
  backgroundMediaUrl: string | null;
  customUploadUrl:    string;
  logoUrl:            string;
  logoPosition:       string;
  roundLabel:         string;
  statHighlight:      string;
  ctaText:            string;
  ctaPosition:        string;
  playerImageUrl:     string;
  accentMode:         string;
  customAccent:       string;
  rankHighlight:      string;
  playerMode:         string;
  exportSizeId:       string;
  appendHashtags:     boolean;
  autoTeamAccent:     boolean;
  showTeamAccent:     boolean;
  scrollY:            number;
}

export interface MediaLibraryState {
  images:          unknown[];
  videos:          unknown[];
  lastFetchedAt:   number | null;
  activePollJobId: string | null;
  runningJob:      unknown | null;
  dismissedJobId:  string | null;
  mode:            string;
  category:        string;
}

interface AdminUIState {
  contentEngine:    ContentEngineState;
  draft:            ContentEngineDraft;
  mediaLibrary:     MediaLibraryState;
  activeJobType:    string | null;
  activeJobPct:     number;
  activeJobLabel:   string | null;
}

interface AdminUIStateContextValue {
  state:              AdminUIState;
  setContentEngine:   (updater: (prev: ContentEngineState) => ContentEngineState) => void;
  setDraft:           (updater: (prev: ContentEngineDraft) => ContentEngineDraft) => void;
  resetDraft:         () => void;
  loadDraftFromRow:   (row: Record<string, unknown>) => void;
  setMediaLibrary:    (updater: (prev: MediaLibraryState) => MediaLibraryState) => void;
  setActiveJob:       (type: string | null, pct: number, label: string | null) => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CONTENT_ENGINE: ContentEngineState = {
  contentMode:        "graphic",
  selectedAngleId:    "top_projections",
  selectedLayout:     "leaderboard",
  selectedBackground: "dark_gradient",
  backgroundSource:   "gradient",
  backgroundMediaUrl: null,
  customUploadUrl:    "",
  logoUrl:            "",
  logoPosition:       "none",
  roundLabel:         "",
  statHighlight:      "",
  ctaText:            "",
  ctaPosition:        "bottom_center",
  playerImageUrl:     "",
  accentMode:         "neeko_gold",
  customAccent:       "#F59E0B",
  rankHighlight:      "top_player",
  playerMode:         "auto",
  exportSizeId:       "instagram",
  appendHashtags:     true,
  autoTeamAccent:     false,
  showTeamAccent:     false,
  scrollY:            0,
};

const DEFAULT_MEDIA_LIBRARY: MediaLibraryState = {
  images:          [],
  videos:          [],
  lastFetchedAt:   null,
  activePollJobId: null,
  runningJob:      null,
  dismissedJobId:  null,
  mode:            "graphic",
  category:        "all",
};

const CE_STORAGE_KEY   = "neeko_content_engine_state";
const DRAFT_STORAGE_KEY = "neeko_content_engine_draft_v2";

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readContentEngineState(): ContentEngineState {
  try {
    const raw = localStorage.getItem(CE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONTENT_ENGINE };
    const s = JSON.parse(raw);
    return {
      contentMode:        s.contentMode        ?? DEFAULT_CONTENT_ENGINE.contentMode,
      selectedAngleId:    s.selectedAngleId    ?? DEFAULT_CONTENT_ENGINE.selectedAngleId,
      selectedLayout:     s.selectedLayout     ?? DEFAULT_CONTENT_ENGINE.selectedLayout,
      selectedBackground: s.selectedBackground ?? DEFAULT_CONTENT_ENGINE.selectedBackground,
      backgroundSource:   s.backgroundSource   ?? DEFAULT_CONTENT_ENGINE.backgroundSource,
      backgroundMediaUrl: s.backgroundMediaUrl ?? DEFAULT_CONTENT_ENGINE.backgroundMediaUrl,
      customUploadUrl:    s.customUploadUrl     ?? DEFAULT_CONTENT_ENGINE.customUploadUrl,
      logoUrl:            s.logoUrl            ?? DEFAULT_CONTENT_ENGINE.logoUrl,
      logoPosition:       s.logoPosition       ?? DEFAULT_CONTENT_ENGINE.logoPosition,
      roundLabel:         s.roundLabel         ?? DEFAULT_CONTENT_ENGINE.roundLabel,
      statHighlight:      s.statHighlight      ?? DEFAULT_CONTENT_ENGINE.statHighlight,
      ctaText:            s.ctaText            ?? DEFAULT_CONTENT_ENGINE.ctaText,
      ctaPosition:        s.ctaPosition        ?? DEFAULT_CONTENT_ENGINE.ctaPosition,
      playerImageUrl:     s.playerImageUrl     ?? DEFAULT_CONTENT_ENGINE.playerImageUrl,
      accentMode:         s.accentMode         ?? DEFAULT_CONTENT_ENGINE.accentMode,
      customAccent:       s.customAccent       ?? DEFAULT_CONTENT_ENGINE.customAccent,
      rankHighlight:      s.rankHighlight      ?? DEFAULT_CONTENT_ENGINE.rankHighlight,
      playerMode:         s.playerMode         ?? DEFAULT_CONTENT_ENGINE.playerMode,
      exportSizeId:       s.exportSizeId       ?? DEFAULT_CONTENT_ENGINE.exportSizeId,
      appendHashtags:     typeof s.appendHashtags === "boolean" ? s.appendHashtags : DEFAULT_CONTENT_ENGINE.appendHashtags,
      autoTeamAccent:     typeof s.autoTeamAccent === "boolean" ? s.autoTeamAccent : DEFAULT_CONTENT_ENGINE.autoTeamAccent,
      showTeamAccent:     typeof s.showTeamAccent === "boolean" ? s.showTeamAccent : DEFAULT_CONTENT_ENGINE.showTeamAccent,
      scrollY:            s.scrollY            ?? 0,
    };
  } catch {
    return { ...DEFAULT_CONTENT_ENGINE };
  }
}

function readDraftState(): ContentEngineDraft {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DRAFT };
    const parsed = JSON.parse(raw) as Partial<ContentEngineDraft>;
    return mergeDraft(DEFAULT_DRAFT, parsed);
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminUIStateContext = createContext<AdminUIStateContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AdminUIStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminUIState>(() => ({
    contentEngine: readContentEngineState(),
    draft:         readDraftState(),
    mediaLibrary:  { ...DEFAULT_MEDIA_LIBRARY },
    activeJobType:  null,
    activeJobPct:   0,
    activeJobLabel: null,
  }));

  const ceDebounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistContentEngine = useCallback((ce: ContentEngineState) => {
    if (ceDebounceRef.current) clearTimeout(ceDebounceRef.current);
    ceDebounceRef.current = setTimeout(() => {
      try { localStorage.setItem(CE_STORAGE_KEY, JSON.stringify(ce)); } catch { /* quota */ }
    }, 300);
  }, []);

  const persistDraft = useCallback((d: ContentEngineDraft) => {
    if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    draftDebounceRef.current = setTimeout(() => {
      try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(d)); } catch { /* quota */ }
    }, 400);
  }, []);

  const setContentEngine = useCallback((updater: (prev: ContentEngineState) => ContentEngineState) => {
    setState((prev) => {
      const next = updater(prev.contentEngine);
      persistContentEngine(next);
      return { ...prev, contentEngine: next };
    });
  }, [persistContentEngine]);

  const setDraft = useCallback((updater: (prev: ContentEngineDraft) => ContentEngineDraft) => {
    setState((prev) => {
      const next = updater(prev.draft);
      persistDraft(next);
      return { ...prev, draft: next };
    });
  }, [persistDraft]);

  const resetDraft = useCallback(() => {
    setState((prev) => {
      const next = { ...DEFAULT_DRAFT };
      persistDraft(next);
      return { ...prev, draft: next };
    });
  }, [persistDraft]);

  const loadDraftFromRow = useCallback((row: Record<string, unknown>) => {
    const loaded = dbRowToDraft(row);
    setState((prev) => {
      persistDraft(loaded);
      return { ...prev, draft: loaded };
    });
  }, [persistDraft]);

  const setMediaLibrary = useCallback((updater: (prev: MediaLibraryState) => MediaLibraryState) => {
    setState((prev) => ({ ...prev, mediaLibrary: updater(prev.mediaLibrary) }));
  }, []);

  const setActiveJob = useCallback((type: string | null, pct: number, label: string | null) => {
    setState((prev) => ({ ...prev, activeJobType: type, activeJobPct: pct, activeJobLabel: label }));
  }, []);

  useEffect(() => {
    return () => {
      if (ceDebounceRef.current)    clearTimeout(ceDebounceRef.current);
      if (draftDebounceRef.current) clearTimeout(draftDebounceRef.current);
    };
  }, []);

  return (
    <AdminUIStateContext.Provider value={{ state, setContentEngine, setDraft, resetDraft, loadDraftFromRow, setMediaLibrary, setActiveJob }}>
      {children}
    </AdminUIStateContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdminUIState() {
  const ctx = useContext(AdminUIStateContext);
  if (!ctx) throw new Error("useAdminUIState must be used within AdminUIStateProvider");
  return ctx;
}

export { DEFAULT_CONTENT_ENGINE };
