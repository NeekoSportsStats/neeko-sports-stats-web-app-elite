import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ChartBar as BarChart2, Users, Swords, ArrowRight, Lock } from "lucide-react";

interface ModeCard {
  icon: React.ReactNode;
  title: string;
  status: "available" | "coming-soon";
  copy: string;
  href?: string;
}

const MODES: ModeCard[] = [
  {
    icon: <Users className="h-5 w-5" />,
    title: "Player Stats",
    status: "available",
    copy: "Filter by match, stat and threshold to view player hit rates, projections and trends.",
    href: "/stat-board/players",
  },
  {
    icon: <BarChart2 className="h-5 w-5" />,
    title: "Team Stats",
    status: "coming-soon",
    copy: "Team totals, scoring trends and match stat projections.",
  },
  {
    icon: <Swords className="h-5 w-5" />,
    title: "Match Centre",
    status: "coming-soon",
    copy: "Game-by-game summaries, team comparisons and top player stat trends.",
  },
];

export default function StatBoardHubPage() {
  return (
    <>
      <Helmet>
        <title>AFL Stat Board | Neeko Sports Stats</title>
        <meta
          name="description"
          content="Explore AFL player stat trends, hit rates and projections by upcoming match."
        />
      </Helmet>

      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <div className="mx-auto max-w-2xl px-4 pt-10 pb-20">

          {/* ── Hero ── */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 mb-4 rounded-full bg-white/6 border border-white/10 px-3 py-1.5">
              <BarChart2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
              <span className="text-xs font-medium text-white/60 tracking-wide">Stat Board</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white leading-tight">
              AFL Stat Board
            </h1>
            <p className="mt-2 text-base text-white/50 leading-relaxed max-w-md">
              Explore AFL player and team trends, hit rates and projections by match.
            </p>
            <Link
              to="/stat-board/players"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-5 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500/50 transition-colors"
            >
              Open Player Stats
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {/* ── Mode cards ── */}
          <div className="space-y-3">
            {MODES.map((mode) => (
              <ModeCard key={mode.title} mode={mode} />
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

function ModeCard({ mode }: { mode: ModeCard }) {
  const isAvailable = mode.status === "available";

  const inner = (
    <div
      className={`rounded-2xl border px-5 py-5 flex items-start gap-4 transition-colors ${
        isAvailable
          ? "border-white/12 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
          : "border-white/6 bg-white/[0.02] opacity-60"
      }`}
    >
      {/* Icon */}
      <div
        className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-xl ${
          isAvailable ? "bg-emerald-500/15 text-emerald-400" : "bg-white/6 text-white/30"
        }`}
        aria-hidden
      >
        {mode.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-white leading-snug">{mode.title}</h2>
          {isAvailable ? (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/12 rounded-full px-2 py-0.5 leading-none">
              Available
            </span>
          ) : (
            <span className="text-[10px] font-medium text-white/30 bg-white/6 rounded-full px-2 py-0.5 leading-none flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" aria-hidden />
              Coming soon
            </span>
          )}
        </div>
        <p className="text-xs text-white/45 leading-relaxed">{mode.copy}</p>
      </div>

      {/* CTA */}
      <div className="shrink-0 self-center">
        {isAvailable ? (
          <ArrowRight className="h-4 w-4 text-emerald-400/60" aria-hidden />
        ) : (
          <ArrowRight className="h-4 w-4 text-white/15" aria-hidden />
        )}
      </div>
    </div>
  );

  if (isAvailable && mode.href) {
    return (
      <Link to={mode.href} aria-label={`Open ${mode.title}`}>
        {inner}
      </Link>
    );
  }

  return (
    <div aria-label={`${mode.title} — coming soon`} aria-disabled="true">
      {inner}
    </div>
  );
}
