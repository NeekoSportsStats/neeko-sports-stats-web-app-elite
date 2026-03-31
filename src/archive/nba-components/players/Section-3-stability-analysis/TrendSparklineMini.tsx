import React from "react";

export default function TrendSparklineMini({ values }: { values: number[] }) {
  if (!values?.length) return null;

  const w = 80;
  const h = 22;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * (w - 4) + 2;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="rgba(250,204,21,0.9)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {values.map((v, i) => {
        const x = (i / Math.max(values.length - 1, 1)) * (w - 4) + 2;
        const y = h - ((v - min) / range) * (h - 4) - 2;
        return <circle key={i} cx={x} cy={y} r={1.7} className="fill-yellow-400" />;
      })}
    </svg>
  );
}
