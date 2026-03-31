function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/8 ${className}`} />;
}

function Card({ className = "", rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div className={`rounded-xl border border-white/8 bg-white/4 p-4 space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Bar key={i} className={`h-3 ${i === 0 ? "w-2/3" : i % 2 === 0 ? "w-full" : "w-5/6"}`} />
      ))}
    </div>
  );
}

export function SkeletonHeader() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-3">
      <Bar className="h-6 w-40" />
      <Bar className="h-3 w-64" />
    </div>
  );
}

export function SkeletonFilterBar() {
  return (
    <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
      {[80, 96, 72, 88, 64].map((w, i) => (
        <div
          key={i}
          className="animate-pulse flex-shrink-0 h-8 rounded-full bg-white/8"
          style={{ width: `${w}px` }}
        />
      ))}
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/6">
      <Bar className="h-8 w-8 rounded-full flex-shrink-0" />
      <Bar className="h-3 flex-1 max-w-[140px]" />
      <Bar className="h-3 w-10 ml-auto" />
      <Bar className="h-3 w-10" />
      <Bar className="h-3 w-10" />
    </div>
  );
}

export function SkeletonGrid({ cols = 2, cards = 6 }: { cols?: number; cards?: number }) {
  return (
    <div
      className="grid gap-3 px-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i} rows={3} />
      ))}
    </div>
  );
}

export function SkeletonStatTiles() {
  return (
    <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-2">
          <Bar className="h-3 w-16" />
          <Bar className="h-7 w-20" />
          <Bar className="h-2 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonMatchCard() {
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Bar className="h-3 w-24" />
        <Bar className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center gap-3">
        <Bar className="h-8 w-8 rounded-full" />
        <Bar className="h-4 w-20" />
        <Bar className="h-6 w-12 mx-auto rounded" />
        <Bar className="h-4 w-20" />
        <Bar className="h-8 w-8 rounded-full" />
      </div>
      <Bar className="h-2 w-full rounded-full" />
    </div>
  );
}

export function SkeletonChartPanel() {
  return (
    <div className="rounded-xl border border-white/8 bg-white/4 p-4 space-y-3">
      <Bar className="h-4 w-32" />
      <div className="h-40 flex items-end gap-1 pt-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse flex-1 rounded-t bg-white/8"
            style={{ height: `${30 + Math.sin(i) * 20 + (i % 3) * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}
