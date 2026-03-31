import {
  SkeletonHeader,
  SkeletonFilterBar,
  SkeletonTableRow,
  SkeletonGrid,
  SkeletonStatTiles,
  SkeletonMatchCard,
  SkeletonChartPanel,
} from "./SkeletonShell";

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black pb-12 space-y-4">
      {children}
    </div>
  );
}

export function PlayersPageSkeleton() {
  return (
    <PageShell>
      <SkeletonHeader />
      <SkeletonFilterBar />
      <SkeletonStatTiles />
      <div className="px-4 mt-2 space-y-0 divide-y divide-white/6 rounded-xl border border-white/8 overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonTableRow key={i} />
        ))}
      </div>
    </PageShell>
  );
}

export function TeamsPageSkeleton() {
  return (
    <PageShell>
      <SkeletonHeader />
      <SkeletonFilterBar />
      <SkeletonStatTiles />
      <SkeletonGrid cols={2} cards={8} />
    </PageShell>
  );
}

export function MatchCentreSkeleton() {
  return (
    <PageShell>
      <SkeletonHeader />
      <SkeletonFilterBar />
      <div className="px-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonMatchCard key={i} />
        ))}
      </div>
    </PageShell>
  );
}

export function AIInsightsSkeleton() {
  return (
    <PageShell>
      <SkeletonHeader />
      <SkeletonFilterBar />
      <div className="px-4 space-y-3">
        <SkeletonChartPanel />
        <SkeletonStatTiles />
        <SkeletonChartPanel />
        <div className="space-y-0 divide-y divide-white/6 rounded-xl border border-white/8 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonTableRow key={i} />
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export function GenericPageSkeleton() {
  return (
    <PageShell>
      <SkeletonHeader />
      <div className="px-4 space-y-3">
        <div className="animate-pulse h-32 rounded-xl bg-white/4 border border-white/8" />
        <div className="animate-pulse h-3 w-3/4 rounded bg-white/8" />
        <div className="animate-pulse h-3 w-1/2 rounded bg-white/8" />
        <div className="animate-pulse h-3 w-5/6 rounded bg-white/8" />
        <div className="animate-pulse h-3 w-2/3 rounded bg-white/8" />
      </div>
    </PageShell>
  );
}
