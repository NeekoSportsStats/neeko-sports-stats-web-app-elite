import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Copy, Check, RefreshCw, Wand as Wand2 } from "lucide-react";

const PROMPT_TEMPLATES = [
  {
    id: "roundpreview",
    label: "Round Preview",
    prompt: "Write a punchy 3-sentence round preview for AFL Fantasy coaches. Focus on who to captain, who to trade in, and one player to avoid.",
  },
  {
    id: "tradeadvice",
    label: "Trade Advice",
    prompt: "Write a 2-sentence trade advice post for social media. Be direct, data-driven, and give one clear recommendation.",
  },
  {
    id: "captainanalysis",
    label: "Captain Analysis",
    prompt: "Explain in 2–3 sentences why a particular player is the best captain choice this week. Be confident and reference stats.",
  },
  {
    id: "valuepick",
    label: "Value Pick Reel Script",
    prompt: "Write a short video script (15 seconds, ~5 lines) for a value pick reveal. Start with a hook, reveal the player, give 2 stats, end with a CTA.",
  },
  {
    id: "trapwarning",
    label: "Trap Warning",
    prompt: "Write a warning post about a popular AFL Fantasy player who is a trap this week. Be specific about why.",
  },
];

const TONE_OPTIONS = ["Analytical", "Hype", "Contrarian", "Educational", "Punchy"];

export default function AIStudio() {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("Punchy");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a prompt first", variant: "destructive" });
      return;
    }
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 800));
    setOutput(
      `[${tone} tone — AI generation coming soon]\n\nPrompt received:\n"${prompt}"\n\nThis will connect to the generate-marketing-caption edge function to produce live AI output using your AFL Fantasy data and rankings.`
    );
    setGenerating(false);
  };

  const copyOutput = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          Freeform AI content generation. Pick a template or write your own prompt.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick Templates</p>
        <div className="flex flex-wrap gap-2">
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setPrompt(t.prompt)}
              className="px-3 py-1.5 text-xs border border-border rounded-md bg-background hover:bg-accent hover:text-foreground transition-colors text-muted-foreground"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tone</p>
        <div className="flex gap-2 flex-wrap">
          {TONE_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-3 py-1.5 text-xs border rounded-md transition-colors ${
                tone === t
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Write a script for a breakout player reveal reel..."
          rows={4}
          className="w-full text-sm border border-border rounded-md p-3 bg-background resize-y leading-relaxed"
        />
      </div>

      <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="w-full">
        {generating ? (
          <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
        ) : (
          <><Wand2 className="h-4 w-4 mr-2" /> Generate</>
        )}
      </Button>

      {output && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Output</p>
            </div>
            <button
              onClick={copyOutput}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-md transition-colors"
            >
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
          </div>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={8}
            className="w-full text-sm border border-border rounded-md p-3 bg-background resize-y font-mono leading-relaxed"
          />
        </div>
      )}
    </div>
  );
}
