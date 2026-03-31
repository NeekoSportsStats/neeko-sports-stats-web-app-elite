import type { ParsedPriceRow } from "./types";

export interface ParseError {
  line: number;
  raw: string;
  reason: string;
}

export interface ParseResult {
  rows: ParsedPriceRow[];
  errors: ParseError[];
}

function cleanPrice(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const n = parseInt(cleaned, 10);
  if (isNaN(n) || n < 50_000 || n > 3_000_000) return null;
  return n;
}

// ── Short price parser: $727k or $1.132M ─────────────────────────────────────
function parseShortPrice(raw: string): number | null {
  const s = raw.trim();
  // $1.132M  or  $1M
  const mMatch = s.match(/^\$(\d+(?:\.\d+)?)M$/i);
  if (mMatch) {
    const val = Math.round(parseFloat(mMatch[1]) * 1_000_000);
    if (val >= 50_000 && val <= 3_000_000) return val;
    return null;
  }
  // $727k  or  $727.5k
  const kMatch = s.match(/^\$(\d+(?:\.\d+)?)k$/i);
  if (kMatch) {
    const val = Math.round(parseFloat(kMatch[1]) * 1_000);
    if (val >= 50_000 && val <= 3_000_000) return val;
    return null;
  }
  // Fallback: full dollar amount $727,000
  return cleanPrice(s);
}

// ── AFL team name lookup ─────────────────────────────────────────────────────

const AFL_TEAMS: Record<string, string> = {
  "ADELAIDE": "Adelaide",        "CROWS": "Adelaide",
  "BRISBANE": "Brisbane",        "LIONS": "Brisbane",
  "CARLTON": "Carlton",          "BLUES": "Carlton",
  "COLLINGWOOD": "Collingwood",  "PIES": "Collingwood", "MAGPIES": "Collingwood",
  "ESSENDON": "Essendon",        "BOMBERS": "Essendon",
  "FREMANTLE": "Fremantle",      "DOCKERS": "Fremantle",
  "GEELONG": "Geelong",          "CATS": "Geelong",
  "GOLD COAST": "Gold Coast",    "SUNS": "Gold Coast",
  "GWS": "GWS",                  "GIANTS": "GWS",
  "HAWTHORN": "Hawthorn",        "HAWKS": "Hawthorn",
  "MELBOURNE": "Melbourne",      "DEMONS": "Melbourne",
  "NORTH MELBOURNE": "North Melbourne", "KANGAROOS": "North Melbourne", "ROOS": "North Melbourne",
  "PORT ADELAIDE": "Port Adelaide", "POWER": "Port Adelaide",
  "RICHMOND": "Richmond",        "TIGERS": "Richmond",
  "ST KILDA": "St Kilda",        "SAINTS": "St Kilda",
  "SYDNEY": "Sydney",            "SWANS": "Sydney",
  "WEST COAST": "West Coast",    "EAGLES": "West Coast",
  "WESTERN BULLDOGS": "Western Bulldogs", "BULLDOGS": "Western Bulldogs", "DOGGIES": "Western Bulldogs",
};

const AFL_POSITIONS = ["DEF", "MID", "FWD", "RUC"];

function extractTeam(tokens: string[]): { team: string | null; remaining: string[] } {
  const upper = tokens.map(t => t.toUpperCase());

  for (let i = 0; i < upper.length - 1; i++) {
    const two = `${upper[i]} ${upper[i + 1]}`;
    if (AFL_TEAMS[two]) {
      return {
        team: AFL_TEAMS[two],
        remaining: [...tokens.slice(0, i), ...tokens.slice(i + 2)],
      };
    }
  }
  for (let i = 0; i < upper.length; i++) {
    if (AFL_TEAMS[upper[i]]) {
      return {
        team: AFL_TEAMS[upper[i]],
        remaining: [...tokens.slice(0, i), ...tokens.slice(i + 1)],
      };
    }
  }
  return { team: null, remaining: tokens };
}

function extractPosition(tokens: string[]): { position: string | null; remaining: string[] } {
  const upper = tokens.map(t => t.toUpperCase());

  for (let i = 0; i < upper.length; i++) {
    if (/^(DEF|MID|FWD|RUC)(\/?(DEF|MID|FWD|RUC))*$/.test(upper[i])) {
      const position = upper[i].split("/").map(p => p.trim()).find(p => AFL_POSITIONS.includes(p)) ?? upper[i];
      return {
        position,
        remaining: [...tokens.slice(0, i), ...tokens.slice(i + 1)],
      };
    }
  }
  return { position: null, remaining: tokens };
}

// ── Detect which format the pasted text uses ─────────────────────────────────
//
// AFL Fantasy website stacked-block format:
//   playingD. Stephens          ← name line (may have "playing" / "bye" prefix)
//   MID                         ← position line  ← block separator
//   $727k                       ← current price
//   +$57k                       ← price change   (starts with + or -)
//   R1: ADE vs BRI              ← fixture line   (skip)
//   $727k                       ← duplicate price (skip)
//
// AFL Fantasy tabular format (old):
//   Nick Daicos  MID  Collingwood  $1,182,000

const SHORT_PRICE_RE = /^\$\d+(?:\.\d+)?[kKmM]$/;
const FULL_PRICE_RE = /\$[1-9]\d{0,2}(?:,\d{3}){1,2}/;
const POSITION_LINE_RE = /^(DEF|MID|FWD|RUC)(\/?(DEF|MID|FWD|RUC))*$/i;
const CHANGE_LINE_RE = /^[+-]\$\d+(?:\.\d+)?[kKmM]$/;
const FIXTURE_LINE_RE = /R\d+\s*:/i;

function isStackedBlockFormat(lines: string[]): boolean {
  let shortPriceCount = 0;
  let positionLineCount = 0;
  for (const l of lines) {
    if (SHORT_PRICE_RE.test(l)) shortPriceCount++;
    if (POSITION_LINE_RE.test(l)) positionLineCount++;
  }
  return shortPriceCount >= 3 || positionLineCount >= 3;
}

// ── Stacked-block parser ──────────────────────────────────────────────────────
//
// Strategy:
//   1. Split all lines.
//   2. Walk through lines; when we hit a POSITION line, the PREVIOUS non-junk
//      line is the player name. Collect the next ~6 lines to find the price.
//   3. Extract name (clean "playing"/"bye" prefix), position, first price.

function parseStackedBlocks(lines: string[]): ParseResult {
  const rows: ParsedPriceRow[] = [];
  const errors: ParseError[] = [];

  // Indices of position lines — each marks the start of a player block
  const blockStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (POSITION_LINE_RE.test(lines[i])) {
      blockStarts.push(i);
    }
  }

  for (let bi = 0; bi < blockStarts.length; bi++) {
    const posIdx = blockStarts[bi];
    const nextPosIdx = blockStarts[bi + 1] ?? lines.length;

    // ── Name: scan backwards from posIdx for first non-junk line ──
    let rawName: string | null = null;
    for (let ni = posIdx - 1; ni >= 0; ni--) {
      const l = lines[ni];
      // Skip change/price/fixture/position/blank lines
      if (!l) continue;
      if (POSITION_LINE_RE.test(l)) break;
      if (SHORT_PRICE_RE.test(l)) break;
      if (FULL_PRICE_RE.test(l)) break;
      if (CHANGE_LINE_RE.test(l)) break;
      if (FIXTURE_LINE_RE.test(l)) break;
      rawName = l;
      break;
    }

    if (!rawName) {
      errors.push({ line: posIdx + 1, raw: lines[posIdx], reason: "Could not find player name before position line" });
      continue;
    }

    // Clean name: strip leading "playing" / "bye" / "inj" prefixes (case-insensitive)
    const cleanedName = rawName
      .replace(/^(playing|bye|inj|injured|out|dtd)\s*/i, "")
      .trim();

    if (!cleanedName || cleanedName.length < 2 || !/[A-Za-z]/.test(cleanedName)) {
      errors.push({ line: posIdx + 1, raw: rawName, reason: `Name looks invalid: "${rawName}"` });
      continue;
    }

    // ── Position ──
    const position = lines[posIdx].toUpperCase().split("/")[0].trim();

    // ── Price: first valid price line after the position, within this block ──
    let price: number | null = null;
    for (let pi = posIdx + 1; pi < nextPosIdx; pi++) {
      const l = lines[pi];
      if (CHANGE_LINE_RE.test(l)) continue;   // skip +$57k change lines
      if (FIXTURE_LINE_RE.test(l)) continue;  // skip fixture lines

      // Try short price ($727k / $1.132M)
      if (SHORT_PRICE_RE.test(l)) {
        price = parseShortPrice(l);
        if (price !== null) break;
      }
      // Try full price ($727,000)
      const fullMatch = l.match(FULL_PRICE_RE);
      if (fullMatch) {
        price = cleanPrice(fullMatch[0]);
        if (price !== null) break;
      }
    }

    if (price === null) {
      errors.push({ line: posIdx + 1, raw: cleanedName, reason: "Could not find a valid price in player block" });
      continue;
    }

    rows.push({
      source_name: cleanedName,
      cleaned_price: price,
      position,
      team: null,
    });
  }

  return { rows, errors };
}

// ── Raw AFL Fantasy paste parser (tabular, price-anchored) ───────────────────
//
// The AFL Fantasy site table looks like (when pasted raw):
//   Nick Daicos  MID  Collingwood  $1,182,000
//   Zach Merrett  MID  Essendon  $956,000
//
// Anchors on $NNN,NNN price pattern.

export function parseRawFantasyText(text: string): ParseResult {
  const rows: ParsedPriceRow[] = [];
  const errors: ParseError[] = [];

  if (!text.trim()) return { rows, errors };

  // Normalise: collapse horizontal whitespace, normalise newlines
  const normalised = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .trim();

  const lines = normalised.split("\n").map(l => l.trim()).filter(Boolean);

  // Detect stacked-block vs tabular format
  if (isStackedBlockFormat(lines)) {
    return parseStackedBlocks(lines);
  }

  // ── Tabular format: anchor on $NNN,NNN ──────────────────────────────────────
  const PRICE_RE = /\$[1-9]\d{0,2}(?:,\d{3}){1,2}/g;

  const priceMatches: Array<{ match: string; index: number }> = [];
  let m: RegExpExecArray | null;
  PRICE_RE.lastIndex = 0;
  while ((m = PRICE_RE.exec(normalised)) !== null) {
    priceMatches.push({ match: m[0], index: m.index });
  }

  if (priceMatches.length === 0) {
    return parseCSVText(text);
  }

  const segments: string[] = [];
  let cursor = 0;
  for (const pm of priceMatches) {
    const segEnd = pm.index + pm.match.length;
    const seg = normalised.slice(cursor, segEnd).trim();
    if (seg) segments.push(seg);
    cursor = segEnd;
  }

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];

    const segPriceMatch = seg.match(/\$[1-9]\d{0,2}(?:,\d{3}){1,2}$/);
    if (!segPriceMatch) {
      errors.push({ line: si + 1, raw: seg.slice(0, 60), reason: "No price found in segment" });
      continue;
    }

    const price = cleanPrice(segPriceMatch[0]);
    if (price === null) {
      errors.push({ line: si + 1, raw: seg.slice(0, 60), reason: `Invalid price: ${segPriceMatch[0]}` });
      continue;
    }

    const beforePrice = seg.slice(0, seg.lastIndexOf(segPriceMatch[0])).trim();
    if (!beforePrice) {
      errors.push({ line: si + 1, raw: seg.slice(0, 60), reason: "No player info before price" });
      continue;
    }

    let tokens = beforePrice.split(/[\s\n]+/).filter(Boolean);

    while (tokens.length > 0 && /^\d+\.?$/.test(tokens[0])) {
      tokens = tokens.slice(1);
    }

    tokens = tokens.filter(t => !/^\d+(\.\d+)?%?$/.test(t) || /^\d{4,}$/.test(t));

    const posResult = extractPosition(tokens);
    const position = posResult.position;
    tokens = posResult.remaining;

    const teamResult = extractTeam(tokens);
    const team = teamResult.team;
    tokens = teamResult.remaining;

    const cleanedName = tokens.join(" ").trim().replace(/\s+/g, " ");
    if (!cleanedName || cleanedName.length < 2) {
      errors.push({ line: si + 1, raw: seg.slice(0, 60), reason: "Could not extract player name" });
      continue;
    }

    if (!/[A-Za-z]/.test(cleanedName)) {
      errors.push({ line: si + 1, raw: seg.slice(0, 60), reason: `Name looks invalid: "${cleanedName}"` });
      continue;
    }

    rows.push({
      source_name: cleanedName,
      cleaned_price: price,
      position,
      team,
    });
  }

  return { rows, errors };
}

export function parseCSVText(text: string): ParseResult {
  const lines = text.split("\n");
  const rows: ParsedPriceRow[] = [];
  const errors: ParseError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;

    let name: string | null = null;
    let priceStr: string | null = null;

    const commaParts = raw.split(",");
    if (commaParts.length >= 2) {
      name = commaParts[0].trim().replace(/^"|"$/g, "");
      priceStr = commaParts.slice(1).join(",").trim().replace(/^"|"$/g, "");
    } else {
      const tabParts = raw.split("\t");
      if (tabParts.length >= 2) {
        name = tabParts[0].trim();
        priceStr = tabParts[1].trim();
      } else {
        errors.push({ line: i + 1, raw, reason: "Could not find comma or tab separator" });
        continue;
      }
    }

    if (!name) {
      errors.push({ line: i + 1, raw, reason: "Empty player name" });
      continue;
    }

    const price = priceStr ? cleanPrice(priceStr) : null;
    if (price === null) {
      errors.push({ line: i + 1, raw, reason: `Invalid price: "${priceStr}"` });
      continue;
    }

    rows.push({
      source_name: name,
      cleaned_price: price,
    });
  }

  return { rows, errors };
}

// ── AFL Fantasy players.json parser ─────────────────────────────────────────
//
// Format: JSON array from AFL Fantasy players.json
// [{ id, firstName, lastName, price, averagePoints, lastRoundScore,
//    ownership: [{...}, {value}], roundPriceChange, roundPriceChangePct,
//    position, status, ... }, ...]

export function isJsonInput(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("[") && trimmed.includes('"id"');
}

interface AflFantasyPlayer {
  id?: number;
  firstName?: string;
  lastName?: string;
  price?: number;
  averagePoints?: number;
  lastRoundScore?: number;
  ownership?: Array<{ value?: number }> | number;
  roundPriceChange?: number;
  roundPriceChangePct?: number;
  position?: string | string[];
  status?: string;
}

export function parseJsonPlayersText(text: string): ParseResult {
  const rows: ParsedPriceRow[] = [];
  const errors: ParseError[] = [];

  let players: AflFantasyPlayer[];
  try {
    players = JSON.parse(text);
  } catch {
    errors.push({ line: 1, raw: text.slice(0, 80), reason: "Invalid JSON — could not parse" });
    return { rows, errors };
  }

  if (!Array.isArray(players)) {
    errors.push({ line: 1, raw: "", reason: "Expected a JSON array at the root" });
    return { rows, errors };
  }

  for (let i = 0; i < players.length; i++) {
    const p = players[i];

    const firstName = (p.firstName ?? "").trim();
    const lastName = (p.lastName ?? "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");

    if (!fullName || fullName.length < 2) {
      errors.push({ line: i + 1, raw: JSON.stringify(p).slice(0, 80), reason: "Missing player name" });
      continue;
    }

    const price = typeof p.price === "number" ? p.price : null;
    if (price === null || price < 50_000 || price > 3_000_000) {
      errors.push({ line: i + 1, raw: fullName, reason: `Invalid price: ${p.price}` });
      continue;
    }

    let ownership_pct: number | null = null;
    if (Array.isArray(p.ownership) && p.ownership.length > 0) {
      const last = p.ownership[p.ownership.length - 1];
      ownership_pct = typeof last?.value === "number" ? last.value : null;
    } else if (typeof p.ownership === "number") {
      ownership_pct = p.ownership;
    }

    let position: string | null = null;
    let positions: string[] | null = null;
    if (Array.isArray(p.position)) {
      positions = p.position.map((pos: string) => pos.toUpperCase()).filter((pos: string) => AFL_POSITIONS.includes(pos));
      position = positions[0] ?? null;
    } else if (typeof p.position === "string") {
      const pos = p.position.toUpperCase();
      position = AFL_POSITIONS.includes(pos) ? pos : null;
      positions = position ? [position] : null;
    }

    rows.push({
      source_name: fullName,
      cleaned_price: price,
      position,
      positions: positions && positions.length > 1 ? positions : null,
      team: null,
      external_id: typeof p.id === "number" ? p.id : null,
      avg_points: typeof p.averagePoints === "number" ? p.averagePoints : null,
      last_round_score: typeof p.lastRoundScore === "number" ? p.lastRoundScore : null,
      ownership_pct,
      price_change: typeof p.roundPriceChange === "number" ? p.roundPriceChange : null,
      price_change_pct: typeof p.roundPriceChangePct === "number" ? p.roundPriceChangePct : null,
      status: typeof p.status === "string" ? p.status : null,
    });
  }

  return { rows, errors };
}

export function parseCSVFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      resolve(parseCSVText(text));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function fmtPrice(p: number | null | undefined): string {
  if (p == null) return "—";
  const abs = Math.abs(p);
  const sign = p < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    // >= 1M → 1.126M (3 decimal places)
    return `${sign}$${(abs / 1_000_000).toFixed(3)}M`;
  }
  // < 1M → 853K (no decimals)
  return `${sign}$${Math.floor(abs / 1000)}K`;
}
