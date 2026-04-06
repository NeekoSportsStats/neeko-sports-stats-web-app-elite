import { useState, useMemo } from "react";
import { Copy, Check, BookOpen, ChevronDown, RefreshCw, MessageSquare, Zap } from "lucide-react";
import useMarketingPlayers from "./useMarketingPlayers";
import { addToLibrary } from "./lib/library";
import { cleanAiText } from "@/utils/cleanAiText";
import type { MarketingPlayer } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "discussion" | "hot_take" | "buy_sell" | "comparison" | "am_i_crazy";
type Tone = "neutral" | "aggressive" | "curious";

interface GeneratedThread {
  post:      string;
  replies:   [string, string, string];
  followups: [string, string];
}

// ─── Mode + tone config ───────────────────────────────────────────────────────

const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: "discussion",  label: "Discussion Starter", desc: "Open-ended post inviting opinions"       },
  { id: "hot_take",    label: "Hot Take",           desc: "Controversial opinion, invite pushback"  },
  { id: "buy_sell",    label: "Buy/Sell Debate",    desc: "Should you pick them up or drop them?"  },
  { id: "comparison",  label: "Player Comparison",  desc: "Compare vs similar tier option"          },
  { id: "am_i_crazy",  label: '"Am I crazy?"',      desc: "Contrarian take, seeking validation"     },
];

const TONES: { id: Tone; label: string }[] = [
  { id: "neutral",    label: "Neutral"    },
  { id: "aggressive", label: "Aggressive" },
  { id: "curious",    label: "Curious"    },
];

// ─── Text helpers ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "?";
  return n.toFixed(decimals);
}

function shortWhy(player: MarketingPlayer): string {
  const raw = player.recommendation_why ?? player.summary_short ?? "";
  const cleaned = cleanAiText(raw);
  // strip to first 1-2 plain sentences, drop anything that sounds like a template
  const sentences = cleaned
    .replace(/\*\*/g, "")
    .replace(/#+\s/g, "")
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 10 && !s.toLowerCase().includes("neeko"))
    .slice(0, 2);
  return sentences.join(" ").trim();
}

function riskLabel(player: MarketingPlayer): string {
  const r = player.risk_rating ?? 0;
  if (r >= 7) return "high risk";
  if (r >= 5) return "moderate risk";
  return "low risk";
}

function valueLabel(player: MarketingPlayer): string {
  const v = player.value_score ?? 0;
  if (v >= 1.2)  return "elite value";
  if (v >= 1.05) return "strong value";
  if (v >= 0.95) return "fair value";
  return "overpriced";
}

function formLabel(player: MarketingPlayer): string {
  const f = player.form_score ?? 0;
  if (f >= 7) return "in decent touch";
  if (f >= 5) return "rolling along okay";
  return "a bit patchy recently";
}

function priceStr(player: MarketingPlayer): string {
  const p = player.price;
  if (!p) return null as unknown as string;
  return `$${(p / 1000).toFixed(0)}k`;
}

function findComparable(player: MarketingPlayer, all: MarketingPlayer[]): MarketingPlayer | null {
  const proj = player.projection_final ?? 0;
  const same = all.filter(
    (p) =>
      p.player_name !== player.player_name &&
      p.position === player.position &&
      p.is_available !== false &&
      p.projection_final != null &&
      Math.abs((p.projection_final ?? 0) - proj) <= 12,
  );
  if (!same.length) return null;
  return same[Math.floor(Math.random() * Math.min(same.length, 5))];
}

// ─── Variation pickers ────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Main generation ──────────────────────────────────────────────────────────

function generateThread(
  player: MarketingPlayer,
  mode: Mode,
  tone: Tone,
  allPlayers: MarketingPlayer[],
): GeneratedThread {
  const name      = player.player_name;
  const proj      = fmt(player.projection_final);
  const ceil      = fmt(player.ceiling);
  const floor     = fmt(player.floor);
  const risk      = riskLabel(player);
  const value     = valueLabel(player);
  const form      = formLabel(player);
  const price     = priceStr(player);
  const why       = shortWhy(player);
  const rec       = (player.ai_recommendation ?? "").toLowerCase();
  const comp      = findComparable(player, allPlayers);
  const compName  = comp?.player_name ?? "another option at this tier";
  const compProj  = fmt(comp?.projection_final);

  // ── POST ────────────────────────────────────────────────────────────────────

  let post = "";

  if (mode === "discussion") {
    if (tone === "neutral") {
      post = pick([
        `Is anyone else going back and forth on ${name} this week?\n\nProjection sits around ${proj} which isn't bad, but the range is pretty wide — could see anything from ${floor} to ${ceil}. ${why ? why + "\n\n" : ""}Not saying don't start him, just feels like there are a few question marks I can't fully ignore.`,
        `How are people feeling about ${name} heading into this round?\n\nNumbers look solid on paper — projecting around ${proj} — but I keep second-guessing it. ${value === "good value" ? "At least the price is reasonable." : "Price feels a bit steep too."}\n\nCurious what others think.`,
        `${name} this week — comfortable or hesitant?\n\nProjection is ~${proj} and he's been ${form}. ${why ? why : ""}\n\nJust want to see if I'm reading this right.`,
      ]);
    } else if (tone === "aggressive") {
      post = pick([
        `Can we talk about ${name} for a second because I think people are sleeping on him.\n\nProjection of ${proj} with ceiling up around ${ceil}? If the role holds that's a genuine week-winner.\n\n${why ? why : "The underlying numbers back it up."}\n\nWho's actually locking him in?`,
        `${name} is a must-start this week and I don't think it's even close.\n\n${proj} projection, upside to ${ceil}, and he's been ${form}. What more do you need?\n\nIf you're benching him you're overthinking it.`,
      ]);
    } else {
      post = pick([
        `Am I reading too much into the ${name} numbers or is there genuinely something interesting here?\n\nProjection of ${proj}, ceiling around ${ceil}. ${why ? why : ""}\n\nJust not sure if I'm seeing something real or making it up. What are other people seeing?`,
        `What's the actual take on ${name} this week?\n\nI've been going back and forth for days. ${proj} projection sounds fine but then I look at the matchup and I'm not so sure.\n\n${why ? why : ""}\n\nHonestly just need someone to help me make a call here.`,
      ]);
    }
  }

  if (mode === "hot_take") {
    if (tone === "neutral") {
      post = pick([
        `Might be wrong on this but I think ${name} is a trap this week.\n\nProjection of ${proj} looks fine on the surface but when you dig in a bit the value isn't really there${price ? ` at ${price}` : ""}. ${why ? why : ""}\n\nFeel like he's one of those picks that gets hyped and then posts 75 when everyone's counting on 110.`,
        `Unpopular opinion: ${name} is being overrated this week.\n\nThe hype doesn't match the underlying numbers. ${risk === "high risk" ? "Risk is legitimately high and people are glossing over that." : ""} ${why ? why : ""}\n\nTake the fade.`,
      ]);
    } else if (tone === "aggressive") {
      post = pick([
        `${name} is a trap. Said it.\n\nEveryone's projecting him around ${proj} but the risk is ${risk} and ${value !== "good value" ? "he's not good value at this price" : "I've seen better spots for him"}. ${why ? why : ""}\n\nThis is exactly the kind of pick that burns captains in crunch rounds. Hard pass.`,
        `I genuinely cannot believe people are still trusting ${name} this week.\n\nProjection at ${proj}, floor at ${floor}. That floor is a problem. ${why ? why : ""}\n\nIf you're playing him you better know what you're getting into.`,
      ]);
    } else {
      post = pick([
        `Is ${name} actually a trap or am I just being paranoid?\n\nProjection looks okay (~${proj}) but I've got this feeling the numbers are a bit generous. ${why ? why : ""}\n\nMaybe I'm overthinking it but something feels off. Anyone else get that?`,
        `Something about ${name} this week is making me nervous and I can't put my finger on it.\n\nOn paper he's fine — ${proj} projection, ${form} — but there's something about the setup that doesn't sit right.\n\n${why ? why : ""}\n\nMight just be instinct but I'm probably fading.`,
      ]);
    }
  }

  if (mode === "buy_sell") {
    const isBuy = rec.includes("buy") || rec.includes("hold");
    if (tone === "neutral") {
      post = pick([
        `Buy or sell ${name} at ${price ?? "current price"}?\n\nProjecting around ${proj} and been ${form}. ${why ? why : ""}\n\nI keep going back and forth. At ${price ?? "this price"} it's not like you're paying a massive premium, but if he underperforms a few times the price won't hold.\n\nWhat's the call?`,
        `Trade question — is ${name} a buy, hold, or sell right now?\n\n${proj} projection, ${value}, ${risk} profile. ${why ? why : ""}\n\nI feel like the window to ${isBuy ? "buy" : "sell"} might be closing. What are people doing?`,
      ]);
    } else if (tone === "aggressive") {
      post = pick([
        `${isBuy ? "BUY" : "SELL"} ${name} now. Posting this so I'm accountable.\n\n${proj} projection, ${value}. ${why ? why : ""}\n\nIf you're sitting on the fence you're going to miss the move. The numbers are clear.`,
        `Strong ${isBuy ? "buy" : "sell"} on ${name} this week — price is going ${isBuy ? "up" : "down"}.\n\n${why ? why : `Projecting ${proj} and the value play is obvious.`}\n\nDon't overthink it.`,
      ]);
    } else {
      post = pick([
        `Genuinely curious — are people buying or selling ${name} right now?\n\nProjection of ~${proj} and ${value} at ${price ?? "this price"}. ${why ? why : ""}\n\nI can see both sides and that's kind of the problem. What are you doing with him?`,
        `Is the ${isBuy ? "buy" : "sell"} window on ${name} closing?\n\n${why ? why : `Projecting ${proj}.`}\n\nFeel like if I don't make a move soon I'm going to miss it and just end up with a mediocre outcome either way.`,
      ]);
    }
  }

  if (mode === "comparison") {
    if (tone === "neutral") {
      post = pick([
        `${name} or ${compName} this week? Can't decide.\n\n${name} is projecting ~${proj}, ${compName} is around ${compProj}. ${name} has the higher ceiling but ${compName} feels more reliable.\n\n${why ? why + "\n\n" : ""}I know the "right" answer is probably ${name} on paper but something is making me want to take the safer option. Anyone gone through this?`,
        `Straight swap question — ${name} vs ${compName}?\n\nSimilar tier, different profiles. ${name} at ~${proj}, ${compName} at ~${compProj}.\n\n${why ? why : ""}\n\nI've been flip-flopping on this for a while. Just want to commit.`,
      ]);
    } else if (tone === "aggressive") {
      post = pick([
        `${name} over ${compName} every day of the week.\n\n${proj} vs ${compProj}. The ceiling difference alone makes this a no-brainer.\n\n${why ? why : ""}\n\nStop overthinking the "safe" option.`,
        `If you're picking ${compName} over ${name} this week you're leaving points on the table.\n\nHigher projection, better upside, ${form}. ${why ? why : ""}\n\nBold call but I'm locked in.`,
      ]);
    } else {
      post = pick([
        `Okay I need a second opinion — ${name} or ${compName}?\n\n${name}: ~${proj} projection, ${value}, ${form}.\n${compName}: ~${compProj} projection, different risk profile.\n\n${why ? why + "\n\n" : ""}I feel like I'm going to talk myself into the wrong one. What's the read?`,
        `What am I missing with the ${name} vs ${compName} decision?\n\n${name} projecting higher (~${proj}) but ${compName} feels more consistent.\n\n${why ? why : ""}\n\nMaybe someone can give me a reason to just commit to one.`,
      ]);
    }
  }

  if (mode === "am_i_crazy") {
    if (tone === "neutral") {
      post = pick([
        `Am I crazy for not starting ${name} this week?\n\nEveryone seems to be all over him — projection of ~${proj}, ${form} — but I just can't bring myself to do it.\n\n${why ? why : ""}\n\nMaybe I'm wrong. Probably am. But something about this spot feels off and I can't ignore it.`,
        `Tell me I'm wrong about ${name}.\n\nProjection looks solid (~${proj}), he's ${form}, and the value is ${value}. On paper I should be starting him without thinking.\n\n${why ? why : ""}\n\nBut I've got a bad feeling and I need someone to either confirm I'm crazy or validate it.`,
      ]);
    } else if (tone === "aggressive") {
      post = pick([
        `Fight me on this: ${name} isn't the safe pick everyone thinks he is.\n\n${proj} projection but ${floor} floor and ${risk} profile. ${why ? why : ""}\n\nI keep seeing him in everyone's team and it's making me more confident in the fade, not less.`,
        `I'm benching ${name} this week and I'm going to catch hell for it.\n\n${why ? why : `${proj} projection doesn't tell the whole story.`} Risk is real and I'm not going to ignore it because it's contrarian.\n\nChange my mind.`,
      ]);
    } else {
      post = pick([
        `Is it weird that I'm nervous about ${name} even though the numbers look fine?\n\nProjection of ~${proj}, ${form}, ${value}. Nothing obviously wrong.\n\n${why ? why : ""}\n\nMaybe I'm pattern-matching to a bad memory. Or maybe the gut feeling is picking up something the data isn't showing. Not sure.`,
        `Why can't I just commit to ${name}?\n\nAll the signals say start him — ~${proj} projection, ${form}, ${value}. And yet.\n\n${why ? why : ""}\n\nAnyone else get this paralysis on players that should be obvious?`,
      ]);
    }
  }

  // ── REPLIES ─────────────────────────────────────────────────────────────────

  const agreeReplies = [
    `Yeah I'm kind of in the same boat. ${proj} looks reasonable but there's definitely some variance baked in. Going with it but not feeling great about it.`,
    `This is basically exactly my thought process. The projection is fine but I keep coming back to the floor and wondering if it's worth it.`,
    `Same. I've been going back and forth and I think I've landed on starting him but it's not a confident decision.`,
    `Honestly I've been sitting on this all week and I think you're right. Something about the setup doesn't feel clean.`,
    `Yeah the numbers look okay on paper but the underlying stuff is a bit murky. I get why you're uncertain.`,
  ];

  const counterReplies = [
    `I actually think you're overthinking it. ${proj} projection with that ceiling is a fairly clear start in most formats.`,
    `Disagree a bit here. The risk stuff is real but the upside justifies it. You're not going to find a clean pick at this price point.`,
    `Counter: the form has been solid enough that I think the floor is higher than people are pricing in. I'm locking him in.`,
    `I've had this guy on my watchlist all week and I'm going the other way — full confidence. The projection is conservative if anything.`,
    `Respectfully pushing back. The value at this price is actually pretty good and I think the "trap" narrative is doing more harm than good.`,
  ];

  const neutralReplies = [
    `The way I'm thinking about it — if the projection holds he's a solid mid-tier pick. If the floor comes in you're not catastrophically hurt. Somewhere in the middle.`,
    `Probably comes down to your team structure. If you've got cover he's fine as a flex. If you need a big score he might not be the guy.`,
    `Worth noting the ceiling is ${ceil} so there is genuine upside. Just depends how much variance you can handle in your lineup.`,
    `I think both perspectives have merit here. He's not a must-start but he's also not an obvious fade. Context-dependent.`,
    `From what I can see the numbers are legitimately in that "fine but not exciting" zone. Whether that's good enough depends on your roster.`,
  ];

  const replies: [string, string, string] = [
    pick(agreeReplies),
    pick(counterReplies),
    pick(neutralReplies),
  ];

  // ── FOLLOW-UPS ───────────────────────────────────────────────────────────────

  const followupPool = [
    `What are people seeing that I'm missing here? Genuinely asking.`,
    `Is this just overthinking it or is there actually something to this?`,
    `Anyone changed their mind on him in the last day or two based on anything?`,
    `What's the worst-case scenario look like if this goes wrong? That's what I keep coming back to.`,
    `Is anyone else in the same spot or am I the only one who can't commit?`,
    `How confident is everyone actually feeling — like honest answer, not just the pick?`,
  ];

  const f1 = pick(followupPool);
  const f2 = pick(followupPool.filter((f) => f !== f1));
  const followups: [string, string] = [f1, f2];

  return { post, replies, followups };
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/40"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── Thread output block ──────────────────────────────────────────────────────

function ThreadBlock({
  thread,
  playerName,
  onSave,
}: {
  thread: GeneratedThread;
  playerName: string;
  onSave: () => void;
}) {
  const fullPack = [
    "POST:",
    thread.post,
    "",
    "REPLIES:",
    `1. ${thread.replies[0]}`,
    `2. ${thread.replies[1]}`,
    `3. ${thread.replies[2]}`,
    "",
    "FOLLOW-UPS:",
    `1. ${thread.followups[0]}`,
    `2. ${thread.followups[1]}`,
  ].join("\n");

  return (
    <div className="space-y-4">
      {/* Main Post */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold">Main Post</p>
          </div>
          <CopyButton text={thread.post} />
        </div>
        <div className="px-4 py-3">
          <pre className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans">
            {thread.post}
          </pre>
        </div>
      </div>

      {/* Replies */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold">Comment Replies</p>
          </div>
          <CopyButton text={thread.replies.map((r, i) => `${i + 1}. ${r}`).join("\n\n")} label="Copy All" />
        </div>
        <div className="divide-y divide-border/40">
          {([
            { reply: thread.replies[0], label: "Agree",    accent: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
            { reply: thread.replies[1], label: "Counter",  accent: "text-red-500",    bg: "bg-red-50 dark:bg-red-900/20"     },
            { reply: thread.replies[2], label: "Neutral",  accent: "text-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20"   },
          ] as { reply: string; label: string; accent: string; bg: string }[]).map(({ reply, label, accent, bg }) => (
            <div key={label} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${bg} ${accent}`}>
                  {label}
                </span>
                <CopyButton text={reply} />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{reply}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Follow-ups */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
          <p className="text-xs font-semibold">Follow-up Questions</p>
          <CopyButton text={thread.followups.join("\n\n")} label="Copy All" />
        </div>
        <div className="divide-y divide-border/40">
          {thread.followups.map((fq, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 gap-3">
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">{fq}</p>
              <CopyButton text={fq} />
            </div>
          ))}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <CopyButton text={fullPack} label="Copy Full Thread Pack" />
        <button
          onClick={onSave}
          className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Save to Library
        </button>
      </div>
    </div>
  );
}

// ─── Player selector ──────────────────────────────────────────────────────────

function PlayerSelect({
  players,
  value,
  onChange,
}: {
  players: MarketingPlayer[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const search = q.toLowerCase().trim();
    if (!search) return players.slice(0, 40);
    return players
      .filter(
        (p) =>
          p.player_name.toLowerCase().includes(search) ||
          p.team.toLowerCase().includes(search),
      )
      .slice(0, 30);
  }, [players, q]);

  const selected = players.find((p) => p.player_name === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-border rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors text-left"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.player_name : "Select player..."}
        </span>
        {selected && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {selected.team} · {fmt(selected.projection_final)} proj
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 top-full mt-1 w-full bg-background border border-border rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Search player or team..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-border rounded-md bg-muted/10 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-border/30">
            {filtered.map((p) => (
              <button
                key={p.player_name}
                onClick={() => { onChange(p.player_name); setOpen(false); setQ(""); }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors text-left"
              >
                <div>
                  <p className="text-xs font-medium">{p.player_name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.team} · {p.position}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">{fmt(p.projection_final)} proj</p>
                  {p.ai_recommendation && (
                    <p className="text-[9px] text-muted-foreground/60 capitalize">{p.ai_recommendation}</p>
                  )}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No players found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RedditEngine() {
  const { players, loading } = useMarketingPlayers();

  const [selectedName, setSelectedName] = useState("");
  const [mode, setMode]                 = useState<Mode>("discussion");
  const [tone, setTone]                 = useState<Tone>("neutral");
  const [thread, setThread]             = useState<GeneratedThread | null>(null);
  const [saved, setSaved]               = useState(false);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.player_name === selectedName) ?? null,
    [players, selectedName],
  );

  function generate() {
    if (!selectedPlayer) return;
    setSaved(false);
    setThread(generateThread(selectedPlayer, mode, tone, players));
  }

  function regenerate() {
    if (!selectedPlayer) return;
    setSaved(false);
    setThread(generateThread(selectedPlayer, mode, tone, players));
  }

  function saveToLibrary() {
    if (!thread || !selectedPlayer) return;
    const fullPack = [
      "POST:",
      thread.post,
      "",
      "REPLIES:",
      thread.replies.map((r, i) => `${i + 1}. ${r}`).join("\n"),
      "",
      "FOLLOW-UPS:",
      thread.followups.map((f, i) => `${i + 1}. ${f}`).join("\n"),
    ].join("\n");
    addToLibrary({
      type:     "script",
      title:    `Reddit — ${selectedPlayer.player_name} (${MODES.find((m) => m.id === mode)?.label})`,
      content:  fullPack,
      player:   selectedPlayer.player_name,
      tags:     ["reddit", "conversation", mode, tone],
      status:   "idea",
      platform: "reddit",
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const canGenerate = !!selectedPlayer;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Reddit Conversation Engine
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate natural Reddit posts, comment replies, and follow-up questions from live player data.
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-border bg-card">

        {/* Player */}
        <div className="sm:col-span-3 space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Player
          </label>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading players...
            </div>
          ) : (
            <PlayerSelect players={players} value={selectedName} onChange={setSelectedName} />
          )}
        </div>

        {/* Mode */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Mode
          </label>
          <div className="space-y-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors text-xs ${
                  mode === m.id
                    ? "border-foreground/40 bg-foreground/5 font-semibold"
                    : "border-border hover:border-foreground/20 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="font-medium">{m.label}</span>
                <span className="block text-[10px] text-muted-foreground/60 mt-0.5">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tone */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Tone
          </label>
          <div className="space-y-1">
            {TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors text-xs ${
                  tone === t.id
                    ? "border-foreground/40 bg-foreground/5 font-semibold"
                    : "border-border hover:border-foreground/20 text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Player card preview */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Player Data
          </label>
          {selectedPlayer ? (
            <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2 text-xs">
              <div>
                <p className="font-semibold">{selectedPlayer.player_name}</p>
                <p className="text-muted-foreground">{selectedPlayer.team} · {selectedPlayer.position}</p>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div><span className="text-muted-foreground/60">Proj</span><span className="ml-1 font-medium">{fmt(selectedPlayer.projection_final)}</span></div>
                <div><span className="text-muted-foreground/60">Ceil</span><span className="ml-1 font-medium">{fmt(selectedPlayer.ceiling)}</span></div>
                <div><span className="text-muted-foreground/60">Floor</span><span className="ml-1 font-medium">{fmt(selectedPlayer.floor)}</span></div>
                <div><span className="text-muted-foreground/60">Value</span><span className="ml-1 font-medium">{fmt(selectedPlayer.value_score)}</span></div>
              </div>
              {selectedPlayer.ai_recommendation && (
                <p className="text-[10px] capitalize text-muted-foreground/70 border-t border-border pt-1.5">
                  {selectedPlayer.ai_recommendation}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 flex items-center justify-center text-muted-foreground/40 text-xs">
              Select a player
            </div>
          )}
        </div>

      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={!canGenerate}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        <Zap className="h-4 w-4" />
        Generate Thread
      </button>

      {/* Output */}
      {thread && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Generated Thread
            </p>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-[11px] text-emerald-500 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved to Library
                </span>
              )}
              <button
                onClick={regenerate}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className="h-3 w-3" /> Regenerate
              </button>
            </div>
          </div>
          <ThreadBlock
            thread={thread}
            playerName={selectedPlayer?.player_name ?? ""}
            onSave={saveToLibrary}
          />
        </div>
      )}

      {/* Empty state */}
      {!thread && canGenerate && (
        <div className="flex items-center justify-center py-12 rounded-xl border border-dashed border-border text-muted-foreground/40 text-xs">
          Hit Generate to build the thread
        </div>
      )}
      {!thread && !canGenerate && (
        <div className="flex items-center justify-center py-12 rounded-xl border border-dashed border-border text-muted-foreground/40 text-xs">
          Select a player to get started
        </div>
      )}

    </div>
  );
}
