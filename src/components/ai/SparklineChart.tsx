import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface SparklineChartProps {
  data: number[];
  labels?: string[];
  mini?: boolean;
  color?: string;
}

export const SparklineChart = ({ data, labels, mini = false, color = "hsl(var(--primary))" }: SparklineChartProps) => {
  const cleanPairs = data
    .map((v, i) => ({ v, label: labels?.[i] ?? String(i + 1) }))
    .filter(({ v }) => typeof v === "number" && !isNaN(v) && isFinite(v));

  if (cleanPairs.length < 2) {
    return (
      <div className={`flex items-center justify-center ${mini ? "w-[60px] h-[30px]" : "w-full h-[185px]"}`}>
        <p className="text-[10px] text-muted-foreground">Insufficient data</p>
      </div>
    );
  }

  const chartData = cleanPairs.map(({ v, label }, index) => ({ index, value: v, label }));

  if (mini) {
    return (
      <ResponsiveContainer width={60} height={30}>
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const n = chartData.length;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const tickIndices: number[] = n <= 1 ? [0] : isMobile
    ? [0, Math.floor((n - 1) / 2), n - 1]
    : chartData.map((_, i) => i);

  return (
    <ResponsiveContainer width="100%" height={185}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="label"
          tickFormatter={(val: string, idx: number) => tickIndices.includes(idx) ? val : ""}
          tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={0}
          height={16}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
          width={32}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const pt = payload[0].payload;
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">Round</span>
                      <span className="font-bold text-muted-foreground">{pt.label}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">Score</span>
                      <span className="font-bold">{payload[0].value}</span>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={3}
          dot={{ fill: color, strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
