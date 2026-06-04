import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CopyField {
  label: string;
  value: string;
  mono?: boolean;
}

interface CopyPastePanelProps {
  fields: CopyField[];
}

export function CopyPastePanel({ fields }: CopyPastePanelProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    });
  }

  return (
    <div className="space-y-3">
      {fields.map((field, idx) => (
        <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 border-b border-zinc-800">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
              {field.label}
            </span>
            <button
              onClick={() => handleCopy(field.value, idx)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {copiedIdx === idx ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="px-3 py-3">
            <pre
              className={`
                text-xs text-zinc-300 whitespace-pre-wrap break-words
                ${field.mono ? "font-mono" : "font-sans"}
              `}
            >
              {field.value || <span className="text-zinc-600 italic">Empty</span>}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}
