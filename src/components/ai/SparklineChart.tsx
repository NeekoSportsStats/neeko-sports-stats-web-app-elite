import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface SparklineChartProps {
  data: number[];
  mini?: boolean;
  color?: string;
}

export const SparklineChart = ({ data, mini = false, color = "hsl(var(--primary))" }: SparklineChartProps) => {
  // Filter out invalid data points
  const cleanData = data.filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v));
  
  // Show insufficient data message if less than 2 points
  if (cleanData.length < 2) {
    return (
      <div className={`flex items-center justify-center ${mini ? 'w-[60px] h-[30px]' : 'w-full h-[300px]'}`}>
        <p className="text-[10px] text-muted-foreground">Insufficient data</p>
      </div>
    );
  }

  const chartData = cleanData.map((value, index) => ({
    index,
    value,
  }));

  if (mini) {
    return (
      <ResponsiveContainer width={60} height={30}>
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <XAxis
          dataKey="index"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}`}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">
                        Game
                      </span>
                      <span className="font-bold text-muted-foreground">
                        {payload[0].payload.index + 1}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">
                        Value
                      </span>
                      <span className="font-bold">
                        {payload[0].value}
                      </span>
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
          dot={{
            fill: color,
            strokeWidth: 2,
            r: 4,
          }}
          activeDot={{
            r: 6,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};