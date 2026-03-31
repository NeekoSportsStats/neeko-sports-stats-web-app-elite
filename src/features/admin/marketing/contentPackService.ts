import type { ContentOpportunity, ContentCategory } from "./opportunitiesService";

export interface ContentPack {
  tiktok: string;
  instagram: string;
  twitter: string;
  reddit: string;
  hooks: string[];
}

const fmt = (n: number | null, suffix = "") =>
  n != null ? `${Math.round(Number(n))}${suffix}` : "—";

const fmtDec = (n: number | null, dp = 1, suffix = "") =>
  n != null ? `${Number(n).toFixed(dp)}${suffix}` : "—";

const fmtPrice = (n: number | null) =>
  n != null ? `$${(Number(n) / 1000).toFixed(0)}k` : "—";

const fmtPriceChange = (n: number | null) => {
  if (n == null || n === 0) return null;
  return `${n > 0 ? "+" : ""}$${(Math.abs(n) / 1000).toFixed(0)}k`;
};

const CATEGORY_LABELS: Record<ContentCategory, { emoji: string; tag: string; cta: string }> = {
  captain:  { emoji: "⭐", tag: "CAPTAIN PICK",    cta: "Lock him in. Back your data." },
  breakout: { emoji: "💥", tag: "BREAKOUT ALERT",  cta: "Get on before it's too late." },
  value:    { emoji: "💎", tag: "VALUE PICK",       cta: "This is the edge. Use it." },
  trap:     { emoji: "🪤", tag: "TRAP ALERT",       cta: "Patience wins. Don't get burned." },
  momentum: { emoji: "📈", tag: "HOT FORM",         cta: "The form is real. Act accordingly." },
  sell:     { emoji: "📉", tag: "SELL SIGNAL",      cta: "Don't hold the bag. Move smart." },
};

function statBlock(opp: ContentOpportunity): string {
  const lines: string[] = [];
  if (opp.projection != null)    lines.push(`→ Projection: ${fmt(opp.projection, " pts")}`);
  if (opp.ceiling != null)       lines.push(`→ Ceiling: ${fmt(opp.ceiling, " pts")}`);
  if (opp.floor != null)         lines.push(`→ Floor: ${fmt(opp.floor, " pts")}`);
  if (opp.value_score != null)   lines.push(`→ Value Score: ${fmtDec(opp.value_score, 1)}`);
  if (opp.form_score != null)    lines.push(`→ Form: ${fmt(opp.form_score)} / 100`);
  if (opp.risk_rating != null)   lines.push(`→ Risk: ${fmt(opp.risk_rating)}`);
  if (opp.price != null)         lines.push(`→ Price: ${fmtPrice(opp.price)}`);
  const pc = fmtPriceChange(opp.price_change);
  if (pc)                        lines.push(`→ Price Change: ${pc}`);
  return lines.join("\n");
}

export function generateContentPack(opp: ContentOpportunity): ContentPack {
  const { emoji, tag, cta } = CATEGORY_LABELS[opp.category];
  const name = opp.player_name;
  const team = opp.team;
  const proj = fmt(opp.projection, " pts");
  const ceil = fmt(opp.ceiling, " pts");
  const val = fmtDec(opp.value_score, 1);
  const form = fmt(opp.form_score);
  const risk = fmt(opp.risk_rating);
  const price = fmtPrice(opp.price);
  const upside = opp.upside_pct != null ? `${Math.round(opp.upside_pct)}%` : "—";
  const ai = opp.summary_short ?? "";
  const stats = statBlock(opp);

  const tiktok = `${emoji} ${tag}: ${name} (${team})

${opp.category === "captain" ? `Neeko's data has him locked in as a top C this week.` :
  opp.category === "breakout" ? `The signs are all there. This could be the week.` :
  opp.category === "value" ? `Premium output at a price that makes no sense.` :
  opp.category === "trap" ? `Everyone's rushing in. Here's why you should wait.` :
  opp.category === "momentum" ? `The form is on fire right now.` :
  `Here's why you should consider trading him out.`}

${stats}

${ai ? `Neeko says: "${ai}"` : ""}

${cta}

#AFLFantasy #NeekoSports #${tag.replace(/ /g, "")}`;

  const instagram = `${emoji} ${tag} — ${name}

${ai ? `"${ai}"` : `${opp.category === "captain" ? `Captain locked.` : opp.category === "breakout" ? `Breakout incoming.` : opp.category === "value" ? `The value gap is impossible to ignore.` : opp.category === "trap" ? `Fade this one.` : opp.category === "momentum" ? `Form is the story.` : `Cut your losses.`}`}

${stats}

${cta}

#AFLFantasy #NeekoSports #AFL`;

  const twitter = [
    `${emoji} ${tag}: ${name} (${team})`,
    "",
    opp.projection != null ? `Projection: ${proj}` : "",
    opp.ceiling != null ? `Ceiling: ${ceil}` : "",
    opp.value_score != null ? `Value: ${val}` : "",
    opp.form_score != null ? `Form: ${form}/100` : "",
    "",
    ai ? `"${ai}"` : "",
    "",
    cta,
    "",
    `#AFLFantasy #NeekoSports`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const reddit = `**${tag}: ${name} (${team})**

${opp.category === "captain" ? `Neeko's model has ${name} as a top captain option based on the numbers below. Here's the full breakdown.` :
  opp.category === "breakout" ? `${name} is flashing breakout signals this week. Here's why Neeko has him flagged.` :
  opp.category === "value" ? `${name} is one of the most underpriced players in the game right now. The data makes the case.` :
  opp.category === "trap" ? `${name} is getting popular but Neeko's model is fading him. Here's the full picture.` :
  opp.category === "momentum" ? `${name} is in the best form of the season. Here's what the data shows.` :
  `Neeko's model is calling ${name} a sell. Here's the case for moving him on.`}

**Stats:**

${stats}

${ai ? `**Neeko AI:** ${ai}` : ""}

---

*Data sourced from Neeko Sports — AFL Fantasy analytics.*`;

  const hooks = generateHooks(opp);

  return { tiktok, instagram, twitter, reddit, hooks };
}

export function generateHooks(opp: ContentOpportunity): string[] {
  const name = opp.player_name;
  const proj = fmt(opp.projection, " pts");
  const ceil = fmt(opp.ceiling, " pts");
  const price = fmtPrice(opp.price);
  const form = fmt(opp.form_score);
  const upside = opp.upside_pct != null ? `${Math.round(opp.upside_pct)}%` : null;

  const hookSets: Record<ContentCategory, string[]> = {
    captain: [
      `One captain call. One player. ${name}. Projected ${proj}. Let the data decide.`,
      `If you're not captaining ${name} this week, what are you doing? Proj ${proj}, ceiling ${ceil}.`,
      `${name} is Neeko's top captain pick. The model doesn't lie.`,
      `Captain ${name} or leave points on the board. Projection ${proj}. Ceiling ${ceil}. Simple.`,
      `The captain decision is easy this week. ${name}. ${proj} projection. Form ${form}/100.`,
    ],
    breakout: [
      `${name} is about to EXPLODE. Ceiling of ${ceil} — the model is screaming breakout.`,
      `Form ${form}/100. Ceiling ${ceil}. ${name} is locked and loaded.`,
      `Breakout incoming. ${name} has been building to this. Don't miss the moment.`,
      upside ? `${upside} upside. ${name} is the highest-ceiling play this round.` : `${name} is the highest-ceiling play this round. Don't overthink it.`,
      `${name} at ${price} with ${ceil} ceiling? This is the breakout you've been waiting for.`,
    ],
    value: [
      `${name} at ${price} is the biggest value in the game right now.`,
      `Under the radar. Underpriced. ${name} is the value pick you're sleeping on.`,
      `${price} for ${proj} projected. ${name} is the most efficient player in AFL Fantasy.`,
      `The market is wrong about ${name}. Here's the value gap nobody's talking about.`,
      `${name} is mispriced. Projection of ${proj} at just ${price}. The edge is right here.`,
    ],
    trap: [
      `Everyone wants ${name}. Here's why Neeko is fading him.`,
      `${name} looks like value. The model disagrees. Here's the full story.`,
      `The popular move is ${name}. The smart move is to wait. Here's the data.`,
      `Stop chasing ${name}. The risk/reward doesn't add up. Thread below.`,
      `${name} is a trap this week. Risk ${fmt(opp.risk_rating)} with a projection of ${proj}. Don't get burned.`,
    ],
    momentum: [
      `${name} is on fire. Form ${form}/100. The momentum is real.`,
      `Nobody is talking about ${name} enough. ${proj} projection and form ${form}/100.`,
      `${name} is the hottest player in the game right now. Here's the breakdown.`,
      `Form ${form}/100. Price ${price}. ${name} is running hot — and the data backs it.`,
      `You want momentum? ${name}. Form ${form}/100. Projection ${proj}. Get on.`,
    ],
    sell: [
      `Everyone's holding ${name}. The data says sell. Here's why they're wrong.`,
      `${name} looks safe. But the numbers tell a different story. Time to act.`,
      `The hype around ${name} is real. The ceiling is not. Sell before it's too late.`,
      `Neeko's model is flagging ${name} as a sell. Here's the case you need to hear.`,
      `Risk ${fmt(opp.risk_rating)} with projection ${proj}. ${name} is not worth holding. Move on.`,
    ],
  };

  return hookSets[opp.category] ?? [];
}
