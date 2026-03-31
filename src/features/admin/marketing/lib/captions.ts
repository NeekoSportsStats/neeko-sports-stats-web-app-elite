const EMPHASIS_KEYWORDS = /\b(buy|sell|trap|breakout|hold|trade|risk|value)\b/gi;

function emphasiseKeywords(text: string): string {
  return text.replace(EMPHASIS_KEYWORDS, (match) => match.toUpperCase());
}

function formatCaptionText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function generateCaptions(script: string, mode: "short" | "full" = "short"): string[] {
  if (!script.trim()) return [];

  const lines = script
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (const line of lines) {
    if (mode === "short" && line.length > 80) {
      const parts = line.split(/,\s*| and | but /);
      for (const part of parts) {
        const clean = formatCaptionText(part);
        if (clean.length > 2) chunks.push(emphasiseKeywords(clean));
      }
    } else if (mode === "full" && line.length > 160) {
      const parts = line.split(/,\s*| and | but /);
      let buffer = "";
      for (const part of parts) {
        const candidate = buffer ? `${buffer}, ${part.trim()}` : part.trim();
        if (candidate.length <= 160) {
          buffer = candidate;
        } else {
          if (buffer) chunks.push(emphasiseKeywords(formatCaptionText(buffer)));
          buffer = part.trim();
        }
      }
      if (buffer) chunks.push(emphasiseKeywords(formatCaptionText(buffer)));
    } else {
      chunks.push(emphasiseKeywords(formatCaptionText(line)));
    }
  }

  return chunks;
}

export function formatCaptionsForExport(captions: string[], numbered = true): string {
  return captions
    .map((c, i) => (numbered ? `[${i + 1}] ${c}` : c))
    .join("\n");
}
