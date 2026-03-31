import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Copy, Check, BookmarkPlus, ChevronDown, Mic, RefreshCw, Zap, Scissors, AlignLeft, Wand as Wand2, ExternalLink, FileText, TriangleAlert as AlertTriangle, CircleStop as StopCircle, Radio, Sparkles, Download } from "lucide-react";
import { loadLibrary, addToLibrary } from "./lib/library";
import { generateCaptions, formatCaptionsForExport } from "./lib/captions";
import type { LibraryItem } from "./lib/library";

// ─── Text transform helpers ─────────────────────────────────────────────────

const FILLER = [
  /\bvery\s+/gi, /\bquite\s+/gi, /\breally\s+/gi, /\bbasically\s+/gi,
  /\bactually\s+/gi, /\bin\s+order\s+to\b/gi, /\bthe\s+fact\s+that\b/gi,
  /\bit\s+is\s+worth\s+noting\s+that\b/gi, /\bplease\s+note\s+that\b/gi,
  /\bit\s+should\s+be\s+noted\s+that\b/gi, /\boverall[,]?\s+/gi,
];

function stripFiller(text: string): string {
  let out = text;
  for (const r of FILLER) out = out.replace(r, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinSentences(sentences: string[]): string {
  return sentences.join("\n");
}

export function makePunchier(text: string): string {
  const sentences = splitSentences(stripFiller(text));
  const punched = sentences.flatMap((s) => {
    if (s.length < 60) return [s];
    const commaIdx = s.indexOf(", ");
    if (commaIdx > 30 && commaIdx < s.length - 20) {
      const left  = s.slice(0, commaIdx).trim();
      const right = s.slice(commaIdx + 2).trim();
      const rightCap = right.charAt(0).toUpperCase() + right.slice(1);
      return [left + ".", rightCap];
    }
    const andIdx = s.search(/\band\b/);
    if (andIdx > 30 && andIdx < s.length - 20) {
      const left  = s.slice(0, andIdx).trim().replace(/,\s*$/, "") + ".";
      const right = s.slice(andIdx + 3).trim();
      const rightCap = right.charAt(0).toUpperCase() + right.slice(1);
      return [left, rightCap];
    }
    return [s];
  });
  return joinSentences(punched);
}

export function shortenScript(text: string): string {
  const sentences = splitSentences(stripFiller(text));
  if (sentences.length <= 3) return text;
  const keep = Math.max(3, Math.ceil(sentences.length * 0.72));
  const hook = sentences.slice(0, 2);
  const middle = sentences.slice(2, sentences.length - 1);
  const cta = sentences[sentences.length - 1];
  const midKeep = middle.slice(0, Math.max(0, keep - 3));
  return joinSentences([...hook, ...midKeep, cta]);
}

export function addPauses(text: string): string {
  return text
    .replace(/([.!?])\s+/g, "$1\n\n")
    .replace(/([:—–])\s+/g, "$1\n")
    .replace(/,\s+(but|however|yet|so|and|because)\s+/gi, ".\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function makeNatural(text: string): string {
  let out = stripFiller(text);
  out = out.replace(/\bfantasy\s+points?\b/gi, "fantasy pts");
  out = out.replace(/\bprojection_final\b/gi, "projection");
  out = out.replace(/\bvalue_score\b/gi, "value score");
  out = out.replace(/\bneeko_rating\b/gi, "Neeko rating");
  out = out.replace(/_/g, " ");
  out = out.replace(/(\d+)\s*pts?/gi, "$1 points");
  out = out.replace(/\$([\d,]+)k/gi, "around $$$1k");
  out = out.replace(/\.\s+He\b/g, ".\nHe");
  out = out.replace(/\.\s+She\b/g, ".\nShe");
  out = out.replace(/\.\s+That\b/g, ".\nThat means");
  out = out.replace(/\.\s+This\b/g, ".\nThis week");
  out = out.replace(/\bI would\b/gi, "I'd");
  out = out.replace(/\bIt is\b/g, "It's");
  out = out.replace(/\bThat is\b/g, "That's");
  out = out.replace(/\bDo not\b/gi, "Don't");
  out = out.replace(/\s{2,}/g, " ");
  return out.trim();
}

// ─── Copy button ────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded border border-border bg-background hover:bg-accent transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
      {copied ? "Copied" : (label ?? "Copy")}
    </button>
  );
}

// ─── Slider control ─────────────────────────────────────────────────────────

function SliderControl({
  label, value, min, max, step, onChange, format,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
        <span className="text-[10px] font-mono text-muted-foreground">{format ? format(value) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-foreground cursor-pointer"
      />
    </div>
  );
}

// ─── Variation card ─────────────────────────────────────────────────────────

function VariationCard({
  label, text, active, onSelect, onCopy,
}: {
  label: string; text: string; active: boolean; onSelect: () => void; onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div
      className={`rounded-lg border cursor-pointer transition-colors ${
        active ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-inherit">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full border ${active ? "bg-foreground border-foreground" : "border-muted-foreground"}`}
          />
          <span className="text-[11px] font-semibold">{label}</span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={copy}
            className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded border border-border hover:bg-accent transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onSelect}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              active ? "border-foreground bg-foreground text-background" : "border-border hover:bg-accent"
            }`}
          >
            {active ? "Active" : "Use this"}
          </button>
        </div>
      </div>
      <div className="px-3 py-2.5" onClick={onSelect}>
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">{text}</p>
      </div>
    </div>
  );
}

// ─── Types ──────────────────────────────────────────────────────────────────

type ActiveVariation = "main" | "a" | "b" | "c";

declare global {
  interface Window {
    selectedVoiceScript?: {
      title: string;
      content: string;
      hook?: string;
      variation?: string;
    } | null;
  }
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function VoiceStudio() {
  const [libraryItems, setLibraryItems]         = useState<LibraryItem[]>([]);
  const [selectedLibId, setSelectedLibId]       = useState<string>("");
  const [title, setTitle]                       = useState("Untitled Voice Script");
  const [originalScript, setOriginalScript]     = useState("");
  const [activeScript, setActiveScript]         = useState("");
  const [variationA, setVariationA]             = useState("");
  const [variationB, setVariationB]             = useState("");
  const [variationC, setVariationC]             = useState("");
  const [activeVariation, setActiveVariation]   = useState<ActiveVariation>("main");
  const [voices, setVoices]                     = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIdx, setSelectedVoiceIdx] = useState<number>(0);
  const [rate, setRate]                         = useState(0.95);
  const [pitch, setPitch]                       = useState(1.0);
  const [volume, setVolume]                     = useState(1.0);
  const [playing, setPlaying]                   = useState(false);
  const [savedId, setSavedId]                   = useState<string | null>(null);
  const [variationsGenerated, setVariationsGenerated] = useState(false);
  const [sentToVideo, setSentToVideo]               = useState(false);
  const [captionMode, setCaptionMode]               = useState<"short" | "full">("short");
  const [captionsCopied, setCaptionsCopied]         = useState(false);

  // Recording
  const [isRecording, setIsRecording]               = useState(false);
  const [audioBlob, setAudioBlob]                   = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl]                     = useState<string | null>(null);
  const [micError, setMicError]                     = useState<string | null>(null);
  const [recordingSaved, setRecordingSaved]         = useState(false);
  const mediaRecorderRef                            = useRef<MediaRecorder | null>(null);
  const recordingChunksRef                          = useRef<Blob[]>([]);

  // AI Voice
  const [aiVoiceUrl, setAiVoiceUrl]                 = useState<string | null>(null);
  const [aiLoading, setAiLoading]                   = useState(false);
  const [aiVoiceSaved, setAiVoiceSaved]             = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const voicesAvailable = voices.length > 0;

  useEffect(() => {
    const items = loadLibrary().filter((i) =>
      i.type === "script" || i.type === "draft" || i.type === "video"
    );
    setLibraryItems(items);
  }, []);

  useEffect(() => {
    function load() {
      const v = window.speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    }
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const scriptForPlayback = useCallback((): string => {
    if (activeVariation === "a") return variationA;
    if (activeVariation === "b") return variationB;
    if (activeVariation === "c") return variationC;
    return activeScript;
  }, [activeVariation, activeScript, variationA, variationB, variationC]);

  function handleLibrarySelect(id: string) {
    setSelectedLibId(id);
    const item = libraryItems.find((i) => i.id === id);
    if (!item) return;
    setTitle(item.title.replace(/ - voice$/, ""));
    setOriginalScript(item.content);
    setActiveScript(item.content);
    setActiveVariation("main");
    setVariationA("");
    setVariationB("");
    setVariationC("");
    setVariationsGenerated(false);
    setSavedId(null);
  }

  function handleOriginalChange(text: string) {
    setOriginalScript(text);
    if (activeVariation === "main") setActiveScript(text);
  }

  function handleApply(fn: (t: string) => string) {
    setActiveScript((prev) => fn(prev));
    setActiveVariation("main");
  }

  function generateVariations() {
    const base = activeScript || originalScript;
    if (!base.trim()) return;
    setVariationA(makePunchier(base));
    setVariationB(shortenScript(base));
    setVariationC(makeNatural(base));
    setVariationsGenerated(true);
  }

  function handlePlay() {
    if (!voicesAvailable) return;
    window.speechSynthesis.cancel();
    const text = scriptForPlayback();
    if (!text.trim()) return;
    const u = new SpeechSynthesisUtterance(text.replace(/\n+/g, " "));
    u.voice  = voices[selectedVoiceIdx] ?? voices[0];
    u.rate   = rate;
    u.pitch  = pitch;
    u.volume = volume;
    u.onend  = () => setPlaying(false);
    u.onerror = () => setPlaying(false);
    utteranceRef.current = u;
    setPlaying(true);
    window.speechSynthesis.speak(u);
  }

  function handleStop() {
    window.speechSynthesis.cancel();
    setPlaying(false);
  }

  function handleSave() {
    const content = activeScript || originalScript;
    if (!content.trim()) return;
    const item = addToLibrary({
      type:    "script",
      title:   `${title} - voice`,
      content,
      player:  null,
      tags:    ["voice", "script"],
      status:  "idea",
      platform: null,
    });
    setSavedId(item.id);
    if (typeof window !== "undefined") {
      window.selectedVoiceScript = { title, content };
    }
  }

  function handleSendToVideoGenerator() {
    const content = activeScript || originalScript;
    if (!content.trim()) return;
    const hook = content.split("\n").filter(Boolean)[0] ?? "";
    if (typeof window !== "undefined") {
      window.selectedVoiceScript = {
        title: title || "Voice Script",
        content,
        hook,
        variation: activeVariation,
      };
    }
    setSentToVideo(true);
    setTimeout(() => setSentToVideo(false), 3000);
  }

  function handleSendToEditor() {
    handleSendToVideoGenerator();
  }

  async function startRecording() {
    setMicError(null);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingSaved(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
        const url  = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
      };
      mr.start();
      setIsRecording(true);
    } catch {
      setMicError("Microphone access required for recording. Please allow mic permissions and try again.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  function saveRecording() {
    if (!audioUrl) return;
    addToLibrary({
      type:     "audio" as LibraryItem["type"],
      title:    `${title || "Voice Recording"} - recording`,
      content:  audioUrl,
      player:   null,
      tags:     ["voice", "recording"],
      status:   "idea",
      platform: null,
    });
    setRecordingSaved(true);
    setTimeout(() => setRecordingSaved(false), 3000);
  }

  async function generateAIVoice() {
    if (!activeScript.trim() && !originalScript.trim()) return;
    setAiLoading(true);
    setAiVoiceSaved(false);
    try {
      const res = await fetch("/api/generate-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: activeScript || originalScript }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setAiVoiceUrl(data.audioUrl ?? null);
    } catch {
      setAiVoiceUrl(null);
    }
    setAiLoading(false);
  }

  function saveAIVoice() {
    if (!aiVoiceUrl) return;
    addToLibrary({
      type:     "audio" as LibraryItem["type"],
      title:    `${title || "AI Voice"} - ai`,
      content:  aiVoiceUrl,
      player:   null,
      tags:     ["voice", "ai"],
      status:   "idea",
      platform: null,
    });
    setAiVoiceSaved(true);
    setTimeout(() => setAiVoiceSaved(false), 3000);
  }

  const fullCopyText = [
    "ORIGINAL:",
    originalScript,
    "",
    "ACTIVE SCRIPT:",
    activeScript,
    variationA ? `\nVARIATION A (Punchier):\n${variationA}` : "",
    variationB ? `\nVARIATION B (Shorter):\n${variationB}` : "",
    variationC ? `\nVARIATION C (Natural):\n${variationC}` : "",
  ].join("\n").trim();

  const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
  const voiceList = englishVoices.length ? englishVoices : voices;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold">Voice Studio</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Prepare, edit, and preview voiceover scripts. Import from Library or paste directly.
        </p>
      </div>

      {/* Script Source */}
      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Script Source</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Library import */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Load from Library
            </label>
            <div className="relative">
              <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={selectedLibId}
                onChange={(e) => handleLibrarySelect(e.target.value)}
                className="w-full appearance-none text-xs pl-7 pr-7 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select from library...</option>
                {libraryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{item.type}] {item.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            {libraryItems.length === 0 && (
              <p className="text-[10px] text-muted-foreground">No scripts in library yet. Paste below.</p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Script Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled Voice Script"
              className="w-full text-xs px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      {/* Main editing area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Source Script
            </label>
            <button
              onClick={() => setActiveScript(originalScript)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Reset to source
            </button>
          </div>
          <textarea
            value={originalScript}
            onChange={(e) => handleOriginalChange(e.target.value)}
            placeholder="Paste your script here, or load from Library above..."
            rows={12}
            className="w-full text-xs px-3 py-2.5 border border-border rounded-md bg-muted/20 focus:outline-none focus:ring-1 focus:ring-ring resize-y leading-relaxed font-mono"
          />
        </div>

        {/* Active voice script */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              Active Voice Script
            </label>
            <CopyButton text={activeScript} label="Copy" />
          </div>
          <textarea
            value={activeScript}
            onChange={(e) => { setActiveScript(e.target.value); setActiveVariation("main"); }}
            placeholder="Your voice-ready script will appear here..."
            rows={12}
            className="w-full text-xs px-3 py-2.5 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-y leading-relaxed"
          />
        </div>
      </div>

      {/* Voice Optimiser */}
      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Voice Optimiser</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleApply(makePunchier)}
            disabled={!activeScript.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Zap className="h-3.5 w-3.5" /> Make Punchier
          </button>
          <button
            onClick={() => handleApply(shortenScript)}
            disabled={!activeScript.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Scissors className="h-3.5 w-3.5" /> Shorten
          </button>
          <button
            onClick={() => handleApply(addPauses)}
            disabled={!activeScript.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <AlignLeft className="h-3.5 w-3.5" /> Add Pauses
          </button>
          <button
            onClick={() => handleApply(makeNatural)}
            disabled={!activeScript.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 className="h-3.5 w-3.5" /> Make Natural
          </button>
          <div className="flex-1 min-w-[1px]" />
          <button
            onClick={generateVariations}
            disabled={!activeScript.trim() && !originalScript.trim()}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Generate Variations
          </button>
        </div>
      </div>

      {/* Variations */}
      {variationsGenerated && (
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Variations</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <VariationCard
              label="Variation A — Punchier"
              text={variationA}
              active={activeVariation === "a"}
              onSelect={() => { setActiveVariation("a"); setActiveScript(variationA); }}
              onCopy={() => navigator.clipboard.writeText(variationA)}
            />
            <VariationCard
              label="Variation B — Shorter"
              text={variationB}
              active={activeVariation === "b"}
              onSelect={() => { setActiveVariation("b"); setActiveScript(variationB); }}
              onCopy={() => navigator.clipboard.writeText(variationB)}
            />
            <VariationCard
              label="Variation C — Natural"
              text={variationC}
              active={activeVariation === "c"}
              onSelect={() => { setActiveVariation("c"); setActiveScript(variationC); }}
              onCopy={() => navigator.clipboard.writeText(variationC)}
            />
          </div>
        </div>
      )}

      {/* Voice Controls + Playback */}
      <div className="border rounded-lg p-4 space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Voice Preview</p>

        {!voicesAvailable ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            Voice preview is not available in this browser.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Voice selector */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Voice</label>
              <div className="relative">
                <Mic className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={selectedVoiceIdx}
                  onChange={(e) => setSelectedVoiceIdx(parseInt(e.target.value))}
                  className="w-full appearance-none text-xs pl-7 pr-7 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {voiceList.map((v, i) => (
                    <option key={i} value={i}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SliderControl
                label="Speed" value={rate} min={0.5} max={2} step={0.05}
                onChange={setRate} format={(v) => `${v.toFixed(2)}x`}
              />
              <SliderControl
                label="Pitch" value={pitch} min={0.5} max={2} step={0.05}
                onChange={setPitch} format={(v) => v.toFixed(2)}
              />
              <SliderControl
                label="Volume" value={volume} min={0} max={1} step={0.05}
                onChange={setVolume} format={(v) => `${Math.round(v * 100)}%`}
              />
            </div>

            {/* Active script indicator */}
            {activeVariation !== "main" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/40 border border-border">
                <div className="w-1.5 h-1.5 rounded-full bg-foreground" />
                <p className="text-[11px] text-muted-foreground">
                  Playing: Variation {activeVariation.toUpperCase()}
                </p>
              </div>
            )}

            {/* Play / Stop */}
            <div className="flex gap-2">
              <button
                onClick={handlePlay}
                disabled={playing || (!activeScript.trim() && !variationA)}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <Play className="h-4 w-4" /> Play
              </button>
              <button
                onClick={handleStop}
                disabled={!playing}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Captions Preview */}
      {(activeScript || originalScript) && (() => {
        const script   = activeScript || originalScript;
        const captions = generateCaptions(script, captionMode);
        const copyText = formatCaptionsForExport(captions, true);
        return (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Captions Preview
              </p>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setCaptionMode("short")}
                    className={`text-[10px] font-medium px-2.5 py-1 transition-colors ${
                      captionMode === "short"
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Short
                  </button>
                  <button
                    onClick={() => setCaptionMode("full")}
                    className={`text-[10px] font-medium px-2.5 py-1 transition-colors border-l border-border ${
                      captionMode === "full"
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Full
                  </button>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(copyText).catch(() => {});
                    setCaptionsCopied(true);
                    setTimeout(() => setCaptionsCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {captionsCopied
                    ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</>
                    : <><Copy className="h-3 w-3" /> Copy Captions</>
                  }
                </button>
              </div>
            </div>
            {captions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No captions yet — add a script above.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {captions.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 rounded-md bg-zinc-900 text-white text-xs leading-relaxed"
                  >
                    <span className="text-white/30 shrink-0 tabular-nums">{i + 1}</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">{captions.length} caption{captions.length !== 1 ? "s" : ""} · keywords emphasised</p>
          </div>
        );
      })()}

      {/* Voice Recorder */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Voice Recorder</p>
          {isRecording && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-medium text-red-500">Recording</span>
            </div>
          )}
        </div>

        {micError ? (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{micError}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={startRecording}
            disabled={isRecording}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Radio className="h-3.5 w-3.5" /> Start Recording
          </button>
          <button
            onClick={stopRecording}
            disabled={!isRecording}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <StopCircle className="h-3.5 w-3.5" /> Stop
          </button>
          {audioUrl && !isRecording && (
            <button
              onClick={saveRecording}
              disabled={recordingSaved}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {recordingSaved
                ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved to Library</>
                : <><Download className="h-3.5 w-3.5" /> Save Recording</>
              }
            </button>
          )}
        </div>

        {audioUrl && !isRecording && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Playback</p>
            <audio
              controls
              src={audioUrl}
              className="w-full h-9 rounded-md"
            />
          </div>
        )}

        {!audioUrl && !isRecording && !micError && (
          <p className="text-xs text-muted-foreground">
            Record your voice reading the active script. Click Start Recording, read your script, then Stop.
          </p>
        )}
      </div>

      {/* AI Voice Generator */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">AI Voice Generator</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">API-ready — connect your preferred TTS provider</p>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
              <span className="text-[10px] text-muted-foreground">Generating...</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={generateAIVoice}
            disabled={aiLoading || (!activeScript.trim() && !originalScript.trim())}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {aiLoading ? "Generating voice..." : "Generate AI Voice"}
          </button>
          {aiVoiceUrl && (
            <button
              onClick={saveAIVoice}
              disabled={aiVoiceSaved}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {aiVoiceSaved
                ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Saved to Library</>
                : <><Download className="h-3.5 w-3.5" /> Save AI Voice</>
              }
            </button>
          )}
        </div>

        {aiVoiceUrl ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">AI Voice Playback</p>
            <audio
              controls
              src={aiVoiceUrl}
              className="w-full h-9 rounded-md"
            />
          </div>
        ) : (
          !aiLoading && (
            <div className="px-3 py-2.5 rounded-md bg-muted/30 border border-dashed border-border">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Connect a TTS API (ElevenLabs, OpenAI TTS, etc.) via <code className="font-mono bg-muted px-1 rounded">/api/generate-voice</code> to enable AI voice generation. The active script will be sent automatically.
              </p>
            </div>
          )
        )}
      </div>

      {/* Save & Export */}
      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Save & Export</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={!!savedId || (!activeScript.trim() && !originalScript.trim())}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {savedId
              ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Saved to Library</>
              : <><BookmarkPlus className="h-3.5 w-3.5" /> Save Voice Script</>
            }
          </button>

          <CopyButton text={activeScript || originalScript} label="Copy Active Script" />
          <CopyButton text={fullCopyText} label="Copy Full Pack" />

          <button
            onClick={handleSendToVideoGenerator}
            disabled={!activeScript.trim() && !originalScript.trim()}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {sentToVideo
              ? <><Check className="h-3.5 w-3.5 text-emerald-500" /> Ready in Video Generator</>
              : <><ExternalLink className="h-3.5 w-3.5" /> Send to Video Generator</>
            }
          </button>
        </div>

        {savedId && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            Script saved to Library. Find it under Scripts tab.
          </p>
        )}
      </div>

      {/* Idle empty state */}
      {!originalScript && !activeScript && (
        <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
          <Mic className="h-8 w-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Load a script from your Library or paste one above to get started.</p>
        </div>
      )}
    </div>
  );
}
