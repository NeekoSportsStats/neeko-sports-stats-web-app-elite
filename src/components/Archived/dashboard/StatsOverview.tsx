import { TrendingUp, TrendingDown, Activity, Users } from "lucide-react";

const StatsOverview = () => {
  const stats = [
    {
      label: "Total Matches",
      value: "198",
      change: "+12",
      trend: "up",
      icon: Activity,
    },
    {
      label: "Active Players",
      value: "756",
      change: "+24",
      trend: "up",
      icon: Users,
    },
    {
      label: "Avg Score",
      value: "89.4",
      change: "+2.3",
      trend: "up",
      icon: TrendingUp,
    },
    {
      label: "Goals/Game",
      value: "12.8",
      change: "-0.4",
      trend: "down",
      icon: TrendingDown,
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <div key={index} className="stat-card">
          <div className="flex items-start justify-between mb-4">
            <stat.icon className="h-8 w-8 text-primary" />
            <span
              className={`text-xs font-semibold px-2 py-1 rounded ${
                stat.trend === "up"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              }`}
            >
              {stat.change}
            </span>
          </div>
          <div className="stat-value mb-1">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
  );
};

export default StatsOverview;
