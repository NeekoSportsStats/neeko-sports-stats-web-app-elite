export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;

  const map: Record<string, { label: string; className: string }> = {
    OUT:     { label: "INJURED",     className: "bg-red-500/20 text-red-400 border border-red-500/40" },
    INJURED: { label: "INJURED",     className: "bg-red-500/20 text-red-400 border border-red-500/40" },
    OMITTED: { label: "NOT PLAYING", className: "bg-gray-500/20 text-gray-300 border border-gray-500/40" },
    TEST:    { label: "TEST",        className: "bg-orange-500/20 text-orange-400 border border-orange-500/40" },
    RISK:    { label: "RISK",        className: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40" },
  };

  const config = map[status.toUpperCase()];
  if (!config) return null;

  return (
    <span className={`ml-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full whitespace-nowrap ${config.className}`}>
      {config.label}
    </span>
  );
}
