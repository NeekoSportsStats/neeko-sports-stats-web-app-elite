import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PerformanceChart = () => {
  const data = [
    { round: "R1", avgScore: 82, goals: 11 },
    { round: "R2", avgScore: 88, goals: 12 },
    { round: "R3", avgScore: 85, goals: 11.5 },
    { round: "R4", avgScore: 91, goals: 13 },
    { round: "R5", avgScore: 87, goals: 12.5 },
    { round: "R6", avgScore: 93, goals: 13.5 },
    { round: "R7", avgScore: 89, goals: 12.8 },
  ];

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold mb-1">Season Trends</h3>
        <p className="text-sm text-muted-foreground">Average score and goals per round</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="round" 
            tick={{ fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip 
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="avgScore" 
            stroke="hsl(var(--primary))" 
            strokeWidth={3}
            dot={{ fill: "hsl(var(--primary))", r: 4 }}
            name="Avg Score"
          />
          <Line 
            type="monotone" 
            dataKey="goals" 
            stroke="hsl(var(--muted-foreground))" 
            strokeWidth={2}
            dot={{ fill: "hsl(var(--muted-foreground))", r: 3 }}
            name="Goals"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

export default PerformanceChart;
