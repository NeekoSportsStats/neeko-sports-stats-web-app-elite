import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  color?: string;
}

const Sparkline = ({ data, color = "hsl(var(--primary))" }: SparklineProps) => {
  // Filter out invalid data points
  const cleanData = data.filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v));
  
  // Show insufficient data message if less than 2 points
  if (cleanData.length < 2) {
    return (
      <div className="w-[80px] h-[30px] flex items-center justify-center">
        <p className="text-[10px] text-muted-foreground">N/A</p>
      </div>
    );
  }

  const chartData = cleanData.map((value, index) => ({ index, value }));

  return (
    <ResponsiveContainer width={80} height={30}>
      <LineChart data={chartData}>
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke={color} 
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default Sparkline;
